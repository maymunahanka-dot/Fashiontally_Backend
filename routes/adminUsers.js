const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserDetails,
  editUser,
  deleteUser,
  addNote,
  sendPasswordReset,
  notifyUser,
  bulkAction,
  exportUserEmails,
} = require('../controllers/adminUsersController');
const { verifyAdminToken } = require('../middleware/adminAuth');

router.get('/list', verifyAdminToken, getAllUsers);
router.get('/export-emails', verifyAdminToken, exportUserEmails);
router.post('/bulk', verifyAdminToken, bulkAction);
router.get('/details/:userType/:id', verifyAdminToken, getUserDetails);
router.put('/edit/:userType/:id', verifyAdminToken, editUser);
router.delete('/delete/:userType/:id', verifyAdminToken, deleteUser);
router.post('/note/:userType/:id', verifyAdminToken, addNote);
router.post('/password-reset/:userType/:id', verifyAdminToken, sendPasswordReset);
router.post('/notify/:userType/:id', verifyAdminToken, notifyUser);

module.exports = router;
