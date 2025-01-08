const Joi = require('joi');
const { getInMemoryStatuses } = require('../utils/inMemoryStatuses');
const { productStatusSchema } = require('./statusModels');

/**
 * Esquema Joi para validar la estructura de un número de seguimiento.
 * @typedef {Object} TrackingNumberSchema
 * @property {string} trackingNumber - El número de seguimiento, requerido.
 * @property {string} carrier - El transportista, requerido.
 * @property {Array} products - Lista de productos asociados al tracking number.
 * @property {Array} orders - Lista de identificadores de órdenes asociadas.
 * @property {Array} consolidatedFrom - Lista de números de tracking de productos que se consolidaron en este.
 * @property {boolean} isConsolidated - Indica si este número de seguimiento representa una consolidación.
 * @property {Object} flags - Banderas de estado para el tracking number.
 * @property {string} supplierPO - ID de la orden de compra al proveedor asociada.
 */

const statuses = getInMemoryStatuses();

const trackingNumberSchema = Joi.object({
  trackingNumber: Joi.string().required(),
  carrier: Joi.string().required(),
  products: Joi.array().items(
    Joi.object({
      productId: Joi.string().required(),
      status: Joi.string().valid(
        // Usa statuses para validar el status
        ...Object.keys(statuses.PRODUCT || {})
      ).default('Por Procesar'), // Ajusta el default según tu lógica de negocio
      orderId: Joi.string().required(),
    })
  ).default([]),
  orders: Joi.array().items(Joi.string()).default([]),
  consolidatedFrom: Joi.array().items(Joi.string()).default([]),
  isConsolidated: Joi.boolean().default(false),
  flags: Joi.object({
    dualDelay: Joi.boolean().default(false),
    processingTimeToWarehouse: Joi.number().default(0),
    processingTimeToDistribution: Joi.number().default(0),
    processingTimeToBranch: Joi.number().default(0),
    processingTimeToDelivery: Joi.number().default(0)
  }).default(),
  supplierPO: Joi.string().optional()
});

/**
 * Función para validar los datos de un número de seguimiento contra el esquema definido.
 * @param {Object} trackingData - Datos del número de seguimiento a validar.
 * @returns {Object} Resultado de la validación incluyendo errores si existen.
 */
const validateTrackingNumber = (trackingData) => {
  return trackingNumberSchema.validate(trackingData, { abortEarly: false });
};

module.exports = {
  validateTrackingNumber,
  trackingNumberSchema
};