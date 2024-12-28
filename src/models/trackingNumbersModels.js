const Joi = require('joi');

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

const validateTrackingNumber = (trackingData) => {
  return trackingNumberSchema.validate(trackingData, { abortEarly: false });
};

module.exports = {
  validateTrackingNumber,
  trackingNumberSchema
};