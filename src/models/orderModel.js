const Joi = require('joi');


const orderSchema = Joi.object({
  shopifyOrderId: Joi.string().required(),
  shopifyOrderNumber: Joi.string().required(),
  shopifyOrderLink: Joi.string().required(),
  orderType: Joi.string().valid('Por Definir', 'Pre-Orden', 'Entrega Inmediata', 'Reemplazo').default('Por Definir'),
  paymentStatus: Joi.string().valid(
  'authorized', 
  'paid', 
  'partially_paid', 
  'partially_refunded', 
  'pending', 
  'refunded', 
  'voided'
).allow(null).default('pending'),
  trackingInfo: Joi.object({
    orderTracking: Joi.object({
      carrier: Joi.string().optional(),
      trackingNumber: Joi.string().optional()
    }).default({}),
    productTrackings: Joi.array().items(
      Joi.object({
        productId: Joi.string().required(), // Esto sería un ObjectId en MongoDB
        carrier: Joi.string().required(),
        trackingNumber: Joi.string().required(),
        status: Joi.string().valid('En Ruta a Sucursal', 'Recibido por Sharkletas').default('En Ruta a Sucursal'),
        consolidatedTrackingNumber: Joi.string().optional()
      })
    ).default([])
  }).default({
    orderTracking: {},
    productTrackings: []
  }),
  productStatus: Joi.array().items(Joi.string()).default(['Procesando Pedido']),
  productsByLocation: Joi.object().pattern(
    Joi.string(),
    Joi.number()
  ).default({}),
  fulfillmentStatus: Joi.object({
    status: Joi.string().valid('fulfilled', 'unfulfilled', 'partial', 'restocked').default('unfulfilled'),
    carrier: Joi.string().optional(),
    trackingNumber: Joi.string().optional(),
  }).default({ status: 'unfulfilled' }),
  currentStatus: Joi.object({
    status: Joi.string().required(),
    description: Joi.string().required(),
    updatedAt: Joi.date().required(),
  }).required(),
  statusHistory: Joi.array().items(
    Joi.object({
      status: Joi.string().required(),
      description: Joi.string().required(),
      updatedAt: Joi.date().required(),
    })
  ).default([]),
  processingTimeInDual: Joi.number().default(0),
  flags: Joi.object({
    dualDelay: Joi.boolean().default(false),
    deliveryDelay: Joi.boolean().default(false),
  }).default(),
  orderDetails: Joi.object({
    products: Joi.array().items(
      Joi.object({
        productId: Joi.string().optional(), // Esto sería un ObjectId en MongoDB
        name: Joi.string().required(),
        quantity: Joi.number().required(),
        weight: Joi.number().default(0),
        purchaseType: Joi.string().valid('Pre-Orden', 'Entrega Inmediata', 'Reemplazo').default('Pre-Orden'),
      })
    ).default([]),
    totalWeight: Joi.number().default(0), // Permitir totalWeight
    providerInfo: Joi.array().items(
      Joi.object({
        provider: Joi.string().required(),
        poNumber: Joi.string().required(),
        orderDate: Joi.date().required(),
      })
    ).default([])
  }).required(),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(() => new Date()),
});


const validateOrder = (orderData) => {
  return orderSchema.validate(orderData, { abortEarly: false });
};

module.exports = {
  validateOrder,
  orderSchema
};