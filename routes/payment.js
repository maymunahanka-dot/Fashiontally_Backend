const express = require('express');
const router = express.Router();
const { createPayment, deletePayment, editPayment, getPayment, getPaymentByEmail } = require('../controllers/paymentController');
const { verifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, createPayment);
router.delete('/delete/:id', verifyToken, deletePayment);
router.put('/edit/:id', verifyToken, editPayment);
router.get('/get/:id', verifyToken, getPayment);
router.get('/list', verifyToken, getPaymentByEmail);
router.get('/get-by-email/:email', verifyToken, getPaymentByEmail);

module.exports = router;
