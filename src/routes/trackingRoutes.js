const express = require('express');
const router = express.Router();
const { createTracker, getTrackerResults } = require('../utils/ship24');
const { validateTrackingNumber } = require('../models/trackingNumbersModels'); 
// Asegúrate de tener un modelo para validar los datos si es necesario

// Endpoint para crear un nuevo tracker
router.post('/create', async (req, res) => {
    const { trackingNumber, courierCode, orderId } = req.body;

    // Opcional: validar datos con validateTrackingNumber si aplica
    // const { error } = validateTrackingNumber({...});
    // if (error) return res.status(400).json({ message: 'Datos inválidos', details: error.details });

    const trackerId = await createTracker(trackingNumber, courierCode);
    if (trackerId) {
        // Aquí puedes guardar el tracker en tu base de datos asociado al orderId, si lo deseas
        return res.status(201).json({ message: 'Tracker creado', trackerId });
    } else {
        return res.status(500).json({ message: 'Error al crear tracker' });
    }
});

// Endpoint para consultar resultados de un tracker
router.get('/results', async (req, res) => {
    const { trackerId } = req.query;
    if (!trackerId) return res.status(400).json({ message: 'trackerId es requerido' });

    const results = await getTrackerResults(trackerId);
    if (results) {
        return res.json(results);
    } else {
        return res.status(500).json({ message: 'Error al obtener resultados del tracker' });
    }
});

module.exports = router;