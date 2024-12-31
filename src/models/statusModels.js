// statusModels.js
const Joi = require('joi');

// Estados a nivel de producto antes de consolidación
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

// Estados a nivel de orden después de la consolidación
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