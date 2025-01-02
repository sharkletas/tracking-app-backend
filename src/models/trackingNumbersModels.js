const Joi = require('joi');
const { productStatusSchema } = require('./statusModels');
const { STATUS } = require('./statusModels');

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
const trackingNumberSchema = Joi.object({
  trackingNumber: Joi.string().required(),
  carrier: Joi.string().required(),
  products: Joi.array().items(
    Joi.object({
      productId: Joi.string().required(), // Esto sería un ObjectId en MongoDB
      status: Joi.string().valid(
        ...Object.values(STATUS.PRODUCT).map(state => state.internal)
      ).default(STATUS.PRODUCT.PENDING.internal),
      orderId: Joi.string().required(), // Referencia a la orden
      // supplierPO se ha movido al nivel de tracking number
    })
  ).default([]),
  orders: Joi.array().items(Joi.string()).default([]), // Referencias a las órdenes
  consolidatedFrom: Joi.array().items(Joi.string()).default([]), // Tracking numbers de productos que se consolidaron en este
  isConsolidated: Joi.boolean().default(false), // Indica si el tracking number es de una consolidación
  flags: Joi.object({
    dualDelay: Joi.boolean().default(false), // Indica si hubo algún retraso en DUAL
    processingTimeToWarehouse: Joi.number().default(0), // Tiempo desde 'Entregado' en API de Tracking hasta 'Recibido en Bodega'
    processingTimeToDistribution: Joi.number().default(0), // Tiempo desde 'Recibido en Bodega' hasta 'En Centro de Distribución'
    processingTimeToBranch: Joi.number().default(0), // Tiempo desde 'En Centro de Distribución' hasta 'En Ruta a Sucursal'
    processingTimeToDelivery: Joi.number().default(0) // Tiempo desde consolidación hasta 'Entregado' por Correos de CR
  }).default(),
  supplierPO: Joi.string().optional() // ID de la orden de compra al proveedor relacionada con este tracking number
});

const validateTrackingNumber = (trackingData) => {
  return trackingNumberSchema.validate(trackingData, { abortEarly: false });
};

module.exports = {
  validateTrackingNumber,
  trackingNumberSchema
};