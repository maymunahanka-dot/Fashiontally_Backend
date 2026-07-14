/**
 * signupController.js  — no Firebase
 *
 * Flow:
 *   1. Validate input
 *   2. Check duplicates in auth_users + fashiontally_users
 *   3. Hash password with bcrypt
 *   4. Generate UUID
 *   5. Upload logo (Cloudinary)
 *   6. Create AuthUser in auth_users
 *   7. Create User profile in fashiontally_users
 *   8. Create BrandSetting
 *   9. Send WhatsApp welcome (non-blocking)
 */

const crypto = require('crypto');
const User = require('../models/User');
const AuthUser = require('../models/AuthUser');
const BrandSetting = require('../models/BrandSetting');
const cloudinary = require('../config/cloudinary');
const { hashPassword } = require('../utils/passwordUtils');
const { sendWhatsAppTemplate } = require('../services/whatsappService');

const signupUser = async (req, res) => {
  console.log('[signup] ── SIGNUP ATTEMPT ───────────────────────────');
  const { name, email, phone, password, country, businessName, category } = req.body || {};

  // ── Validation ──────────────────────────────────────────────
  const errors = {};
  if (!name || !String(name).trim()) errors.name = 'Name is required';
  if (!email || !String(email).trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    errors.email = 'Invalid email address';
  }
  if (!phone || !String(phone).trim()) {
    errors.phone = 'Phone number is required';
  } else if (String(phone).trim().length < 8) {
    errors.phone = 'Phone number is too short';
  }
  if (!password || !String(password).trim()) {
    errors.password = 'Password is required';
  } else if (String(password).length < 6) {
    errors.password = 'Password must be at least 6 characters';
  }
  if (!country || !String(country).trim()) errors.country = 'Country is required';
  if (!businessName || !String(businessName).trim()) errors.businessName = 'Business name is required';
  if (!category || !String(category).trim()) errors.category = 'Category is required';

  if (Object.keys(errors).length > 0) {
    console.warn('[signup] Validation errors:', errors);
    return res.status(400).json({ success: false, errors });
  }

  const normalizedEmail = email.trim().toLowerCase();
  console.log(`[signup] email: ${normalizedEmail}`);

  try {
    // ── Step 1: Check duplicates ──────────────────────────────
    console.log('[signup] Step 1: checking duplicates');
    const existingAuth = await AuthUser.findOne({ email: normalizedEmail });
    if (existingAuth) {
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }

    // ── Step 2: Hash password ──────────────────────────────────
    console.log('[signup] Step 2: hashing password');
    const bcryptHash = await hashPassword(password);

    // ── Step 3: Generate UID ──────────────────────────────────
    const uid = crypto.randomUUID();
    console.log(`[signup] Step 3: uid: ${uid}`);

    // ── Step 4: Upload logo ───────────────────────────────────
    let logoUrl = '';
    if (req.file) {
      console.log('[signup] Step 4: uploading logo');
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'img', resource_type: 'image' },
          (error, result) => { if (error) reject(error); else resolve(result); }
        );
        stream.end(req.file.buffer);
      });
      logoUrl = result.secure_url;
      console.log('[signup] Logo:', logoUrl);
    } else if (req.body.logoUrl) {
      logoUrl = req.body.logoUrl;
    }

    const now          = new Date().toISOString();
    const trialEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── Step 5: Create AuthUser ───────────────────────────────
    console.log('[signup] Step 5: creating AuthUser');
    await new AuthUser({
      email:         normalizedEmail,
      firebaseUid:   null,
      provider:      'email',
      bcryptHash,
      displayName:   name.trim(),
      emailVerified: false,
      disabled:      false,
    }).save();
    console.log('[signup] AuthUser saved ✅');

    // ── Step 6: Create User profile ──────────────────────────
    console.log('[signup] Step 6: creating User profile');
    const newUser = await User.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $setOnInsert: {
          uid,
          id:                  normalizedEmail,
          role:                'Designer',
          name:                name.trim(),
          phone:               phone.trim(),
          originalPhone:       phone.trim(),
          country:             country.trim(),
          state:               '',
          lga:                 '',
          address:             '',
          email:               normalizedEmail,
          originalEmail:       normalizedEmail,
          isPhoneBasedAccount: false,
          createdAt:           now,
          businessName:        businessName.trim(),
          businessCategory:    category.trim(),
          logoUrl,
          subscriptionType:    'trial',
          isTrialActive:       true,
          planType:            'Growth',
          subscriptionEndDate: trialEndDate,
          isSubscribed:        true,
          trialStartDate:      now,
        },
      },
      { upsert: true, new: true }
    );
    console.log('[signup] User profile saved ✅');

    // ── Step 7: Create BrandSetting ──────────────────────────
    console.log('[signup] Step 7: creating BrandSetting');
    try {
      await BrandSetting.findOneAndUpdate(
        { userEmail: normalizedEmail },
        {
          $setOnInsert: {
            id:            normalizedEmail,
            userEmail:     normalizedEmail,
            businessName:  businessName.trim(),
            businessEmail: normalizedEmail,
            businessPhone: phone.trim(),
            logoUrl,
          },
        },
        { upsert: true, new: true }
      );
      console.log('[signup] BrandSetting saved ✅');
    } catch (brandErr) {
      console.error('[signup] BrandSetting failed (non-fatal):', brandErr.message);
    }

    res.status(201).json({ success: true, message: 'User created successfully', user: newUser });

    // ── Step 8: WhatsApp welcome (non-blocking) ──────────────
    if (phone) {
      sendWhatsAppTemplate(phone.trim(), { 1: name.trim() })
        .then(r => {
          if (!r.success) console.warn('[signup] WhatsApp not sent:', r.error);
          else console.log('[signup] WhatsApp sent ✅');
        })
        .catch(e => console.error('[signup] WhatsApp error:', e.message));
    }

  } catch (error) {
    console.error('[signup] Error:', error.message, error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { signupUser };
