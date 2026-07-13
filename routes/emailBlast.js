const express = require('express');
const router  = express.Router();
const { getFirebaseUsers, sendEmailBlast } = require('../controllers/emailBlastController');

// GET  /api/email-blast/users
router.get('/users', getFirebaseUsers);

// POST /api/email-blast/send
router.post('/send', sendEmailBlast);

module.exports = router;
