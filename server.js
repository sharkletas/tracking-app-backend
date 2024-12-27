require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');
const cors = require('cors');
const { parse } = require('date-fns'); // Reemplaza moment.js con date-fns para manejar fechas

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
    'http://localhost:5173', // Frontend local para desarrollo
    'https://tracking-app-frontend.vercel.app' // Frontend en producción
];

// Configuración de CORS
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200 // Añadido para manejar OPTIONS request correctamente
}));

// Middlewares
app.use(express.json());

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

// Función para manejar inserciones en MongoDB
async function insertOrder(orderData) {
    try {
        const result = await db.collection('orders').insertOne(orderData);
        return result.insertedId;
    } catch (error) {
        throw error;
    }
}

// Función para mapear una orden de Shopify a modelo de MongoDB
function mapShopifyOrderToMongoModel(shopifyOrder) {
    // Implementa esta función según tus necesidades
    return {
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
}

app.post('/webhook/orders/create', async (req, res) => {
    const shopifyOrder = req.body;
    try {
        const orderData = mapShopifyOrderToMongoModel(shopifyOrder);
        const insertedId = await insertOrder(orderData);
        res.status(201).json({ message: 'Orden creada exitosamente', id: insertedId });
    } catch (error) {    
        res.status(500).json({ error: 'Error procesando la orden' });
    }
});



// Job Programado para Verificar Cambios
cron.schedule('0 0 1 * *', async () => {
    console.log('Sincronización automática de órdenes del último mes iniciada');
    try {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const createdAtMin = lastMonth.toISOString();
        const createdAtMax = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        // Aquí deberías implementar fetchShopifyOrders
        const orders = await fetchShopifyOrders(createdAtMin, createdAtMax);

        for (const shopifyOrder of orders) {
            const orderData = mapShopifyOrderToMongoModel(shopifyOrder);
            await db.collection('orders').updateOne(
                { shopifyOrderId: shopifyOrder.id.toString() },
                { $set: orderData },
                { upsert: true }
            );
        }

        console.log(`Sincronización automática completada: ${orders.length} órdenes procesadas`);
    } catch (error) {
        console.error('Error en la sincronización automática:', error);
    }
});


// Endpoint para obtener todas las órdenes
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await db.collection('orders').find({}).toArray();
        res.status(200).json(orders);
    } catch (error) {
        console.error('Error al obtener las órdenes:', error);
        res.status(500).json({ message: 'Error al obtener las órdenes' });
    }
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo se rompió!');
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});

// Nota: Implementa la función fetchShopifyOrders según tus necesidades.