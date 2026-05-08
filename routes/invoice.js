const express = require('express');
const router = express.Router();
const { createInvoice, deleteInvoice, editInvoice, getInvoice, getInvoiceByEmail } = require('../controllers/invoiceController');
const { verifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, createInvoice);
router.delete('/delete/:id', verifyToken, deleteInvoice);
router.put('/edit/:id', verifyToken, editInvoice);
router.get('/get/:id', verifyToken, getInvoice);
router.get('/list', verifyToken, getInvoiceByEmail);

module.exports = router;
