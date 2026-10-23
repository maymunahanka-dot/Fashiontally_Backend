const express = require('express');
const router = express.Router();
const { 
  createBrandSetting, 
  deleteBrandSetting, 
  editBrandSetting, 
  getBrandSetting, 
  getBrandSettingByEmail,
  getExchangeRate
} = require('../controllers/brandSettingController');

router.get('/exchange-rate', getExchangeRate);
router.post('/create', createBrandSetting);
router.delete('/delete/:id', deleteBrandSetting);
router.put('/edit/:id', editBrandSetting);
router.get('/get/:id', getBrandSetting);
router.get('/get-by-email/:email', getBrandSettingByEmail);

module.exports = router;
