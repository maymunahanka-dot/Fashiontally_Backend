const express = require('express');
const router = express.Router();
const { createTransaction, deleteTransaction, editTransaction, getTransaction, getTransactionByEmail } = require('../controllers/transactionController');
const { verifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, createTransaction);
router.delete('/delete/:id', verifyToken, deleteTransaction);
router.put('/edit/:id', verifyToken, editTransaction);
router.get('/get/:id', verifyToken, getTransaction);
router.get('/list', verifyToken, getTransactionByEmail);

module.exports = router;
