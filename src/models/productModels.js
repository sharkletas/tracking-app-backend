const Joi = require('joi');
const { productStatusSchema } = require('./statusModels');
const { STATUS } = require('./statusModels');

/**
 * Esquema Joi para validar la estructura de un producto.
 * @typedef {Object} ProductSchema
 * @property {string} productId - Identificador del producto, opcional ya que puede ser generado después.
 * @property {string} name - Nombre del producto, requerido.
 * @property {number} weight - Peso del producto en gramos, default 0.
 * @property {string} price - Precio del producto, opcional.
 * @property {number} quantity - Cantidad del producto, requerido.
 * @property {string} vendor - Nombre del vendedor, opcional.
 * @property {string} variantTitle - Título de la variante del producto, opcional.
 * @property {string} sku - SKU del producto, puede estar vacío.
 * @property {Array} orders - Lista de IDs de órdenes relacionadas con el producto.
 * @property {Array} trackingNumbers - Lista de números de seguimiento asociados al producto.
 * @property {string} purchaseType - Tipo de compra, requerido para decidir el flujo de manejo.
 * @property {string} supplierPO - ID de la orden de compra al proveedor, requerido para pre-órdenes.
 * @property {boolean} localInventory - Indica si el producto está en inventario local, default false.
 * @property {string} provider - Proveedor del producto, opcional.
 */
const productSchema = Joi.object({
  productId: Joi.string().optional(),
  name: Joi.string().required(),
  weight: Joi.number().default(0), // Mapeado desde 'grams'
  price: Joi.string().optional(), // Precio del producto
  quantity: Joi.number().required(), // Cantidad
  vendor: Joi.string().optional(), // Nombre del vendedor
  variantTitle: Joi.string().optional(), // Detalles de variante como color y talla
  sku: Joi.string().optional().allow(''), // SKU opcional, puede estar vacío
  orders: Joi.array().items(Joi.string()).default([]),
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
    otherwise: Joi.string().optional()
  }),
  localInventory: Joi.boolean().default(false),
  provider: Joi.string().valid(
    'TEMU', 
    'AliExpress', 
    'Alibaba', 
    'Inventario Local'
  ).optional()
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