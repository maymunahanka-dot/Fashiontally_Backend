const express = require('express');
const router = express.Router();
const { 
  createClient, 
  deleteClient, 
  editClient, 
  getClient, 
  getClientByEmail 
} = require('../controllers/clientController');
const { verifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, createClient);
router.delete('/delete/:id', verifyToken, deleteClient);
router.put('/edit/:id', verifyToken, editClient);
router.get('/get/:id', verifyToken, getClient);
router.get('/list', verifyToken, getClientByEmail);

module.exports = router;
