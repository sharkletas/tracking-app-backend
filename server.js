require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');
const cors = require('cors');
const { parse } = require('date-fns'); // Reemplaza moment.js con date-fns para manejar fechas

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', true);

const allowedOrigins = [
    'http://localhost:5173', // Frontend local para desarrollo
    'https://tracking-app-frontend.vercel.app' // Frontend en producción
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    allowedHeaders: ['Content-Type', 'Authorization']
    optionsSuccessStatus: 200 // Añadido para manejar OPTIONS request correctamente
}));

// Middlewares
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self';");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Evita que tu sitio sea cargado en un <frame> o <iframe> desde otro dominio
    res.setHeader('X-XSS-Protection', '1; mode=block'); // Activa el filtro XSS y bloquea la página si se detecta un ataque
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); // Fuerza el uso de HTTPS para el sitio y sus subdominios
    next();
});

// Conexión a MongoDB
const uri = process.env.MONGODB_URI;
let db;

const connectToMongoDB = async () => {
    try {
        const client = new MongoClient(uri);
        await client.connect();
        logger.info('Conectado a MongoDB Atlas');
        db = client.db(); // Usar la base de datos predeterminada
    } catch (error) {
        logger.error('Error conectando a MongoDB:', error);
        process.exit(1);
    }
};
connectToMongoDB();

const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

const rateLimit = require('express-rate-limit');

// Shopify's rate limit is 2 requests per second per store, but we'll use a conservative limit here
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1800, // 2 requests per second * 60 seconds * 15 minutes = 1800
    message: "Demasiadas peticiones, por favor intenta de nuevo más tarde"
});

app.use('/api', apiLimiter);

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
    return {
        shopifyOrderId: shopifyOrder.id.toString(),
        shopifyOrderNumber: shopifyOrder.name,
        shopifyOrderLink: `https://admin.shopify.com/store/${process.env.SHOPIFY_STORE_URL}/orders/${shopifyOrder.id}`,
        paymentStatus: shopifyOrder.financial_status || 'Desconocido',
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
            products: (shopifyOrder.line_items || []).map((item) => ({
                productId: item.id.toString(),
                name: item.name,
                quantity: item.quantity,
                weight: item.grams || 0,
                purchaseType: 'Pre-Orden' // Por defecto, se ajustará manualmente
            })),
            totalWeight: shopifyOrder.total_weight || 0,
            providerInfo: [],
        },
        createdAt: new Date(shopifyOrder.created_at),
        updatedAt: new Date(),
        orderType: 'Desconocido' // Establecer como 'Desconocido' por defecto, para ser actualizado manualmente
    };
}

//Requerir validación de Order Model para cada request
const { validateOrder } = require('./src/models/orderModel');

app.post('/webhook/orders/create', async (req, res) => {
    const shopifyOrder = req.body;
    const { error, value } = validateOrder(mapShopifyOrderToMongoModel(shopifyOrder));
    if (error) {
        return res.status(400).json({ error: error.details.map(detail => detail.message) });
    }

    try {
        const insertedId = await insertOrder(value);
        res.status(201).json({ message: 'Orden creada exitosamente', id: insertedId });
    } catch (error) {
        res.status(500).json({ error: 'Error procesando la orden' });
    }
});

async function fetchShopifyOrders(createdAtMin, createdAtMax) {
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const shopifyStoreUrl = process.env.SHOPIFY_STORE_URL;
    
    if (!shopifyAccessToken || !shopifyStoreUrl) {
        throw new Error('Faltan credenciales de Shopify');
    }

    // Construir la URL con los parámetros de tiempo
    const ordersUrl = `https://${shopifyStoreUrl}/admin/api/2023-01/orders.json?created_at_min=${createdAtMin}&created_at_max=${createdAtMax}&status=any&limit=250`;

    try {
        const response = await fetch(ordersUrl, {
            headers: {
                'X-Shopify-Access-Token': shopifyAccessToken,
            }
        });

        if (!response.ok) {
            throw new Error(`Error al obtener órdenes de Shopify: ${response.statusText}`);
        }

        const data = await response.json();
        return data.orders || []; // Shopify devuelve un objeto con una propiedad 'orders'
    } catch (error) {
        logger.error('Error al obtener órdenes de Shopify:', error);
        throw error;
    }
}

// Job Programado para Verificar Cambios
cron.schedule('0 0 1 * *', async () => {
    logger.info('Sincronización automática de órdenes del último mes iniciada');
    try {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        const createdAtMin = lastMonth.toISOString();
        const createdAtMax = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
        
        let page = 1;
        let allOrders = [];
        let hasMore = true;

        while (hasMore) {
            const orders = await fetchShopifyOrders(createdAtMin, createdAtMax, page);
            allOrders = allOrders.concat(orders);
            hasMore = orders.length === 250; // Shopify limita a 250 por página
            if (hasMore) {
                page++;
                await sleep(500); // Añade este retardo de 500ms (0.5 segundos) entre peticiones
            }
        }

        for (const shopifyOrder of allOrders) {
            const orderData = mapShopifyOrderToMongoModel(shopifyOrder);
            await db.collection('orders').updateOne(
                { shopifyOrderId: shopifyOrder.id.toString() },
                { $set: orderData },
                { upsert: true }
            );
        }

        logger.info(`Sincronización automática completada: ${allOrders.length} órdenes procesadas`);
    } catch (error) {
        logger.error('Error en la sincronización automática:', error);
    }
});

// Modifica fetchShopifyOrders para aceptar el parámetro 'page'
async function fetchShopifyOrders(createdAtMin, createdAtMax, page = 1) {
    const ordersUrl = `https://${shopifyStoreUrl}/admin/api/2023-01/orders.json?created_at_min=${createdAtMin}&created_at_max=${createdAtMax}&status=any&limit=250&page=${page}`;
    // ... (el resto de la función permanece igual)
}


// Endpoint para obtener todas las órdenes
app.get('/api/orders', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Página actual, default 1
        const limit = 20; // Número de órdenes por página
        const skip = (page - 1) * limit; // Cuántos documentos saltarse

        const count = await db.collection('orders').countDocuments();
        const orders = await db.collection('orders').find({})
            .skip(skip)
            .limit(limit)
            .toArray();

        res.status(200).json({
            orders: orders,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            hasNextPage: page < Math.ceil(count / limit)
        });
    } catch (error) {
        logger.error('Error al obtener las órdenes:', error);
        res.status(500).json({ message: 'Error al obtener las órdenes' });
    }
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
    logger.error('Error:', err);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Algo inesperado ocurrió',
            status: err.status || 500
        }
    });
});

//Endpoint para sincronizar órdenes manualmente
app.post('/api/sync-orders', async (req, res) => {
    try {
        // Aquí deberías implementar la lógica para sincronizar las órdenes desde Shopify
        // Esto podría ser una versión manual de lo que hace el cron job, o algo similar
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const createdAtMin = lastMonth.toISOString();
        const createdAtMax = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        const orders = await fetchShopifyOrders(createdAtMin, createdAtMax);

        let processedCount = 0;
        for (const shopifyOrder of orders) {
            const orderData = mapShopifyOrderToMongoModel(shopifyOrder);
            await db.collection('orders').updateOne(
                { shopifyOrderId: shopifyOrder.id.toString() },
                { $set: orderData },
                { upsert: true }
            );
            processedCount++;
        }

        res.status(200).json({ message: `Sincronización completada, ${processedCount} órdenes procesadas` });
    } catch (error) {
        logger.error('Error al sincronizar órdenes:', error);
        res.status(500).json({ message: 'Error al sincronizar las órdenes' });
    }
});

process.on('SIGINT', async () => {
    logger.info('Cerrando la conexión a MongoDB...');
    await db.client.close();
    logger.info('Conexión cerrada. Adiós!');
    process.exit(0);
});

// Iniciar el servidor
app.listen(port, () => {
    logger.info(`Servidor corriendo en http://localhost:${port}`);
});

