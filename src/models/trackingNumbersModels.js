const Joi = require('joi');

/**
 * Esquema Joi para validar la estructura de un número de tracking.
 * @typedef {Object} TrackingNumberSchema
 * @property {string} trackingNumber - El número de tracking, requerido.
 * @property {string} carrier - El transportista, requerido.
 * @property {Array} products - Lista de productos asociados al tracking number.
 * @property {Array} orders - Lista de identificadores de órdenes asociadas.
 * @property {Array} consolidatedFrom - Lista de números de tracking de productos que se consolidaron en este.
 */
const trackingNumberSchema = Joi.object({
  trackingNumber: Joi.string().required(),
  carrier: Joi.string().required(),
  products: Joi.array().items(
    Joi.object({
      productId: Joi.string().required(), // Esto sería un ObjectId en MongoDB
      status: Joi.string().valid('En Ruta a Sucursal', 'Recibido por Sharkletas').default('En Ruta a Sucursal'),
      orderId: Joi.string().required() // Referencia a la orden
    })
  ).default([]),
  orders: Joi.array().items(Joi.string()).default([]), // Referencias a las órdenes
  consolidatedFrom: Joi.array().items(Joi.string()).default([]) // Tracking numbers de productos que se consolidaron en este
});

/**
 * Función para validar datos de tracking number contra el esquema definido.
 * @param {Object} trackingData - Los datos del tracking number a validar.
 * @returns {Object} Resultado de la validación.
 */
const validateTrackingNumber = (trackingData) => {
  return trackingNumberSchema.validate(trackingData, { abortEarly: false });
};

module.exports = {
  validateTrackingNumber,
  trackingNumberSchema
};