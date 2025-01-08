const Joi = require('joi');
const { getInMemoryStatuses } = require('../utils/inMemoryStatuses');

/**
 * Esquema Joi para validar el estado de los productos.
 * @typedef {Object} ProductStatusSchema
 * @property {string} status - Estado del producto, requerido. Debe ser uno de los valores especificados.
 * @property {string} description - Descripción del estado, por defecto se proporciona una descripción basada en el estado.
 * @property {Date} updatedAt - Fecha y hora de la actualización del estado, por defecto la fecha actual.
 */

const statuses = getInMemoryStatuses();

const productStatusSchema = Joi.object({
  status: Joi.string().valid(
    // Ahora validamos contra statuses.PRODUCT
    ...Object.keys(statuses.PRODUCT || {})
  ).required(),
  description: Joi.string().default((parent, helpers) => {
    // Aquí usarías statuses para obtener la descripción
    return (statuses.PRODUCT && statuses.PRODUCT[parent.status]?.customer) || 'Estado sin descripción específica';
  }),
  updatedAt: Joi.date().default(() => new Date())
});

/**
 * Esquema Joi para validar el estado de las órdenes.
 * @typedef {Object} OrderStatusSchema
 * @property {string} status - Estado de la orden, requerido. Debe ser uno de los valores especificados.
 * @property {string} description - Descripción del estado, por defecto se proporciona una descripción basada en el estado.
 * @property {Date} updatedAt - Fecha y hora de la actualización del estado, por defecto la fecha actual.
 */
const orderStatusSchema = Joi.object({
  status: Joi.string().valid(
    // Ahora validamos contra statuses.ORDER
    ...Object.keys(statuses.ORDER || {})
  ).required(),
  description: Joi.string().default((parent, helpers) => {
    // Aquí usarías statuses para obtener la descripción
    return (statuses.ORDER && statuses.ORDER[parent.status]?.customer) || 'Estado sin descripción específica';
  }),
  updatedAt: Joi.date().default(() => new Date())
});

module.exports = {
  productStatusSchema,
  orderStatusSchema
};
