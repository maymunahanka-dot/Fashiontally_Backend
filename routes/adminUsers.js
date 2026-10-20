const express = require('express');
const router = express.Router();
const { getAllUsers, editUser, deleteUser, exportUserEmails } = require('../controllers/adminUsersController');
const { verifyAdminToken } = require('../middleware/adminAuth');

router.get('/list', verifyAdminToken, getAllUsers);
router.get('/export-emails', verifyAdminToken, exportUserEmails);
router.put('/edit/:userType/:id', verifyAdminToken, editUser);
router.delete('/delete/:userType/:id', verifyAdminToken, deleteUser);

module.exports = router;
