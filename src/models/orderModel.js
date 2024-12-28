const Joi = require('joi');

// Esquema de validación para las órdenes
const orderSchema = Joi.object({
  shopifyOrderId: Joi.string().required(),
  shopifyOrderNumber: Joi.string().required(),
  shopifyOrderLink: Joi.string().required(),
    orderType: Joi.string().allow('Desconocido').default('Desconocido'),
  paymentStatus: Joi.string().valid(
    'AUTHORIZED', 
    'PAID', 
    'PARTIALLY_PAID', 
    'PARTIALLY_REFUNDED', 
    'PENDING', 
    'REFUNDED', 
    'VOIDED'
  ).allow(null).default('PENDING'),
  trackingInfo: Joi.array().items(
    Joi.object({
      carrier: Joi.string().required(),
      trackingNumber: Joi.string().required(),
      status: Joi.string(),
      description: Joi.string(),
      lastUpdated: Joi.date(),
    })
  ).default([]),
  productStatus: Joi.array().items(Joi.string()).default(['Procesando Pedido']),
  productsByLocation: Joi.object().pattern(
    Joi.string(),
    Joi.number()
  ).default({}), // Mantén este valor predeterminado como un objeto vacío
  fulfillmentStatus: Joi.object({
    status: Joi.string().valid('fulfilled', 'unfulfilled', 'partial', 'restocked').required(),
    carrier: Joi.string().optional(),
    trackingNumber: Joi.string().optional(),
  }).optional(),
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
        productId: Joi.string().required(),
        name: Joi.string().required(),
        quantity: Joi.number().required(),
        weight: Joi.number().default(0),
        purchaseType: Joi.string().valid('Pre-Orden', 'Entrega Inmediata', 'Reemplazo').default('Pre-Orden'),
      })
    ).default([]),
    totalWeight: Joi.number().default(0),
    providerInfo: Joi.array().items(
      Joi.object({
        provider: Joi.string().required(),
        poNumber: Joi.string().required(),
        orderDate: Joi.date().required(),
      })
    ).default([]),
  }).required(),
  createdAt: Joi.date().default(() => new Date()), // Elimina el texto adicional
  updatedAt: Joi.date().default(() => new Date()), // Elimina el texto adicional
});


const validateOrder = (orderData) => {
  return orderSchema.validate(orderData, { abortEarly: false });
};

module.exports = {
  validateOrder,
};
