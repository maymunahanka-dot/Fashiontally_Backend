const { admin } = require('../server');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const BrandSetting = require('../models/BrandSetting');

const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, error: 'idToken is required' });
    }

    // Verify the Firebase ID token from the frontend Google popup
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;
    const normalizedEmail = email.toLowerCase();

    const now = new Date().toISOString();
    const trialEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Check MongoDB for existing user
    const existingMongoUser = await User.findOne({ email: normalizedEmail });
    const isNewUser = !existingMongoUser;

    if (isNewUser) {
      // Create in MongoDB only
      const newUser = new User({
        uid,
        id: normalizedEmail,
        role: 'Designer',
        name: name || '',
        phone: '',
        originalPhone: '',
        country: '',
        email: normalizedEmail,
        originalEmail: normalizedEmail,
        isPhoneBasedAccount: false,
        createdAt: now,
        businessName: '',
        businessCategory: '',
        logoUrl: picture || '',
        subscriptionType: 'trial',
        isTrialActive: true,
        planType: 'Growth',
        subscriptionEndDate: trialEndDate,
        isSubscribed: true,
        trialStartDate: now,
      });
      await newUser.save();

      // Create default BrandSetting
      await new BrandSetting({
        id: normalizedEmail,
        userEmail: normalizedEmail,
        businessName: '',
        businessEmail: normalizedEmail,
        logoUrl: picture || '',
      }).save();
    }

    // Get final user data from MongoDB (source of truth for JWT-based app)
    const mongoUser = await User.findOne({ email: normalizedEmail });

    const token = jwt.sign(
      { uid, email: normalizedEmail },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      isNewUser,
      user: mongoUser,
    });

  } catch (error) {
    console.error('❌ Google auth error:', error);
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ success: false, error: 'Invalid or expired Google token' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { googleAuth };
