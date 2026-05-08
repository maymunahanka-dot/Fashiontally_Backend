const express = require('express');
const router = express.Router();
const { getAllUsers, editUser, deleteUser } = require('../controllers/adminUsersController');
const { verifyAdminToken } = require('../middleware/adminAuth');

router.get('/list', verifyAdminToken, getAllUsers);
router.put('/edit/:userType/:id', verifyAdminToken, editUser);
router.delete('/delete/:userType/:id', verifyAdminToken, deleteUser);

module.exports = router;
