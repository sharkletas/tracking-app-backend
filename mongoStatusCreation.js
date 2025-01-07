require('dotenv').config();
const { MongoClient } = require('mongodb');

// URI de MongoDB desde la variable de entorno
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function run() {
    try {
        await client.connect();
        const database = client.db(); // Aquí usamos la base de datos por defecto de la URI

        const statusesCollection = database.collection('statuses');

        // Definición de los estados de productos
        const productStatuses = [
            { type: 'PRODUCT', internal: 'Por Procesar', customer: 'En Preparación' },
            { type: 'PRODUCT', internal: 'Esperando Tracking', customer: 'Esperando Número de Seguimiento' },
            { type: 'PRODUCT', internal: 'En Tránsito', customer: 'En Camino' },
            { type: 'PRODUCT', internal: 'Entregado en Miami', customer: 'Llegó a Miami' },
            { type: 'PRODUCT', internal: 'Procesado en DUAL Miami', customer: 'Procesado en Miami' },
            { type: 'PRODUCT', internal: 'En Centro de Distribución', customer: 'En Centro de Distribución' },
            { type: 'PRODUCT', internal: 'En Sucursal DUAL', customer: 'En Camino a Sucursal' },
            { type: 'PRODUCT', internal: 'Recibido por Sharkletas', customer: 'Recibido por Nosotros' },
            { type: 'PRODUCT', internal: 'Consolidado', customer: 'Preparación Final' }
        ];

        // Definición de los estados de órdenes
        const orderStatuses = [
            { type: 'ORDER', internal: 'Preparado', customer: 'Listo para Enviar' },
            { type: 'ORDER', internal: 'En poder de Correos', customer: 'En Tránsito con Correos' },
            { type: 'ORDER', internal: 'Listo para Entrega', customer: 'Listo para Entrega' },
            { type: 'ORDER', internal: 'Entregado', customer: 'Entregado' }
        ];

        // Insertar todos los estados en la colección
        await statusesCollection.insertMany([...productStatuses, ...orderStatuses]);
        console.log('Estados insertados exitosamente en la colección statuses');

    } catch (e) {
        console.error('Hubo un error al insertar los estados:', e);
    } finally {
        // Asegúrate de cerrar la conexión con MongoDB cuando hayas terminado
        await client.close();
    }
}

run().catch(console.error);