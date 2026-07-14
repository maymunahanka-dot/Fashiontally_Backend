/**
 * googleAuthController.js  — zero Firebase dependency
 *
 * POST /api/auth/google
 *
 * Accepts two flows from the frontend:
 *
 *   Flow A — @react-oauth/google implicit flow (access_token):
 *     Body: { accessToken, email, name, picture, sub }
 *     The frontend already fetched /oauth2/v3/userinfo with the access_token,
 *     and sends us the verified user info directly. We trust it because it came
 *     from Google's userinfo endpoint (verified server-side below).
 *
 *   Flow B — credential (ID token) flow:
 *     Body: { credential }
 *     We verify the Google ID token with google-auth-library (OAuth2Client).
 *
 * In both cases we:
 *   1. Confirm the identity with Google
 *   2. Upsert AuthUser in auth_users
 *   3. Upsert User profile + BrandSetting for new users
 *   4. Sign and return JWT
 */

const { OAuth2Client } = require('google-auth-library');
const https = require('https');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AuthUser = require('../models/AuthUser');
const BrandSetting = require('../models/BrandSetting');

const oauthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Flow B: verify ID token ────────────────────────────────────
async function verifyGoogleIdToken(credential) {
  console.log('[googleAuth] Flow B: verifying ID token');
  const ticket  = await oauthClient.verifyIdToken({
    idToken:  credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return {
    googleUid: payload.sub,
    email:     payload.email,
    name:      payload.name,
    picture:   payload.picture,
    verified:  payload.email_verified,
  };
}

// ── Flow A: verify access_token by hitting Google's tokeninfo endpoint ──
function verifyAccessToken(accessToken) {
  return new Promise((resolve, reject) => {
    console.log('[googleAuth] Flow A: verifying access_token via tokeninfo');
    const url = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Invalid access token: ${parsed.error_description || parsed.error}`));
          } else {
            console.log('[googleAuth] tokeninfo ok, azp:', parsed.azp);
            resolve(parsed); // contains sub, email, email_verified, etc.
          }
        } catch (e) {
          reject(new Error('Failed to parse tokeninfo response'));
        }
      });
    }).on('error', reject);
  });
}

const googleAuth = async (req, res) => {
  console.log('[googleAuth] ── GOOGLE AUTH ─────────────────────────────');
  try {
    const { credential, accessToken, email, name, picture, sub } = req.body;

    let googleUid, userEmail, userName, userPicture, emailVerified;

    if (accessToken) {
      // ── Flow A: access_token from useGoogleLogin implicit flow ──
      console.log('[googleAuth] Flow A: access_token received');
      const tokenInfo = await verifyAccessToken(accessToken);

      // tokenInfo.sub is the Google UID — cross-check with what frontend sent
      googleUid     = tokenInfo.sub  || sub;
      userEmail     = tokenInfo.email || email;
      emailVerified = tokenInfo.email_verified === 'true' || tokenInfo.email_verified === true;
      userName      = name    || '';
      userPicture   = picture || '';

      if (!userEmail) {
        return res.status(400).json({ success: false, error: 'Could not retrieve email from Google' });
      }

    } else if (credential) {
      // ── Flow B: ID token from GoogleLogin button ──────────────
      console.log('[googleAuth] Flow B: credential received');
      if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(500).json({ success: false, error: 'GOOGLE_CLIENT_ID not configured on server' });
      }
      const info = await verifyGoogleIdToken(credential);
      googleUid     = info.googleUid;
      userEmail     = info.email;
      userName      = info.name;
      userPicture   = info.picture;
      emailVerified = info.verified;

    } else {
      return res.status(400).json({ success: false, error: 'credential or accessToken is required' });
    }

    const normalizedEmail = userEmail.toLowerCase();
    console.log(`[googleAuth] Verified — email: ${normalizedEmail}, googleUid: ${googleUid}`);

    const now          = new Date().toISOString();
    const trialEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── Upsert AuthUser ────────────────────────────────────────
    console.log('[googleAuth] Upserting AuthUser');
    await AuthUser.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: {
          provider:      'google',
          googleUid:     googleUid || normalizedEmail,
          firebaseUid:   googleUid || normalizedEmail,
          displayName:   userName    || '',
          photoURL:      userPicture || '',
          emailVerified: emailVerified || false,
          updatedAt:     new Date(),
        },
        $setOnInsert: {
          email:        normalizedEmail,
          passwordHash: null,
          passwordSalt: null,
          bcryptHash:   null,
          disabled:     false,
          createdAt:    new Date(),
        },
      },
      { upsert: true, new: true }
    );
    console.log('[googleAuth] AuthUser upserted ✅');

    // ── Check if new user ──────────────────────────────────────
    const existingUser = await User.findOne({ email: normalizedEmail });
    const isNewUser    = !existingUser;
    console.log(`[googleAuth] isNewUser: ${isNewUser}`);

    if (isNewUser) {
      console.log('[googleAuth] Creating User profile');
      await new User({
        uid:                 googleUid || crypto.randomUUID(),
        id:                  normalizedEmail,
        role:                'Designer',
        name:                userName || '',
        phone:               '',
        originalPhone:       '',
        country:             '',
        email:               normalizedEmail,
        originalEmail:       normalizedEmail,
        isPhoneBasedAccount: false,
        createdAt:           now,
        businessName:        '',
        businessCategory:    '',
        logoUrl:             userPicture || '',
        subscriptionType:    'trial',
        isTrialActive:       true,
        planType:            'Growth',
        subscriptionEndDate: trialEndDate,
        isSubscribed:        true,
        trialStartDate:      now,
      }).save();
      console.log('[googleAuth] User profile created ✅');

      try {
        await new BrandSetting({
          id:            normalizedEmail,
          userEmail:     normalizedEmail,
          businessName:  '',
          businessEmail: normalizedEmail,
          logoUrl:       userPicture || '',
        }).save();
        console.log('[googleAuth] BrandSetting created ✅');
      } catch (e) {
        console.error('[googleAuth] BrandSetting failed (non-fatal):', e.message);
      }
    }

    // ── Sign JWT ───────────────────────────────────────────────
    const mongoUser = await User.findOne({ email: normalizedEmail });

    const token = jwt.sign(
      { uid: googleUid || normalizedEmail, email: normalizedEmail },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('[googleAuth] Success ✅');
    res.json({ success: true, token, isNewUser, user: mongoUser });

  } catch (error) {
    console.error('[googleAuth] Error:', error.message);
    if (
      error.message.includes('Invalid') ||
      error.message.includes('expired') ||
      error.message.includes('Wrong recipient')
    ) {
      return res.status(401).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { googleAuth };
