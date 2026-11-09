const express = require('express');
const router = express.Router();
const { createInvoice, deleteInvoice, editInvoice, getInvoice, getInvoiceByEmail } = require('../controllers/invoiceController');
const { verifyToken } = require('../middleware/auth');
const Invoice = require('../models/Invoice');
const { enforceFreePlanLimit } = require('../services/freePlan');

// Accounts without an active plan can have at most 10 invoices
router.post('/create', verifyToken, enforceFreePlanLimit(Invoice, 'invoices'), createInvoice);
router.delete('/delete/:id', verifyToken, deleteInvoice);
router.put('/edit/:id', verifyToken, editInvoice);
router.get('/get/:id', verifyToken, getInvoice);
router.get('/list', verifyToken, getInvoiceByEmail);

module.exports = router;
