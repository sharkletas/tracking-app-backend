require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');
const cors = require('cors');
const { parse } = require('date-fns');
const fetch = require('node-fetch');
const apiToken = process.env.API_TOKEN; // Usa el token de la variable de entorno

const { setInMemoryStatuses, getInMemoryStatuses } = require('./src/utils/inMemoryStatuses');

const app = express();
const port = process.env.PORT || 10000;

let db;

app.set('trust proxy', process.env.LOCAL_IP);

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

app.use((req, res, next) => {
    if (req.path.startsWith('/api') && req.headers['x-api-token'] !== apiToken) {
        return res.status(401).json({ message: 'Acceso no autorizado' });
    }
    next();
});

// Conexión a MongoDB
async function connectToMongoDB() {
    try {
        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        db = client.db();
        console.info('Conectado a MongoDB Atlas');
        await loadStatusesFromDB(); // Carga los estados desde la base de datos
    } catch (error) {
        console.error('Error conectando a MongoDB:', error);
        process.exit(1);
    }
}

// Cargar los estados desde MongoDB y almacenarlos en `inMemoryStatuses`
async function loadStatusesFromDB() {
    try {
        const statuses = await db.collection('statuses').find().toArray();
        setInMemoryStatuses(
            statuses.reduce((acc, status) => {
                if (!acc[status.type]) acc[status.type] = {};
                acc[status.type][status.internal] = {
                    customer: status.customer,
                    description: status.customer,
                };
                return acc;
            }, {})
        );
        console.info('Estados cargados en memoria.');
    } catch (error) {
        console.error('Error al cargar estados desde MongoDB:', error);
        setInMemoryStatuses({}); // Fallback a un objeto vacío
    }
}


// Conectar y cargar modelos después de que los estados estén disponibles
connectToMongoDB()
    .then(() => {
        const statuses = getInMemoryStatuses();
        if (!statuses.ORDER || !statuses.PRODUCT) {
            throw new Error('Los estados no están completamente cargados.');
        }

        console.info('Verificando estados cargados:', JSON.stringify(statuses, null, 2));
        
        // Importar modelos después de cargar los estados
        const { validateOrder } = require('./src/models/orderModel');
        const { validateProduct } = require('./src/models/productModels');
        const { validateTrackingNumber } = require('./src/models/trackingNumbersModels');
        const { orderStatusSchema, productStatusSchema } = require('./src/models/statusModels');

        console.info('Modelos cargados exitosamente.');

        // Iniciar el servidor
        app.listen(port, () => {
            console.info(`Servidor corriendo en http://localhost:${port}`);
        });
    })
    .catch((err) => {
        console.error('Fallo al conectar con MongoDB o cargar estados:', err);
        process.exit(1);
    });

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

//Función para comparar datos de MongoDB Atlas vs Shopify API
/**
 * Compara los datos de una orden de Shopify con los de MongoDB.
 * @param {Object} shopifyOrder - Datos de la orden obtenidos desde Shopify.
 * @param {Object} mongoOrder - Datos de la orden almacenados en MongoDB.
 * @returns {boolean} - Retorna true si los datos comparables son iguales, false si hay diferencias.
 */
function compareOrderData(shopifyOrder, mongoOrder) {
    // Definir los campos comparables de primer nivel
    const comparableFields = [
        'shopifyOrderId',
        'shopifyOrderNumber',
        'shopifyOrderLink',
        'paymentStatus',
        'location',
        'createdAt'
    ];

    // Función para comparar objetos simples
    const compareObjects = (obj1, obj2, fields) => {
        for (const field of fields) {
            if (obj1[field] !== obj2[field]) {
                return false;
            }
        }
        return true;
    };

    // Comparar campos de primer nivel
    if (!compareObjects(shopifyOrder, mongoOrder, comparableFields)) {
        return false;
    }

    // Comparar trackingInfo.orderTracking
    if (shopifyOrder.trackingInfo?.orderTracking && mongoOrder.trackingInfo?.orderTracking) {
        const trackingFields = ['trackingNumber', 'carrier'];
        if (!compareObjects(shopifyOrder.trackingInfo.orderTracking, mongoOrder.trackingInfo.orderTracking, trackingFields)) {
            return false;
        }
    }

    // Comparar orderDetails.products
    if (Array.isArray(shopifyOrder.orderDetails?.products) && Array.isArray(mongoOrder.orderDetails?.products)) {
        if (shopifyOrder.orderDetails.products.length !== mongoOrder.orderDetails.products.length) {
            return false;
        }

        for (let i = 0; i < shopifyOrder.orderDetails.products.length; i++) {
            const shopifyProduct = shopifyOrder.orderDetails.products[i];
            const mongoProduct = mongoOrder.orderDetails.products[i];

            // Construir variant_title a partir de color y size en MongoDB
            const mongoVariantTitle = `${mongoProduct.color || ''} / ${mongoProduct.size || ''}`.trim();

            // Campos comparables para productos
            const productFields = [
                'productId',
                'name',
                'quantity',
                'weight',
                'price',
                'vendor'
            ];

            // Comparar los campos simples
            if (!compareObjects(shopifyProduct, mongoProduct, productFields)) {
                return false;
            }

            // Comparar el variant_title de Shopify con los campos combinados de MongoDB
            if (shopifyProduct.variant_title !== mongoVariantTitle) {
                return false;
            }
        }
    }

    // Si todas las comparaciones son iguales, retornar true
    return true;
}

// Función para mapear una orden de Shopify a modelo de MongoDB
function mapShopifyOrderToMongoModel(shopifyOrder, validateOrder) {
    if (!validateOrder) {
        throw new Error('validateOrder no está definido');
    }
    const now = new Date();
    const statuses = getInMemoryStatuses();


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
            status: statuses.PRODUCT['Por Procesar'] ? 'Por Procesar' : Object.keys(statuses.PRODUCT)[0], // Usar 'Por Procesar' si existe, de lo contrario el primer estado disponible
            description: 'Nueva Orden Creada',
            updatedAt: now,
        },
        statusHistory: [{
            status: statuses.PRODUCT['Por Procesar'] ? 'Por Procesar' : Object.keys(statuses.PRODUCT)[0],
            description: 'Nueva Orden Creada',
            updatedAt: now
        }],
        orderDetails: {
            products: (shopifyOrder.line_items || []).map((item) => {
                const [color, sizeInfo] = (item.variant_title ? item.variant_title.split('/').map(v => v.trim()) : ['', '']);
                const size = sizeInfo ? sizeInfo.split('|')[0].trim() : '';

                return {
                    productId: item.id ? item.id.toString() : `temp_${item.variant_id || Date.now()}`,
                    name: item.title,
                    quantity: item.quantity,
                    weight: item.grams || 0,
                    purchaseType: 'Por Definir',
                    status: {
                        status: statuses.PRODUCT['Por Procesar'] ? 'Por Procesar' : Object.keys(statuses.PRODUCT)[0],
                        description: 'Producto recién ingresado en el sistema',
                        updatedAt: now
                    },
                    color: color || '', 
                    size: size || '',  
                };
            }),
            totalWeight: shopifyOrder.total_weight || 0,
            providerInfo: []
        },
        productIds: (shopifyOrder.line_items || []).map(item => item.product_id.toString()),
        location: shopifyOrder.location_id === '70713934012' ? 'Sharkletas HQ' : 'CJ Dropshipping China Warehouse',
        createdAt: new Date(shopifyOrder.created_at),
        updatedAt: now,
        orderType: 'Por Definir'
    };

    logger.info('validateOrder:', validateOrder);
    logger.info('orderData antes de validar:', JSON.stringify(orderData, null, 2));

    const { error, value: validatedOrder } = validateOrder(orderData);
    if (error) {
        logger.error(`Error al validar la orden: ${JSON.stringify(error.details, null, 2)}`);
        throw new Error(`Error al validar la orden: ${error.details.map(detail => detail.message).join(', ')}`);
    }

    logger.info('Orden validada exitosamente');
    return validatedOrder;
}

// Insertar o actualizar orden
async function updateOrder(orderData) {
    try {
        logger.info('Datos de la orden a actualizar:', JSON.stringify(orderData, null, 2));

        // Obtener la orden existente desde MongoDB
        const existingOrder = await db.collection('orderModels').findOne({ shopifyOrderId: orderData.shopifyOrderId });

        // Comparar datos usando compareOrderData
        if (existingOrder && compareOrderData(orderData, existingOrder)) {
            logger.info(`Orden ${orderData.shopifyOrderId} ya está sincronizada. No se realizaron cambios.`);
            return existingOrder.shopifyOrderId;
        }

        // Actualizar la orden si hay diferencias
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
async function updateProducts(orderData, validateProduct) {
    if (!validateProduct) {
        throw new Error('validateProduct no está definido');
    }
    for (const product of orderData.orderDetails.products) {
        try {
            logger.info('Datos del producto a actualizar:', {
                productId: product.productId,
                productData: product
            });

            // Obtener el producto existente desde MongoDB
            const existingProduct = await db.collection('productModels').findOne({
                productId: product.productId,
                orderId: orderData.shopifyOrderId
            });

            // Comparar datos usando compareOrderData
            if (existingProduct && compareOrderData(product, existingProduct)) {
                logger.info(`Producto ${product.productId} ya está sincronizado. No se realizaron cambios.`);
                continue;
            }

            // Preparar los datos del producto para insertar o actualizar
            const productData = {
                ...product,
                orderId: orderData.shopifyOrderId,
                trackingNumbers: existingProduct?.trackingNumbers || []
            };

            logger.info('Datos del producto a validar:', {
                productId: product.productId,
                productData: productData
            });

            // Validar el producto
            const { error, value } = validateProduct(productData);
            if (error) {
                const errorDetails = error.details.map(detail => ({
                    message: detail.message,
                    path: detail.path.join('.')
                }));
                logger.error(
                    `Error al validar el producto ${product.productId} de la orden: ${orderData.shopifyOrderId}`,
                    {
                        validationErrors: errorDetails,
                        productData: productData
                    }
                );
                continue;
            }

            // Insertar o actualizar el producto en MongoDB
            const result = await db.collection('productModels').updateOne(
                { productId: product.productId, orderId: orderData.shopifyOrderId },
                { $set: value },
                { upsert: true }
            );

            if (result.matchedCount > 0) {
                logger.info(`Producto ${product.productId} de la orden ${orderData.shopifyOrderId} actualizado exitosamente.`);
            } else if (result.upsertedCount > 0) {
                logger.info(`Producto ${product.productId} de la orden ${orderData.shopifyOrderId} insertado exitosamente.`);
            }
        } catch (error) {
            logger.error(`Error al manejar producto ${product.productId} de la orden ${orderData.shopifyOrderId}:`, {
                error: error.message,
                stack: error.stack
            });
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
            let errorBody;
            try {
                errorBody = await response.json();
            } catch {
                errorBody = { errors: [{ message: 'Unknown error' }] };
            }

            switch (response.status) {
                case 401:
                    throw new Error('Unauthorized: Invalid API credentials.');
                case 403:
                    throw new Error('Forbidden: API key lacks permissions.');
                case 404:
                    throw new Error('Not Found: The requested resource does not exist.');
                case 422:
                    throw new Error('Unprocessable Entity: ' + errorBody.errors.map(e => e.message).join(', '));
                case 429:
                    throw new Error('Too Many Requests: Rate limit exceeded.');
                case 500:
                    throw new Error('Shopify Server Error: ' + (errorBody.errors ? errorBody.errors[0].message : 'Unexpected error'));
                default:
                    throw new Error(`Error al obtener órdenes de Shopify: ${response.status} - ${errorBody.errors ? errorBody.errors[0].message : 'Unknown error'}`);
            }
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

    // Verificación de la conexión a MongoDB
    if (!db) {
        logger.error('La conexión a MongoDB no está disponible. Abortando sincronización.');
        return;
    }

    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 días atrás

        const createdAtMin = thirtyDaysAgo.toISOString();
        const createdAtMax = now.toISOString();

        logger.info(`Consultando órdenes desde Shopify entre ${createdAtMin} y ${createdAtMax}...`);

        const orders = await fetchShopifyOrders(createdAtMin, createdAtMax);
        logger.info(`Órdenes obtenidas desde Shopify: ${orders.length}`);

        // Importar modelos dinámicamente si no está disponible globalmente
        const { validateOrder } = require('./src/models/orderModel');
        const { validateProduct } = require('./src/models/productModels');

        for (const shopifyOrder of orders) {
            try {
                // Pasar validateOrder como argumento a mapShopifyOrderToMongoModel
                const orderData = mapShopifyOrderToMongoModel(shopifyOrder, validateOrder);
                const existingOrder = await db.collection('orderModels').findOne({ shopifyOrderId: orderData.shopifyOrderId });

                // Comparar datos usando compareOrderData
                if (existingOrder && compareOrderData(orderData, existingOrder)) {
                    logger.info(`Orden ${orderData.shopifyOrderId} ya está sincronizada. No se realizaron cambios.`);
                    continue;
                }

                // Actualizar la orden y sus productos
                const orderId = await updateOrder(orderData, validateProduct);
                await updateProducts(orderData, validateProduct);

                logger.info(`Orden ${orderId} sincronizada exitosamente.`);
            } catch (error) {
                logger.error(`Error al procesar la orden ${shopifyOrder.id}:`, error);
            }
        }

        logger.info(`Sincronización automática completada: ${orders.length} órdenes procesadas.`);
    } catch (error) {
        logger.error('Error general en la sincronización automática:', error);
    }
});

// Endpoint para actualizar el token
app.post('/api/update-token', (req, res) => {
  // Solo permite la actualización si el request viene con el token actual
  if (req.headers['x-api-token'] === apiToken) {
    // Aquí asumimos que el nuevo token viene en el cuerpo de la solicitud
    const { newToken } = req.body;
    
    if (newToken) {
      apiToken = newToken;
      console.log('Token actualizado en memoria:', apiToken);
      res.status(200).json({ message: 'Token actualizado con éxito' });
    } else {
      res.status(400).json({ message: 'Nuevo token no proporcionado' });
    }
  } else {
    res.status(401).json({ message: 'Acceso no autorizado' });
  }
});

//Endpoint para proveer el token
app.get('/api/get-token', (req, res) => {
  // Aquí podrías añadir lógica adicional para autenticación o autorización
  res.json({ token: apiToken });
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

        const { validateOrder } = require('./src/models/orderModel');
        const { validateProduct } = require('./src/models/productModels');

        const allOrders = await fetchShopifyOrders(createdAtMin, createdAtMax);
        logger.info(`Número de órdenes obtenidas de Shopify: ${allOrders.length}`);

        let processedCount = 0;
        for (const shopifyOrder of allOrders) {
            try {
                // Pasar validateOrder aquí
                const orderData = mapShopifyOrderToMongoModel(shopifyOrder, validateOrder);
                await updateOrder(orderData);
                await updateProducts(orderData, validateProduct);
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
    const { carrier } = req.body; // ...

    const session = db.startSession();
    try {
        session.startTransaction();

        // Obtener estados en memoria
        const statuses = getInMemoryStatuses();

        const order = await db.collection('orderModels').findOne({ shopifyOrderId: orderId });
        if (!order) {
            throw { status: 404, message: 'Orden no encontrada' };
        }

        const allProductsReceived = order.orderDetails.products.every(product => 
            product.status.some(status => status.status === (statuses.PRODUCT['Recibido por Sharkletas'] ? 'Recibido por Sharkletas' : 'Recibido'))
        );

        if (!allProductsReceived) {
            throw { status: 400, message: 'No todos los productos están en estado "Recibido por Sharkletas"' };
        }

        const consolidatedStatus = statuses.PRODUCT['Consolidado'] || 'Consolidado';
        const updatedProducts = order.orderDetails.products.map(product => {
            return {
                ...product,
                status: [...product.status, { status: consolidatedStatus, updatedAt: new Date() }]
            };
        });

        await db.collection('orderModels').updateOne(
            { shopifyOrderId: orderId },
            {
                $set: {
                    'orderDetails.products': updatedProducts,
                    currentStatus: { 
                        status: consolidatedStatus, 
                        description: 'Productos Consolidados', 
                        updatedAt: new Date() 
                    },
                    'statusHistory': [...order.statusHistory, { 
                        status: consolidatedStatus, 
                        description: 'Productos Consolidados', 
                        updatedAt: new Date() 
                    }]
                }
            },
            { session }
        );

        // ... (resto del código sin cambios)

    } catch (error) {
        // ... (manejo de errores existente)
    } finally {
        session.endSession();
    }
});

// Endpoint para preparar productos (fulfill items)
app.post('/api/prepare-products/:orderId', async (req, res) => {
    const statuses = getInMemoryStatuses();
    const { orderId } = req.params;
    const { trackingNumber } = req.body; // Esperamos que el tracking number venga en el cuerpo de la solicitud

    try {
        const order = await db.collection('orderModels').findOne({ shopifyOrderId: orderId });
        if (!order) {
            return res.status(404).json({ message: 'Orden no encontrada' });
        }

        const consolidatedStatus = statuses.PRODUCT['Consolidado'] || 'Consolidado';
        const isConsolidated = order.orderDetails.products.some(product => 
            product.status.some(status => status.status === consolidatedStatus)
        );

        if (!isConsolidated) {
            return res.status(400).json({ message: 'La orden no está en estado "Consolidado"' });
        }

        if (!trackingNumber) {
            return res.status(400).json({ message: 'Se requiere un número de tracking' });
        }

        const preparedStatus = statuses.ORDER['Preparado'] || 'Preparado';
        await db.collection('orderModels').updateOne(
            { shopifyOrderId: orderId },
            {
                $set: {
                    'fulfillmentStatus.status': 'fulfilled',
                    currentStatus: { 
                        status: preparedStatus, 
                        description: 'Orden preparada para envío', 
                        updatedAt: new Date() 
                    },
                    'statusHistory': [...order.statusHistory, { 
                        status: preparedStatus, 
                        description: 'Orden preparada para envío', 
                        updatedAt: new Date() 
                    }],
                    'trackingInfo.orderTracking': {
                        carrier: 'Correos de Costa Rica',
                        trackingNumber: trackingNumber
                    }
                }
            }
        );

        res.status(200).json({ message: 'Orden preparada exitosamente', orderId: orderId, trackingNumber: trackingNumber });
    } catch (error) {
        // ... (manejo de errores existente)
    }
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
    logger.error('Error encontrado:', { error: err.message, stack: err.stack });
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Algo inesperado ocurrió',
            status: err.status || 500
        }
    });
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