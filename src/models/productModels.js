const Joi = require('joi');
const { productStatusSchema } = require('./statusModels');

const productSchema = Joi.object({
  productId: Joi.string().optional(),
  name: Joi.string().required(),
  weight: Joi.number().default(0),
  orders: Joi.array().items(Joi.string()).default([]),
  trackingNumbers: Joi.array().items(
    Joi.object({
      trackingNumber: Joi.string().required(),
      carrier: Joi.string().required(),
      status: productStatusSchema.required(), // Cambio aquí
      consolidatedTrackingNumber: Joi.string().optional(),
      supplierTrackingNumber: Joi.string().optional()
    })
  ).default([]),
  purchaseType: Joi.string().valid('Pre-Orden', 'Entrega Inmediata', 'Reemplazo').required(),
  supplierPO: Joi.string().when('purchaseType', {
    is: 'Pre-Orden',
    then: Joi.string().required(),
    otherwise: Joi.string().optional()
  }),
  localInventory: Joi.boolean().default(false)
});

const validateProduct = (productData) => {
  return productSchema.validate(productData, { abortEarly: false });
};

module.exports = {
  validateProduct,
  productSchema
};