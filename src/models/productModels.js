const Joi = require('joi');

const productSchema = Joi.object({
  productId: Joi.string().optional(), // Esto sería un ObjectId en MongoDB
  name: Joi.string().required(),
  weight: Joi.number().default(0),
  orders: Joi.array().items(Joi.string()).default([]), // Referencias a ordenes
  trackingNumbers: Joi.array().items(
    Joi.object({
      trackingNumber: Joi.string().required(),
      carrier: Joi.string().required(),
      status: Joi.string().valid('En Ruta a Sucursal', 'Recibido por Sharkletas').default('En Ruta a Sucursal'),
      consolidatedTrackingNumber: Joi.string().optional()
    })
  ).default([])
});

const validateProduct = (productData) => {
  return productSchema.validate(productData, { abortEarly: false });
};

module.exports = {
  validateProduct,
  productSchema
};