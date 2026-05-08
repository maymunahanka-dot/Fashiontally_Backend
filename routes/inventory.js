const express = require('express');
const router = express.Router();
const { 
  createInventory, 
  deleteInventory, 
  editInventory, 
  getInventory, 
  getInventoryByEmail 
} = require('../controllers/inventoryController');
const { verifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, createInventory);
router.delete('/delete/:id', verifyToken, deleteInventory);
router.put('/edit/:id', verifyToken, editInventory);
router.get('/get/:id', verifyToken, getInventory);
router.get('/list', verifyToken, getInventoryByEmail);

module.exports = router;
