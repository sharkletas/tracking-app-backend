const Joi = require('joi');
const { getInMemoryStatuses } = require('../utils/inMemoryStatuses');
const productSchema = require('./productModels').productSchema;
const statusSchema = require('./statusModels').statusSchema;
const supplierPOSchema = require('./supplierPOModels').supplierPOSchema;
const trackingNumberSchema = require('./trackingNumberModels').trackingNumberSchema;

const statuses = getInMemoryStatuses();

const orderSchema = Joi.object({
  shopifyOrderId: Joi.string().required(),
  shopifyOrderNumber: Joi.string().required(),
  shopifyOrderLink: Joi.string().required(),
  orderType: Joi.string().valid(
    'Por Definir', 
    'Pre-Orden', 
    'Entrega Inmediata', 
    'Reemplazo'
  ).default('Por Definir'),
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
        productId: Joi.string().required(), 
        carrier: Joi.string().required(),
        trackingNumber: Joi.string().required(),
        status: productStatusSchema.required(),
        consolidatedTrackingNumber: Joi.string().optional(),
      })
    ).default([])
  }).default({
    orderTracking: {},
    productTrackings: []
  }),
  currentStatus: Joi.alternatives().try(orderStatusSchema, productStatusSchema).required().default({ 
    status: 'Por Procesar', // Esto debería ser dinámico basado en inMemoryStatuses
    description: 'Nueva Orden Creada', 
    updatedAt: () => new Date() 
  }),
  statusHistory: Joi.array().items(Joi.alternatives().try(orderStatusSchema, productStatusSchema)).default([{ 
    status: 'Por Procesar', // Esto también debería ser dinámico
    description: 'Nueva Orden Creada', 
    updatedAt: () => new Date() 
  }]),
  flags: Joi.object({
    deliveryDelay: Joi.boolean().default(false),
  }).default(),
  orderDetails: Joi.object({
    products: Joi.array().items(
      Joi.object({
        productId: Joi.string().optional(),
        name: Joi.string().required(),
        quantity: Joi.number().required(),
        weight: Joi.number().default(0),
        color: Joi.string().optional().allow(''), 
        size: Joi.string().optional().allow(''), 
        price: Joi.string().optional(),
        vendor: Joi.string().optional(),
        purchaseType: Joi.string().valid(
          'Por Definir', 
          'Pre-Orden', 
          'Entrega Inmediata', 
          'Reemplazo'
        ).default('Por Definir'),
        supplierPO: Joi.string().when('purchaseType', {
          is: 'Pre-Orden',
          then: Joi.string().required(),
          otherwise: Joi.string().allow('').optional()
        }),
        status: productStatusSchema.required(),
        provider: Joi.string().valid(
          'TEMU', 
          'AliExpress', 
          'Alibaba', 
          'Inventario Local'
        ).allow('').optional()
      })
    ).default([]),
    totalWeight: Joi.number().default(0),
    providerInfo: Joi.array().items(
      Joi.object({
        provider: Joi.string().required(),
        orderDate: Joi.date().required(),
      })
    ).default([])
  }).required(),
  productIds: Joi.array().items(Joi.string()).default([]),
  location: Joi.string().valid('Sharkletas HQ', 'CJ Dropshipping China Warehouse').default('Sharkletas HQ'),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(() => new Date()),
});

/**
 * Función para validar los datos de una orden contra el esquema definido.
 * @param {Object} orderData - Datos de la orden a validar.
 * @returns {Object} Resultado de la validación incluyendo errores si existen.
 */
const validateOrder = (orderData) => {
  // Validación completa de la orden, no se detiene en el primer error encontrado
  return orderSchema.validate(orderData, { abortEarly: false });
};

module.exports = {
  validateOrder,
  orderSchema
};