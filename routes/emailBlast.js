const express = require('express');
const router  = express.Router();
const { getFirebaseUsers, sendEmailBlast, getBlastStatus } = require('../controllers/emailBlastController');

// GET  /api/email-blast/users
router.get('/users', getFirebaseUsers);

// GET  /api/email-blast/status
router.get('/status', getBlastStatus);

// POST /api/email-blast/send
router.post('/send', sendEmailBlast);

module.exports = router;
