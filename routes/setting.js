const express = require('express');
const router = express.Router();
const { 
  createSetting, 
  deleteSetting, 
  editSetting, 
  getSetting, 
  getSettingByEmail 
} = require('../controllers/settingController');

router.post('/create', createSetting);
router.delete('/delete/:id', deleteSetting);
router.put('/edit/:id', editSetting);
router.get('/get/:id', getSetting);
router.get('/get-by-email/:email', getSettingByEmail);

module.exports = router;
