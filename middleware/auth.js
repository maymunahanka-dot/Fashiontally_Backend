const jwt = require('jsonwebtoken');
const SubAdmin = require('../models/SubAdmin');

const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    // Check if user is a subadmin in MongoDB
    const subAdmin = await SubAdmin.findOne({ email });

    if (subAdmin?.invitedBy) {
      req.effectiveEmail = subAdmin.invitedBy.toLowerCase();
    } else {
      req.effectiveEmail = email;
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

module.exports = { verifyToken };
