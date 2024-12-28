require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');
const cors = require('cors');
const { parse } = require('date-fns');
const fetch = require('node-fetch'); // Asegúrate de tener esta dependencia instalada

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', true);

const allowedOrigins = [
    'http://localhost:5173', 
    'https://tracking-app-frontend.vercel.app' 
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
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200 
}));

// Middlewares
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self';");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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
        db = client.db();
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

// Función para mapear una orden de Shopify a modelo de MongoDB
const { validateOrder, validateProduct, validateTrackingNumber } = require('./src/models/orderModel');

function mapShopifyOrderToMongoModel(shopifyOrder) {
    const orderData = {
        shopifyOrderId: shopifyOrder.id.toString(),
        shopifyOrderNumber: shopifyOrder.name,
        shopifyOrderLink: `https://admin.shopify.com/store/${process.env.SHOPIFY_STORE_URL}/orders/${shopifyOrder.id}`,
        paymentStatus: shopifyOrder.financial_status || 'pending',
        trackingInfo: {
            orderTracking: {},
            productTrackings: []
        },
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
                productId: item.id ? item.id.toString() : `temp_${item.variant_id || Date.now()}`, // Manejo de product_id null
                name: item.name,
                quantity: item.quantity,
                weight: item.grams || 0,
                purchaseType: 'Pre-Orden' // Por defecto, se ajustará manualmente
            })),
            totalWeight: shopifyOrder.total_weight || 0,
            providerInfo: [], // Este debería ser manualmente actualizado
        },
        createdAt: new Date(shopifyOrder.created_at),
        updatedAt: new Date(),
        orderType: 'Desconocido'
    };

    // Validación de la orden
    const { error, value: validatedOrder } = validateOrder(orderData);
    if (error) {
        throw new Error(`Error al validar la orden: ${error.details.map(detail => detail.message).join(', ')}`);
    }

    return validatedOrder;
}

// Insertar o actualizar orden
async function updateOrder(orderData) {
    try {
        const result = await db.collection('orderModels').updateOne(
            { shopifyOrderId: orderData.shopifyOrderId },
            { $set: orderData },
            { upsert: true }
        );
        return result.upsertedId || orderData.shopifyOrderId;
    } catch (error) {
        throw error;
    }
}

// Insertar o actualizar productos
async function updateProducts(orderData) {
    for (const product of orderData.orderDetails.products) {
        try {
            const existingProduct = await db.collection('productModels').findOne({ productId: product.productId });
            if (!existingProduct) {
                const productData = {
                    ...product,
                    orders: [orderData.shopifyOrderId],
                    trackingNumbers: []
                };
                const { error, value } = validateProduct(productData);
                if (error) {
                    logger.error(`Error al validar el producto ${product.productId}:`, error.details.map(detail => detail.message).join(', '));
                } else {
                    await db.collection('productModels').insertOne(value);
                }
            } else {
                // Verificar si la orden ya está en la lista de órdenes del producto
                if (!existingProduct.orders.includes(orderData.shopifyOrderId)) {
                    await db.collection('productModels').updateOne(
                        { productId: product.productId },
                        { $push: { orders: orderData.shopifyOrderId } }
                    );
                } else {
                    logger.info(`Orden ${orderData.shopifyOrderId} ya existe para el producto ${product.productId}.`);
                }
            }
        } catch (error) {
            logger.error('Error al manejar producto:', error);
        }
    }
}

// Fetch de órdenes desde Shopify
async function fetchShopifyOrders(createdAtMin, createdAtMax, page = 1) {
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const shopifyStoreUrl = process.env.SHOPIFY_STORE_URL;
    
    if (!shopifyAccessToken || !shopifyStoreUrl) {
        throw new Error('Faltan credenciales de Shopify');
    }

    const baseQuery = `created_at_min=${createdAtMin}&created_at_max=${createdAtMax}&status=any&limit=250`;
    let ordersUrl = `https://${shopifyStoreUrl}/admin/api/2023-01/orders.json?${baseQuery}`;

    let allOrders = [];
    let nextLink = ordersUrl; // Inicializa con la URL base

    while (nextLink) {
        const response = await fetch(nextLink, {
            headers: {
                'X-Shopify-Access-Token': shopifyAccessToken,
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Error al obtener órdenes de Shopify: ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();
        allOrders = allOrders.concat(data.orders);

        // Shopify usa encabezados para la paginación
        const linkHeader = response.headers.get('link');
        if (linkHeader) {
            const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            nextLink = nextMatch ? nextMatch[1] : null;
        } else {
            nextLink = null; // No hay más páginas
        }
    }

    return allOrders;
}

// Job Programado para Verificar Cambios
cron.schedule('*/10 * * * *', async () => {
    logger.info('Sincronización automática de órdenes iniciada');
    try {
        const now = new Date();
        const tenMinutesAgo = new Date(now.getTime() - (10 * 60 * 1000)); // 10 minutos atrás

        const createdAtMin = tenMinutesAgo.toISOString();
        const createdAtMax = now.toISOString();
        
        const orders = await fetchShopifyOrders(createdAtMin, createdAtMax);
        
        for (const shopifyOrder of orders) {
            try {
                const orderData = mapShopifyOrderToMongoModel(shopifyOrder);
                const orderId = await updateOrder(orderData);
                await updateProducts(orderData);
                logger.info(`Orden ${orderData.shopifyOrderId} sincronizada exitosamente.`);
            } catch (error) {
                logger.error(`Error al sincronizar la orden ${shopifyOrder.id}:`, error);
            }
        }

        logger.info(`Sincronización automática completada: ${orders.length} órdenes procesadas`);
    } catch (error) {
        logger.error('Error en la sincronización automática:', error);
    }
});

// Endpoint para obtener todas las órdenes
app.get('/api/orders', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Página actual, default 1
        const limit = 20; // Número de órdenes por página
        const skip = (page - 1) * limit; // Cuántos documentos saltarse

        const count = await db.collection('orderModels').countDocuments();
        const orders = await db.collection('orderModels').find({})
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

// Endpoint para sincronizar órdenes manualmente
app.post('/api/sync-orders', async (req, res) => {
    try {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const createdAtMin = lastMonth.toISOString();
        const createdAtMax = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        const allOrders = await fetchShopifyOrders(createdAtMin, createdAtMax); // Usa la función actualizada

        let processedCount = 0;
        for (const shopifyOrder of allOrders) {
            try {
                const orderData = mapShopifyOrderToMongoModel(shopifyOrder);
                await updateOrder(orderData);
                await updateProducts(orderData);
                processedCount++;
            } catch (error) {
                logger.error(`Error al procesar la orden ${shopifyOrder.id}:`, error);
            }
        }

        res.status(200).json({ message: `Sincronización completada, ${processedCount} órdenes procesadas` });
    } catch (error) {
        logger.error('Error al sincronizar órdenes manualmente:', error);
        res.status(500).json({ message: 'Error al sincronizar las órdenes' });
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

// Iniciar el servidor
app.listen(port, () => {
    logger.info(`Servidor corriendo en http://localhost:${port}`);
});

// Manejo de señales para cierre limpio
process.on('SIGINT', async () => {
    logger.info('Cerrando la conexión a MongoDB debido a SIGINT...');
    await db.client.close();
    logger.info('Conexión cerrada. Adiós!');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Cerrando la conexión a MongoDB debido a SIGTERM...');
    await db.client.close();
    logger.info('Conexión cerrada. Adiós!');
    process.exit(0);
});

module.exports = app; // Exportar la app para pruebas o uso en otros scripts si es necesario
       