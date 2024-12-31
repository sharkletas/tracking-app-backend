require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');
const cors = require('cors');
const { parse } = require('date-fns');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// Importación de modelos actualizados
const { validateOrder, orderSchema } = require('./src/models/orderModel');
const { validateProduct } = require('./src/models/productModels');
const { validateTrackingNumber } = require('./src/models/trackingNumbersModels');
const { orderStatusSchema, productStatusSchema } = require('./src/models/statusModels');

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

// Logging para verificar que todas las importaciones están definidas correctamente
logger.info('validateOrder:', validateOrder !== undefined);
logger.info('validateProduct:', validateProduct !== undefined);
logger.info('validateTrackingNumber:', validateTrackingNumber !== undefined);
logger.info('orderStatusSchema:', orderStatusSchema !== undefined);
logger.info('productStatusSchema:', productStatusSchema !== undefined);

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
function mapShopifyOrderToMongoModel(shopifyOrder) {
    const now = new Date();

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
            status: 'Por Procesar',
            description: 'Nueva Orden Creada',
            updatedAt: now,
        },
        statusHistory: [{ status: 'Por Procesar', description: 'Nueva Orden Creada', updatedAt: now }],
        processingTimeInDual: 0,
        flags: {
            dualDelay: false,
            deliveryDelay: false,
        },
        orderDetails: {
            products: (shopifyOrder.line_items || []).map((item) => ({
                productId: item.id ? item.id.toString() : `temp_${item.variant_id || Date.now()}`,
                name: item.name,
                quantity: item.quantity,
                weight: item.grams || 0,
                purchaseType: 'Pre-Orden',
                status: [{ status: 'Por Procesar', updatedAt: now }],
                supplierPO: item.supplierPO || null,
                localInventory: false
            })),
            totalWeight: shopifyOrder.total_weight || 0,
            providerInfo: [], // Este debería ser manualmente actualizado
        },
        createdAt: new Date(shopifyOrder.created_at),
        updatedAt: now,
        orderType: 'Por Definir'
    };

    // Añadir logging para verificar la función de validación y los datos antes de validar
    logger.info('validateOrder:', validateOrder);
    logger.info('orderData antes de validar:', JSON.stringify(orderData, null, 2));

    // Validar la orden
    const { error, value: validatedOrder } = validateOrder(orderData);
    if (error) {
        // Loguear el error detalladamente
        logger.error(`Error al validar la orden: ${JSON.stringify(error.details, null, 2)}`);
        // Lanzar el error con un mensaje más detallado
        throw new Error(`Error al validar la orden: ${error.details.map(detail => detail.message).join(', ')}`);
    }

    // Loguear éxito en la validación
    logger.info('Orden validada exitosamente');
    return validatedOrder;
}

// Insertar o actualizar orden
async function updateOrder(orderData) {
    try {
        logger.info('Datos de la orden a actualizar:', JSON.stringify(orderData, null, 2));
        const result = await db.collection('orderModels').updateOne(
            { shopifyOrderId: orderData.shopifyOrderId },
            { $set: orderData },
            { upsert: true }
        );
        logger.info('Resultado de actualización de orden:', JSON.stringify(result, null, 2));
        return result.upsertedId || orderData.shopifyOrderId;
    } catch (error) {
        logger.error('Error al actualizar la orden:', error);
        throw error;
    }
}

// Insertar o actualizar productos
async function updateProducts(orderData) {
    for (const product of orderData.orderDetails.products) {
        try {
            // Logging para ver los datos del producto antes de cualquier operación
            logger.info('Datos del producto a actualizar:', JSON.stringify(product, null, 2));
            
            // Buscar si el producto ya existe en la base de datos
            const existingProduct = await db.collection('productModels').findOne({ productId: product.productId });
            
            if (!existingProduct) {
                // Si no existe, creamos un nuevo objeto de producto con los datos necesarios
                const productData = {
                    ...product,
                    orders: [orderData.shopifyOrderId],
                    trackingNumbers: []
                };
                
                // Logging antes de validar el producto
                logger.info('Datos del producto a validar:', JSON.stringify(productData, null, 2));
                
                // Validar el producto contra el esquema
                const { error, value } = validateProduct(productData);
                if (error) {
                    // Si hay un error en la validación, lo registramos
                    logger.error(`Error al validar el producto ${product.productId}:`, JSON.stringify(error.details, null, 2));
                } else {
                    // Si la validación es exitosa, insertamos el producto en la base de datos
                    await db.collection('productModels').insertOne(value);
                    logger.info(`Producto ${product.productId} insertado exitosamente`);
                }
            } else {
                // Si el producto ya existe, verificamos si la orden ya está asociada
                if (!existingProduct.orders.includes(orderData.shopifyOrderId)) {
                    // Si no, añadimos la orden al array de órdenes del producto
                    await db.collection('productModels').updateOne(
                        { productId: product.productId },
                        { $push: { orders: orderData.shopifyOrderId } }
                    );
                    logger.info(`Orden ${orderData.shopifyOrderId} añadida al producto ${product.productId}`);
                } else {
                    // Si ya existe, simplemente registramos que no se hizo nada
                    logger.info(`Orden ${orderData.shopifyOrderId} ya existe para el producto ${product.productId}.`);
                }
            }
        } catch (error) {
            // Capturamos cualquier error que ocurra durante el proceso y lo registramos
            logger.error('Error al manejar producto:', error);
        }
    }
}

// Fetch de órdenes desde Shopify
async function fetchShopifyOrders(createdAtMin = null, createdAtMax = null) {
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const shopifyStoreUrl = process.env.SHOPIFY_STORE_URL;
    
    if (!shopifyAccessToken || !shopifyStoreUrl) {
        throw new Error('Faltan credenciales de Shopify');
    }

    // Si no se proporcionan fechas, calculamos los últimos 30 días
    const now = new Date();
    if (!createdAtMin) {
        createdAtMin = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString();
    }
    if (!createdAtMax) {
        createdAtMax = now.toISOString();
    }

    const baseQuery = `created_at_min=${createdAtMin}&created_at_max=${createdAtMax}&status=any&limit=250`;
    let ordersUrl = `https://${shopifyStoreUrl}/admin/api/2023-01/orders.json?${baseQuery}`;

    logger.info('URL de consulta a Shopify:', ordersUrl);

    let allOrders = [];
    let nextLink = ordersUrl;

    while (nextLink) {
        const response = await fetch(nextLink, {
            method: 'GET',
            headers: {
                'X-Shopify-Access-Token': shopifyAccessToken,
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Error al obtener órdenes de Shopify: ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();
        logger.info(`Órdenes obtenidas:`, data.orders.length);
        allOrders = allOrders.concat(data.orders);

        const linkHeader = response.headers.get('link');
        if (linkHeader) {
            const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            nextLink = nextMatch ? nextMatch[1] : null;
        } else {
            nextLink = null;
        }
    }

    logger.info('Total de órdenes obtenidas de Shopify:', allOrders.length);
    return allOrders;
}

// Job Programado para Verificar Cambios
cron.schedule('*/10 * * * *', async () => {
    logger.info('Sincronización automática de órdenes iniciada');
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 días atrás

        const createdAtMin = thirtyDaysAgo.toISOString();
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

        logger.info('Shopify Access Token:', process.env.SHOPIFY_ACCESS_TOKEN);
        logger.info('Shopify Store URL:', process.env.SHOPIFY_STORE_URL);

        const allOrders = await fetchShopifyOrders(createdAtMin, createdAtMax);
        logger.info(`Número de órdenes obtenidas de Shopify: ${allOrders.length}`);

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

        logger.info(`Sincronización manual completada: ${processedCount} órdenes procesadas`);
        res.status(200).json({ message: `Sincronización completada, ${processedCount} órdenes procesadas` });
    } catch (error) {
        logger.error('Error al sincronizar órdenes manualmente:', error);
        res.status(500).json({ message: 'Error al sincronizar las órdenes' });
    }
});

// Endpoint para consolidar productos
app.post('/api/consolidate-products/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        const order = await db.collection('orderModels').findOne({ shopifyOrderId: orderId });
        if (!order) {
            return res.status(404).json({ message: 'Orden no encontrada' });
        }

        // Verificar si todos los productos están en 'Recibido por Sharkletas'
        const allProductsReceived = order.orderDetails.products.every(product => 
            product.status.some(status => status.status === 'Recibido por Sharkletas')
        );

        if (!allProductsReceived) {
            return res.status(400).json({ message: 'No todos los productos están en estado "Recibido por Sharkletas"' });
        }

        // Actualizar el estado de los productos a 'Consolidado'
        const updatedProducts = order.orderDetails.products.map(product => {
            return {
                ...product,
                status: [...product.status, { status: 'Consolidado', updatedAt: new Date() }]
            };
        });

        // Actualizar la orden en la base de datos
        await db.collection('orderModels').updateOne(
            { shopifyOrderId: orderId },
            {
                $set: {
                    'orderDetails.products': updatedProducts,
                    currentStatus: { status: 'Consolidado', description: 'Productos Consolidados', updatedAt: new Date() },
                                        'statusHistory': [...order.statusHistory, { status: 'Consolidado', description: 'Productos Consolidados', updatedAt: new Date() }]
                }
            }
        );

        res.status(200).json({ message: 'Productos consolidados exitosamente', orderId: orderId });
    } catch (error) {
        logger.error(`Error al consolidar productos de la orden ${orderId}:`, error);
        res.status(500).json({ message: 'Error al consolidar productos' });
    }
});

// Endpoint para preparar productos (fulfill items)
app.post('/api/prepare-products/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { trackingNumber } = req.body; // Esperamos que el tracking number venga en el cuerpo de la solicitud

    try {
        const order = await db.collection('orderModels').findOne({ shopifyOrderId: orderId });
        if (!order) {
            return res.status(404).json({ message: 'Orden no encontrada' });
        }

        // Verificar si la orden está en estado 'Consolidado'
        const isConsolidated = order.orderDetails.products.some(product => 
            product.status.some(status => status.status === 'Consolidado')
        );

        if (!isConsolidated) {
            return res.status(400).json({ message: 'La orden no está en estado "Consolidado"' });
        }

        // Validar que se haya enviado un trackingNumber
        if (!trackingNumber) {
            return res.status(400).json({ message: 'Se requiere un número de tracking' });
        }

        // Marcar la orden como 'Preparado' en la base de datos y añadir el tracking number
        await db.collection('orderModels').updateOne(
            { shopifyOrderId: orderId },
            {
                $set: {
                    'fulfillmentStatus.status': 'fulfilled',
                    currentStatus: { status: 'Preparado', description: 'Orden preparada para envío', updatedAt: new Date() },
                    'statusHistory': [...order.statusHistory, { status: 'Preparado', description: 'Orden preparada para envío', updatedAt: new Date() }],
                    'trackingInfo.orderTracking': {
                        carrier: 'Correos de Costa Rica',
                        trackingNumber: trackingNumber
                    }
                }
            }
        );

        res.status(200).json({ message: 'Orden preparada exitosamente', orderId: orderId, trackingNumber: trackingNumber });
    } catch (error) {
        logger.error(`Error al preparar productos de la orden ${orderId}:`, error);
        res.status(500).json({ message: 'Error al preparar productos' });
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

module.exports = app;