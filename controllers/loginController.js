const { admin, db } = require('../server');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SubAdmin = require('../models/SubAdmin');

const loginUser = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !String(email).trim()) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }
  if (!password || !String(password).trim()) {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();

    // Step 1: Verify password via Firebase Auth REST API
    const firebaseRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password, returnSecureToken: true }),
      }
    );
    const firebaseData = await firebaseRes.json();

    if (firebaseData.error) {
      const code = firebaseData.error.message;
      if (code === 'EMAIL_NOT_FOUND' || code === 'INVALID_PASSWORD' || code === 'INVALID_LOGIN_CREDENTIALS') {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }
      return res.status(401).json({ success: false, error: 'Authentication failed' });
    }

    // Step 2: Try to find user in MongoDB (regular user)
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // Regular user — generate token with their own email
      const token = jwt.sign(
        { uid: firebaseData.localId, email: normalizedEmail },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({ success: true, token, user });
    }

    // Step 3: Not in MongoDB users — check MongoDB subadmins
    const subAdmin = await SubAdmin.findOne({ email: normalizedEmail });

    if (subAdmin) {
      const ownerEmail = subAdmin.invitedBy.toLowerCase();

      // Fetch owner's data from MongoDB for subscription/plan info
      const ownerUser = await User.findOne({ email: ownerEmail });
      if (!ownerUser) {
        return res.status(404).json({ success: false, error: 'Owner account not found' });
      }

      // JWT carries subadmin's own email — verifyToken will resolve effectiveEmail to owner
      const token = jwt.sign(
        { uid: firebaseData.localId, email: normalizedEmail },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const subAdminData = {
        ...subAdmin.toObject(),
        uid: firebaseData.localId,
        isSubAdmin: true,
        isAdmin: true,
        ownerEmail,
        subscriptionType: ownerUser.subscriptionType,
        isTrialActive: ownerUser.isTrialActive,
        planType: ownerUser.planType,
        subscriptionEndDate: ownerUser.subscriptionEndDate,
        isSubscribed: ownerUser.isSubscribed,
      };

      return res.json({ success: true, token, user: subAdminData });
    }

    return res.status(404).json({ success: false, error: 'User not found' });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { loginUser };
