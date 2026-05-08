const express = require('express');
const router = express.Router();
const multer = require('multer');
const { 
  createDesign, 
  deleteDesign, 
  editDesign, 
  getDesign, 
  getDesignByEmail 
} = require('../controllers/designController');
const { verifyToken } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

router.post('/create', verifyToken, upload.single('image'), createDesign);
router.delete('/delete/:id', verifyToken, deleteDesign);
router.put('/edit/:id', verifyToken, upload.single('image'), editDesign);
router.get('/get/:id', verifyToken, getDesign);
router.get('/list', verifyToken, getDesignByEmail);

module.exports = router;
