const fetch = require('node-fetch');

const SHIP24_API_KEY = process.env.SHIP24_API_KEY;
const SHIP24_API_URL = process.env.SHIP24_API_URL || 'https://api.ship24.com/v1';

/**
 * Crea un tracker en Ship24.
 * @param {string} trackingNumber - Número de seguimiento.
 * @param {string|null} courierCode - (Opcional) Código del transportista.
 * @returns {Promise<string|null>} trackerId si se crea correctamente, de lo contrario null.
 */
async function createTracker(trackingNumber, courierCode = null) {
    try {
        const response = await fetch(`${SHIP24_API_URL}/trackers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SHIP24_API_KEY}`
            },
            body: JSON.stringify({ trackingNumber, courierCode })
        });

        const data = await response.json();
        if (response.ok) {
            console.log('Tracker creado:', data);
            return data.trackerId;
        } else {
            console.error('Error al crear tracker:', data);
            return null;
        }
    } catch (error) {
        console.error('Excepción al crear tracker:', error);
        return null;
    }
}

/**
 * Obtiene los resultados de un tracker en Ship24.
 * @param {string} trackerId - ID del tracker obtenido al crearlo.
 * @returns {Promise<Object|null>} Datos del tracker si la consulta es exitosa, de lo contrario null.
 */
async function getTrackerResults(trackerId) {
    try {
        const response = await fetch(`${SHIP24_API_URL}/trackers/${trackerId}/results`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SHIP24_API_KEY}`
            }
        });

        const data = await response.json();
        if (response.ok) {
            console.log('Resultados del tracker:', data);
            return data;
        } else {
            console.error('Error al obtener resultados:', data);
            return null;
        }
    } catch (error) {
        console.error('Excepción al obtener resultados:', error);
        return null;
    }
}

module.exports = {
    createTracker,
    getTrackerResults
};
