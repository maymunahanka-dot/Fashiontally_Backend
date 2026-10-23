const express = require('express');
const router = express.Router();
const { createAppointment, deleteAppointment, editAppointment, getAppointment, getAppointmentByEmail, getBlockedDays, saveBlockedDays } = require('../controllers/appointmentController');
const { verifyToken } = require('../middleware/auth');

router.get('/blocked-days', verifyToken, getBlockedDays);
router.put('/blocked-days', verifyToken, saveBlockedDays);
router.post('/create', verifyToken, createAppointment);
router.delete('/delete/:id', verifyToken, deleteAppointment);
router.put('/edit/:id', verifyToken, editAppointment);
router.get('/get/:id', verifyToken, getAppointment);
router.get('/list', verifyToken, getAppointmentByEmail);

module.exports = router;
