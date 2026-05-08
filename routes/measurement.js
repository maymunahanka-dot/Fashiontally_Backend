const express = require('express');
const router = express.Router();
const { createMeasurement, getMeasurements, editMeasurement, deleteMeasurement } = require('../controllers/measurementController');
const { verifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, createMeasurement);
router.get('/list/:clientId', verifyToken, getMeasurements);
router.put('/edit/:id', verifyToken, editMeasurement);
router.delete('/delete/:id', verifyToken, deleteMeasurement);

module.exports = router;
