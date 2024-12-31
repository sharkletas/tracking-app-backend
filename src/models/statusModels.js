const Joi = require('joi');

/**
 * Esquema Joi para validar el estado de los productos antes de la consolidación.
 * @typedef {Object} ProductStatusSchema
 * @property {string} status - Estado del producto, requerido. Debe ser uno de los valores especificados.
 * @property {string} [description] - Descripción opcional del estado.
 * @property {Date} updatedAt - Fecha y hora de la actualización del estado, por defecto la fecha actual.
 */
const productStatusSchema = Joi.object({
  status: Joi.string().valid(
    'Por Procesar', 
    'Esperando Tracking', 
    'En Tránsito', 
    'Entregado en Miami', 
    'Recibido en Bodega', 
    'Centro de Distribución', 
    'En Ruta a Sucursal', 
    'Recibido por Sharkletas', 
    'Consolidado'
  ).required(),
  description: Joi.string().optional(),
  updatedAt: Joi.date().default(() => new Date()),
});

/**
 * Esquema Joi para validar el estado de las órdenes después de la consolidación.
 * @typedef {Object} OrderStatusSchema
 * @property {string} status - Estado de la orden, requerido. Debe ser uno de los valores especificados.
 * @property {string} [description] - Descripción opcional del estado.
 * @property {Date} updatedAt - Fecha y hora de la actualización del estado, por defecto la fecha actual.
 */
const orderStatusSchema = Joi.object({
  status: Joi.string().valid(
    'Preparado', 
    'En poder de Correos', 
    'Listo para Entrega', 
    'Entregado'
  ).required(),
  description: Joi.string().optional(),
  updatedAt: Joi.date().default(() => new Date()),
});

module.exports = {
  productStatusSchema,
  orderStatusSchema
};