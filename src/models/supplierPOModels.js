const Joi = require('joi');

/**
 * Esquema Joi para validar la estructura de una orden de compra al proveedor.
 * @typedef {Object} SupplierPOSchema
 * @property {string} supplierPOId - Identificador de la orden de compra, requerido.
 * @property {string} supplierName - Nombre del proveedor, requerido.
 * @property {string} poNumber - Número de la orden de compra, requerido.
 * @property {Date} orderDate - Fecha de la orden de compra, requerido.
 * @property {string} status - Estado de la orden de compra.
 * @property {Array} products - Lista de IDs de productos asociados a esta PO.
 * @property {Array} orders - Lista de IDs de órdenes asociadas a esta PO.
 * @property {Array} trackingNumbers - Lista de números de seguimiento asociados a esta PO.
 */
const supplierPOSchema = Joi.object({
  supplierPOId: Joi.string().required(), // MongoDB ObjectId como string
  supplierName: Joi.string().valid(
    'TEMU', 
    'AliExpress', 
    'Alibaba'
  ).required(),
  poNumber: Joi.string().required(),
  orderDate: Joi.date().required(),
  status: Joi.string().valid(
    'Pendiente', 
    'Confirmado', 
    'En Proceso', 
    'Recibido', 
    'Cancelado'
  ).default('Pendiente'),
  products: Joi.array().items(Joi.string()).default([]), // IDs de productos
  orders: Joi.array().items(Joi.string()).default([]), // IDs de órdenes
  trackingNumbers: Joi.array().items(Joi.string()).default([]) // IDs de tracking numbers
});

/**
 * Función para validar los datos de una orden de compra de proveedor contra el esquema definido.
 * @param {Object} poData - Datos de la orden de compra a validar.
 * @returns {Object} Resultado de la validación incluyendo errores si existen.
 */
const validateSupplierPO = (poData) => {
  return supplierPOSchema.validate(poData, { abortEarly: false });
};

module.exports = {
  validateSupplierPO,
  supplierPOSchema
};