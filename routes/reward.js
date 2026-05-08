const express = require('express');
const router = express.Router();
const {
    createReward,
    deleteReward,
    editReward,
    getReward,
    getRewardByEmail
} = require('../controllers/rewardController');

router.post('/create', createReward);
router.delete('/delete/:id', deleteReward);
router.put('/edit/:id', editReward);
router.get('/get/:id', getReward);
router.get('/get-by-email/:email', getRewardByEmail);

module.exports = router;
