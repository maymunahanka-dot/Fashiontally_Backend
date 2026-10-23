const express = require('express');
const router = express.Router();
const multer = require('multer');
const { 
  createInventory, 
  deleteInventory, 
  editInventory, 
  getInventory, 
  getInventoryByEmail 
} = require('../controllers/inventoryController');
const { verifyToken } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

router.post('/create', verifyToken, upload.single('image'), createInventory);
router.delete('/delete/:id', verifyToken, deleteInventory);
router.put('/edit/:id', verifyToken, upload.single('image'), editInventory);
router.get('/get/:id', verifyToken, getInventory);
router.get('/list', verifyToken, getInventoryByEmail);

module.exports = router;
