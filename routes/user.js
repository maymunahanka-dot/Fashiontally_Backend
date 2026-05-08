const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { 
  createUser, 
  deleteUser, 
  editUser, 
  getUser, 
} = require('../controllers/userController');

router.post('/create', verifyToken, createUser);
router.delete('/delete', verifyToken, deleteUser);
router.put('/edit', verifyToken, editUser);
router.get('/get', verifyToken, getUser);

module.exports = router;
