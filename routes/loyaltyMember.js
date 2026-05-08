const express = require('express');
const router = express.Router();
const { createLoyaltyMember, deleteLoyaltyMember, editLoyaltyMember, getLoyaltyMember, getLoyaltyMemberByEmail } = require('../controllers/loyaltyMemberController');
const { verifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, createLoyaltyMember);
router.delete('/delete/:id', verifyToken, deleteLoyaltyMember);
router.put('/edit/:id', verifyToken, editLoyaltyMember);
router.get('/get/:id', verifyToken, getLoyaltyMember);
router.get('/list', verifyToken, getLoyaltyMemberByEmail);

module.exports = router;
