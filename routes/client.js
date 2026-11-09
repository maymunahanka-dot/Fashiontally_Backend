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
const Client = require('../models/Client');
const { enforceFreePlanLimit } = require('../services/freePlan');

// Accounts without an active plan can have at most 10 clients
router.post('/create', verifyToken, enforceFreePlanLimit(Client, 'clients'), createClient);
router.delete('/delete/:id', verifyToken, deleteClient);
router.put('/edit/:id', verifyToken, editClient);
router.get('/get/:id', verifyToken, getClient);
router.get('/list', verifyToken, getClientByEmail);

module.exports = router;
