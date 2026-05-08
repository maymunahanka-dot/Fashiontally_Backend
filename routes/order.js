const express = require('express');
const router = express.Router();
const { createOrder, deleteOrder, editOrder, getOrder, getOrderByEmail } = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, createOrder);
router.delete('/delete/:id', verifyToken, deleteOrder);
router.put('/edit/:id', verifyToken, editOrder);
router.get('/get/:id', verifyToken, getOrder);
router.get('/list', verifyToken, getOrderByEmail);

module.exports = router;
