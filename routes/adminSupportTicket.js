const express = require('express');
const router  = express.Router();
const {
  adminGetTicket,
  adminGetAllTickets,
  adminReply,
  adminUpdateStatus,
} = require('../controllers/supportTicketController');
const { verifyCSToken } = require('../middleware/csAuth');

router.get('/list',           verifyCSToken, adminGetAllTickets);
router.get('/:id',            verifyCSToken, adminGetTicket);
router.post('/:id/messages',  verifyCSToken, adminReply);
router.patch('/:id/status',   verifyCSToken, adminUpdateStatus);

module.exports = router;
