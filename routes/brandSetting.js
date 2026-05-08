const express = require('express');
const router = express.Router();
const { 
  createBrandSetting, 
  deleteBrandSetting, 
  editBrandSetting, 
  getBrandSetting, 
  getBrandSettingByEmail 
} = require('../controllers/brandSettingController');

router.post('/create', createBrandSetting);
router.delete('/delete/:id', deleteBrandSetting);
router.put('/edit/:id', editBrandSetting);
router.get('/get/:id', getBrandSetting);
router.get('/get-by-email/:email', getBrandSettingByEmail);

module.exports = router;
