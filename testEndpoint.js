const axios = require('axios');
const readline = require('readline');
require('dotenv').config(); // Cargar variables de entorno

// Configurar readline para interacción en la consola
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Función para procesar el input del usuario
const promptUser = () => {
  rl.question('Ingresa el Shopify Order ID o el Order Number: ', (input) => {
    if (input.startsWith('SO-')) {
      // Si detecta el prefijo "SO-", es un Order Number
      updateOrder({ orderNumber: input });
    } else {
      // De lo contrario, asume que es un Shopify Order ID
      updateOrder({ shopifyOrderId: input });
    }
  });
};

// Función para enviar la solicitud al endpoint
const updateOrder = async (payload) => {
  const baseUrl = `http://localhost:${process.env.PORT || 3000}/orders/update`;

  try {
    const response = await axios.post(baseUrl, payload);
    console.log('Respuesta del servidor:', response.data);
  } catch (error) {
    console.error('Error al actualizar la orden:', error.response?.data || error.message);
  } finally {
    rl.close(); // Cerrar la interfaz readline al finalizar
  }
};

// Ejecutar la función interactiva
promptUser();
