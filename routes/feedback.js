const express = require('express');
const router = express.Router();
const { createFeedback, deleteFeedback, editFeedback, getFeedback, getFeedbackByEmail, replyFeedback } = require('../controllers/feedbackController');
const { verifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, createFeedback);
router.delete('/delete/:id', verifyToken, deleteFeedback);
router.put('/edit/:id', verifyToken, editFeedback);
router.put('/reply/:id', verifyToken, replyFeedback);
router.get('/get/:id', verifyToken, getFeedback);
router.get('/list', verifyToken, getFeedbackByEmail);

module.exports = router;
