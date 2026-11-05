const express = require('express');
const router = express.Router();
const { 
  createSubscriptionCancelation, 
  deleteSubscriptionCancelation, 
  editSubscriptionCancelation, 
  getSubscriptionCancelation, 
  getSubscriptionCancelationByEmail 
} = require('../controllers/subscriptionCancelationController');
const { verifyToken } = require('../middleware/auth');

// Every route needs a signed-in user and only touches that user's account
router.use(verifyToken);

router.post('/create', createSubscriptionCancelation);
router.delete('/delete/:id', deleteSubscriptionCancelation);
router.put('/edit/:id', editSubscriptionCancelation);
router.get('/get/:id', getSubscriptionCancelation);
router.get('/get-by-email/:email', getSubscriptionCancelationByEmail);

module.exports = router;
