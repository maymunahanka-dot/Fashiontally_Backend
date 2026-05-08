const { admin } = require('../server');
const User = require('../models/User');

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const email = req.user.email;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, error: 'New password must be different from current password' });
    }

    // Verify current password by signing in via Firebase REST API
    const apiKey = process.env.FIREBASE_API_KEY;
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: currentPassword, returnSecureToken: true }),
      }
    );
    const verifyData = await verifyRes.json();

    if (verifyData.error) {
      const code = verifyData.error.message;
      if (code === 'INVALID_PASSWORD' || code === 'INVALID_LOGIN_CREDENTIALS') {
        return res.status(400).json({ success: false, error: 'Current password is incorrect' });
      }
      return res.status(400).json({ success: false, error: verifyData.error.message });
    }

    // Get Firebase UID and update password
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Look up Firebase user by email to ensure we have the correct UID
    const firebaseUser = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(firebaseUser.uid, { password: newPassword });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({ success: false, error: 'Failed to update password' });
  }
};

module.exports = { changePassword };
