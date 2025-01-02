const Joi = require('joi');
const { orderStatusSchema, productStatusSchema } = require('./statusModels');
const { STATUS } = require('./statusModels');

/**
 * Esquema Joi para validar la estructura de una orden.
 * @typedef {Object} OrderSchema
 * @property {string} shopifyOrderId - Identificador de la orden en Shopify, requerido.
 * @property {string} shopifyOrderNumber - Número de orden en Shopify, requerido.
 * @property {string} shopifyOrderLink - Enlace a la orden en Shopify, requerido.
 * @property {string} orderType - Tipo de orden, default 'Por Definir'.
 * @property {string} paymentStatus - Estado del pago de la orden.
 * @property {Object} trackingInfo - Información de seguimiento de la orden y productos.
 * @property {Object} currentStatus - Estado actual de la orden.
 * @property {Array} statusHistory - Historial de estados de la orden.
 * @property {Object} flags - Banderas de estado para la orden.
 * @property {Object} orderDetails - Detalles específicos de la orden.
 * @property {Date} createdAt - Fecha de creación de la orden.
 * @property {Date} updatedAt - Fecha de última actualización de la orden.
 */
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
    // Información de seguimiento a nivel de orden
    orderTracking: Joi.object({
      carrier: Joi.string().optional(), // Transportista asignado a la orden
      trackingNumber: Joi.string().optional() // Número de seguimiento de la orden completa
    }).default({}),
    // Seguimiento a nivel de producto para manejo de múltiples tracking numbers
    productTrackings: Joi.array().items(
      Joi.object({
        productId: Joi.string().required(), 
        carrier: Joi.string().required(),
        trackingNumber: Joi.string().required(),
        status: productStatusSchema.required(), // Estado del producto según su tracking
        consolidatedTrackingNumber: Joi.string().optional(), // Número de seguimiento si el producto fue consolidado
      })
    ).default([])
  }).default({
    orderTracking: {},
    productTrackings: []
  }),
  currentStatus: Joi.alternatives().try(orderStatusSchema, productStatusSchema).required().default({ 
    status: STATUS.PRODUCT.PENDING.internal, 
    description: 'Nueva Orden Creada', 
    updatedAt: () => new Date() 
  }),
  statusHistory: Joi.array().items(Joi.alternatives().try(orderStatusSchema, productStatusSchema)).default([{ 
    status: STATUS.PRODUCT.PENDING.internal, 
    description: 'Nueva Orden Creada', 
    updatedAt: () => new Date() 
  }]),
  flags: Joi.object({
    deliveryDelay: Joi.boolean().default(false), // Indica si hubo un retraso en la entrega final
  }).default(),
  orderDetails: Joi.object({
    products: Joi.array().items(
      Joi.object({
        productId: Joi.string().optional(), // Puede ser asignado más tarde
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
          otherwise: Joi.string().optional()
        }),
        localInventory: Joi.boolean().default(false),
        status: productStatusSchema.required(),
        provider: Joi.string().valid(
          'TEMU', 
          'AliExpress', 
          'Alibaba', 
          'Inventario Local'
        ).optional() // Proveedor de origen del producto
      })
    ).default([]),
    totalWeight: Joi.number().default(0), // Peso total de la orden
    providerInfo: Joi.array().items(
      Joi.object({
        provider: Joi.string().required(), // Nombre del proveedor
        orderDate: Joi.date().required(), // Fecha de la orden al proveedor
      })
    ).default([])
  }).required(),
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