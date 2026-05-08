const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  createSubAdmin,
  deleteSubAdmin,
  editSubAdmin,
  getSubAdmin,
} = require('../controllers/subAdminController');

router.post('/create', verifyToken, createSubAdmin);
router.delete('/delete', verifyToken, deleteSubAdmin);
router.put('/edit', verifyToken, editSubAdmin);
router.get('/get', verifyToken, getSubAdmin);

module.exports = router;
