const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const {
  createTicket,
  getUserTickets,
  getTicket,
  addMessage,
} = require('../controllers/supportTicketController');
const { verifyToken } = require('../middleware/auth');

// JPG, PNG, PDF — max 5 files, 5 MB each
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG or PDF files are allowed'));
  },
});

router.post('/create',           verifyToken, upload.array('attachments', 5), createTicket);
router.get('/list',              verifyToken, getUserTickets);
router.get('/get/:id',           verifyToken, getTicket);
router.post('/get/:id/messages', verifyToken, addMessage);

module.exports = router;
