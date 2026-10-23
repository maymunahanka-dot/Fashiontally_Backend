const express = require('express');
const router = express.Router();
const multer = require('multer');
const { createFeedback, deleteFeedback, editFeedback, getFeedback, getFeedbackByEmail, replyFeedback } = require('../controllers/feedbackController');
const { verifyToken } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

router.post('/create', verifyToken, upload.single('image'), createFeedback);
router.delete('/delete/:id', verifyToken, deleteFeedback);
router.put('/edit/:id', verifyToken, upload.single('image'), editFeedback);
router.put('/reply/:id', verifyToken, replyFeedback);
router.get('/get/:id', verifyToken, getFeedback);
router.get('/list', verifyToken, getFeedbackByEmail);

module.exports = router;
