require('dotenv').config();
const Joi = require('joi');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;

let db;
let inMemoryStatuses = {};

async function connectToMongoDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db();
        console.log('Conexión a MongoDB establecida');
        await loadStatusesFromDB();
    } catch (error) {
        console.error('Error conectando a MongoDB:', error);
        process.exit(1);
    } finally {
        if (db && db.client) {
            console.log('Cerrando conexión con MongoDB...');
            await db.client.close();
            console.log('Conexión con MongoDB cerrada.');
        }
    }
}

async function loadStatusesFromDB() {
    try {
        const statuses = await db.collection('statuses').find().toArray();
        inMemoryStatuses = statuses.reduce((acc, status) => {
            if (!acc[status.type]) acc[status.type] = {};
            acc[status.type][status.internal] = status.customer;
            return acc;
        }, {});
        console.log('Estados cargados en memoria:', JSON.stringify(inMemoryStatuses, null, 2));
    } catch (error) {
        console.error('Error al cargar estados desde MongoDB:', error);
    }
}

// Importar esquemas de validación
const { validateProduct, productSchema } = require('./src/models/productModels');
const { productStatusSchema } = require('./src/models/statusModels');

async function testProductValidation() {
    try {
        await connectToMongoDB();
        
        // Cargar solo la información de los productos del JSON
        const shopifyOrder = JSON.parse(fs.readFileSync('order5685481013436.json', 'utf8')).order;
        const now = new Date();

        // Mapear solo los productos
        const products = (shopifyOrder.line_items || []).map((item) => ({
            productId: item.id ? item.id.toString() : `temp_${item.variant_id || Date.now()}`,
            name: item.title,
            quantity: item.quantity,
            weight: item.grams || 0,
            purchaseType: 'Por Definir', 
            status: {
                status: 'Por Procesar',
                description: 'Producto recién ingresado en el sistema',
                updatedAt: now // Usar directamente el objeto Date
            },
            supplierPO: '', 
            provider: '', 
        }));

        // Validar cada producto
        products.forEach((product, index) => {
            console.log(`Validando producto ${index + 1}:`, JSON.stringify(product, null, 2));
            const { error, value } = validateProduct(product);
            if (error) {
                console.error(`Errores de validación del producto ${index + 1}:`, JSON.stringify(error.details, null, 2));
            } else {
                console.log(`Producto ${index + 1} validado exitosamente`, JSON.stringify(value, null, 2));
            }
        });
    } catch (error) {
        console.error('Error en la prueba de validación:', error);
    }
}

testProductValidation();