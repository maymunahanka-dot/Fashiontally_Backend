const express = require('express');
const router = express.Router();
const { 
  createCampaign, 
  deleteCampaign, 
  editCampaign, 
  getCampaign, 
  getCampaignByEmail 
} = require('../controllers/campaignController');

router.post('/create', createCampaign);
router.delete('/delete/:id', deleteCampaign);
router.put('/edit/:id', editCampaign);
router.get('/get/:id', getCampaign);
router.get('/get-by-email/:email', getCampaignByEmail);

module.exports = router;
