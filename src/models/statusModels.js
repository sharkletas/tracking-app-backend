const Joi = require('joi');

/**
 * Definición de estados para productos y órdenes con sus alias para clientes.
 * @typedef {Object} STATUS
 * @property {Object} PRODUCT - Estados relacionados con productos.
 * @property {Object} ORDER - Estados relacionados con órdenes.
 */
const STATUS = {
  PRODUCT: {
    PENDING: { internal: 'Por Procesar', customer: 'En Preparación' },
    AWAITING_TRACKING: { internal: 'Esperando Tracking', customer: 'Esperando Número de Seguimiento' },
    IN_TRANSIT: { internal: 'En Tránsito', customer: 'En Camino' },
    DELIVERED_IN_MIAMI: { internal: 'Entregado en Miami', customer: 'Llegó a Miami' },
    PROCESSED_IN_MIAMI: { internal: 'Procesado en DUAL Miami', customer: 'Procesado en Miami' },
    DISTRIBUTION_CENTER: { internal: 'En Centro de Distribución', customer: 'En Centro de Distribución' },
    ON_WAY_TO_BRANCH: { internal: 'En Sucursal DUAL', customer: 'En Camino a Sucursal' },
    RECEIVED_BY_SHARKLETAS: { internal: 'Recibido por Sharkletas', customer: 'Recibido por Nosotros' },
    CONSOLIDATED: { internal: 'Consolidado', customer: 'Preparación Final' }
  },
  ORDER: {
    PREPARED: { internal: 'Preparado', customer: 'Listo para Enviar' },
    WITH_CORREOS: { internal: 'En poder de Correos', customer: 'En Tránsito con Correos' },
    READY_FOR_DELIVERY: { internal: 'Listo para Entrega', customer: 'Listo para Entrega' },
    DELIVERED: { internal: 'Entregado', customer: 'Entregado' }
  }
};

/**
 * Esquema Joi para validar el estado de los productos.
 * @typedef {Object} ProductStatusSchema
 * @property {string} status - Estado del producto, requerido. Debe ser uno de los valores especificados.
 * @property {string} description - Descripción del estado, por defecto se proporciona una descripción basada en el estado.
 * @property {Date} updatedAt - Fecha y hora de la actualización del estado, por defecto la fecha actual.
 */
const productStatusSchema = Joi.object({
  status: Joi.string().valid(
    ...Object.values(STATUS.PRODUCT).map(state => state.internal)
  ).required(),
  description: Joi.string().default((parent, helpers) => {
    const statusMap = {
      'Por Procesar': 'Producto recién ingresado en el sistema',
      'Esperando Tracking': 'Esperando asignación de número de seguimiento',
      'En Tránsito': 'Producto en camino desde el proveedor',
      'Entregado en Miami': 'Producto recibido en Miami',
      'Procesado en DUAL Miami': 'Producto procesado en el almacén de DUAL en Miami',
      'En Centro de Distribución': 'En el centro de distribución de DUAL',
      'En Sucursal DUAL': 'Producto en camino a la sucursal de DUAL',
      'Recibido por Sharkletas': 'Producto recibido por nuestro equipo',
      'Consolidado': 'Todos los productos de la orden están listos para envío'
    };
    return statusMap[parent.status] || 'Estado sin descripción específica';
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
    ...Object.values(STATUS.ORDER).map(state => state.internal)
  ).required(),
  description: Joi.string().default((parent, helpers) => {
    const statusMap = {
      'Preparado': 'Orden lista para ser enviada',
      'En poder de Correos': 'Orden en tránsito con Correos de Costa Rica',
      'Listo para Entrega': 'Orden lista para ser entregada',
      'Entregado': 'Orden entregada al cliente'
    };
    return statusMap[parent.status] || 'Estado sin descripción específica';
  }),
  updatedAt: Joi.date().default(() => new Date())
});

module.exports = {
  productStatusSchema,
  orderStatusSchema,
  STATUS
};
