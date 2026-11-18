const express = require('express');
const router = express.Router();
const { 
  createSms, 
  deleteSms, 
  editSms, 
  getSms, 
  getSmsByEmail 
} = require('../controllers/smsController');
const { verifyAdminToken } = require('../middleware/adminAuth');

// Admin only

router.post('/create', verifyAdminToken, createSms);
router.delete('/delete/:id', verifyAdminToken, deleteSms);
router.put('/edit/:id', verifyAdminToken, editSms);
router.get('/get/:id', verifyAdminToken, getSms);
router.get('/get-by-email/:email', verifyAdminToken, getSmsByEmail);

module.exports = router;
