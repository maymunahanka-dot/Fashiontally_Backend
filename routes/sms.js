const express = require('express');
const router = express.Router();
const { 
  createSms, 
  deleteSms, 
  editSms, 
  getSms, 
  getSmsByEmail 
} = require('../controllers/smsController');

router.post('/create', createSms);
router.delete('/delete/:id', deleteSms);
router.put('/edit/:id', editSms);
router.get('/get/:id', getSms);
router.get('/get-by-email/:email', getSmsByEmail);

module.exports = router;
