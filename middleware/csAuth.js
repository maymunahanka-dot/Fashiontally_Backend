const jwt = require('jsonwebtoken');

const verifyCSToken = (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Accept both customer_service and admin roles
    if (decoded.role !== 'customer_service' && decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    req.csAgent = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

module.exports = { verifyCSToken };
