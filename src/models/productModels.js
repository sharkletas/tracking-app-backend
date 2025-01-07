const Joi = require('joi');
const { productStatusSchema } = require('./statusModels');

/**
 * Esquema Joi para validar la estructura de un producto.
 * @typedef {Object} ProductSchema
 * @property {string} productId - Identificador del producto, opcional ya que puede ser generado después.
 * @property {string} name - Nombre del producto, requerido.
 * @property {number} weight - Peso del producto en gramos, default 0.
 * @property {string} price - Precio del producto, opcional.
 * @property {number} quantity - Cantidad del producto, requerido.
 * @property {string} vendor - Nombre del vendedor, opcional.
 * @property {Array} trackingNumbers - Lista de números de seguimiento asociados al producto.
 * @property {string} purchaseType - Tipo de compra, requerido para decidir el flujo de manejo.
 * @property {string} supplierPO - ID de la orden de compra al proveedor, requerido para pre-órdenes.
 * @property {string} provider - Proveedor del producto, opcional.
 */

const productSchema = Joi.object({
  productId: Joi.string().optional(),
  name: Joi.string().required(),
  weight: Joi.number().default(0),
  price: Joi.string().optional(),
  quantity: Joi.number().required(),
  vendor: Joi.string().optional(),
  orderId: Joi.string().required(),
  trackingNumbers: Joi.array().items(
    Joi.object({
      trackingNumber: Joi.string().required(),
      carrier: Joi.string().required(),
      status: productStatusSchema.required(),
      consolidatedTrackingNumber: Joi.string().optional(),
      supplierTrackingNumber: Joi.string().optional()
    })
  ).default([]),
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
  provider: Joi.string().valid(
    'Por Definir', 
    'TEMU', 
    'AliExpress', 
    'Alibaba', 
    'Inventario Local'
  ).allow('').default('Por Definir'),
  status: productStatusSchema.required(),
  color: Joi.string().optional().allow(''), // Añadido
  size: Joi.string().optional().allow(''), // Añadido
});

/**
 * Función para validar los datos de un producto contra el esquema definido.
 * @param {Object} productData - Datos del producto a validar.
 * @returns {Object} Resultado de la validación incluyendo errores si existen.
 */
const validateProduct = (productData) => {
  return productSchema.validate(productData, { abortEarly: false });
};

module.exports = {
  validateProduct,
  productSchema
};
