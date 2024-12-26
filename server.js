require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const fetch = global.fetch;
const cron = require('node-cron');
const bodyParser = require('body-parser');
const cors = require('cors'); // Importar cors al inicio
const allowedOrigins = [
    'http://localhost:5173', // Frontend local para desarrollo
    'https://tracking-app-frontend.vercel.app' // Frontend en producción
];

const app = express();
const port = process.env.PORT || 3000;

// Configuración de CORS (debe estar al principio)
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true); // Permitir acceso
        } else {
            callback(new Error('Not allowed by CORS')); // Bloquear acceso
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos permitidos
    credentials: true, // Permitir cookies/sesiones si las necesitas
    allowedHeaders: ['Content-Type', 'Authorization'] // Encabezados permitidos
}));

// Middlewares
app.use(express.json()); // Parsear JSON
app.use(bodyParser.urlencoded({ extended: true })); // Parsear datos de formularios

// Conexión a MongoDB
const uri = process.env.MONGODB_URI;
let db;

const connectToMongoDB = async () => {
    try {
        const client = new MongoClient(uri);
        await client.connect();
        console.log('Conectado a MongoDB Atlas');
        db = client.db(); // Usar la base de datos predeterminada
    } catch (error) {
        console.error('Error conectando a MongoDB:', error);
        process.exit(1);
    }
};
connectToMongoDB();

// Rutas
app.get('/health', (req, res) => {
    res.status(200).send('Servidor activo y saludable');
});

app.post('/webhook/orders/create', async (req, res) => {
    const shopifyOrder = req.body;

    try {
        const orderData = {
            shopifyOrderId: shopifyOrder.id.toString(),
            shopifyOrderNumber: shopifyOrder.name,
            shopifyOrderLink: `https://admin.shopify.com/store/${process.env.SHOPIFY_STORE_URL}/orders/${shopifyOrder.id}`,
            paymentStatus: shopifyOrder.display_financial_status,
            trackingInfo: [],
            currentStatus: {
                status: 'new',
                description: 'Nueva Orden Creada',
                updatedAt: new Date(),
            },
            statusHistory: [],
            processingTimeInDual: 0,
            flags: {
                dualDelay: false,
                deliveryDelay: false,
            },
            orderDetails: {
                products: shopifyOrder.line_items.map((item) => ({
                    productId: item.id.toString(),
                    name: item.name,
                    quantity: item.quantity,
                    weight: item.grams || 0,
                    purchaseType: 'Pre-Orden', // Por defecto; se ajusta manualmente
                })),
                totalWeight: shopifyOrder.total_weight || 0,
                providerInfo: [],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await db.collection('orders').insertOne(orderData);
        res.status(201).json({ message: 'Orden creada exitosamente' });
    } catch (error) {
        console.error('Error procesando la orden:', error);
        res.status(500).json({ error: 'Error procesando la orden' });
    }
});

// Más rutas aquí, como /webhook/orders/updated, /webhook/orders/cancelled, etc.

// Job Programado para Verificar Cambios
cron.schedule('*/10 * * * *', async () => {
    console.log('Iniciando verificación de cambios en órdenes...');
    try {
        const orders = await db.collection('orders').find({}).toArray();

        for (const order of orders) {
            const productsByLocation = {};

            // Agrupar productos por sucursal
            order.orderDetails.products.forEach((product) => {
                const location = product.fulfillmentLocation || 'Sin ubicación';
                if (!productsByLocation[location]) {
                    productsByLocation[location] = 0;
                }
                productsByLocation[location] += product.quantity;
            });

            // Actualizar productos agrupados en la base de datos
            await db.collection('orders').updateOne(
                { _id: order._id },
                { $set: { productsByLocation } }
            );
        }
        console.log('Verificación de cambios completada.');
    } catch (error) {
        console.error('Error general verificando cambios en órdenes:', error);
    }
});


// Endpoint para obtener todas las órdenes
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await db.collection('orders').find({}).toArray(); // Obtiene todas las órdenes
        res.status(200).json(orders);
    } catch (error) {
        console.error('Error al obtener las órdenes:', error);
        res.status(500).json({ message: 'Error al obtener las órdenes' });
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
