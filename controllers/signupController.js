const { admin } = require('../server');
const User = require('../models/User');
const BrandSetting = require('../models/BrandSetting');
const cloudinary = require('../config/cloudinary');
const { sendWhatsAppTemplate } = require('../services/whatsappService');

const signupUser = async (req, res) => {
  const { name, email, phone, password, country, businessName, category } = req.body || {};

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
    return res.status(400).json({ success: false, errors });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Step 1: Check if user already exists in MongoDB before touching Firebase
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }

    // Step 2: Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: normalizedEmail,
      password: password,
      displayName: name.trim(),
    });

    const now = new Date().toISOString();
    const trialEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Step 3: Upload logo to Cloudinary if provided
    let logoUrl = '';
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'img', resource_type: 'image' },
          (error, result) => { if (error) reject(error); else resolve(result); }
        );
        stream.end(req.file.buffer);
      });
      logoUrl = result.secure_url;
    }

    // Step 4: Save user — upsert so retries never fail on duplicate key
    const newUser = await User.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $setOnInsert: {
          uid:                userRecord.uid,
          id:                 normalizedEmail,
          role:               'Designer',
          name:               name.trim(),
          phone:              phone.trim(),
          originalPhone:      phone.trim(),
          country:            country.trim(),
          state:              '',
          lga:                '',
          address:            '',
          email:              normalizedEmail,
          originalEmail:      normalizedEmail,
          isPhoneBasedAccount: false,
          createdAt:          now,
          businessName:       businessName.trim(),
          businessCategory:   category.trim(),
          logoUrl:            logoUrl,
          subscriptionType:   'trial',
          isTrialActive:      true,
          planType:           'Growth',
          subscriptionEndDate: trialEndDate,
          isSubscribed:       true,
          trialStartDate:     now,
        },
      },
      { upsert: true, new: true }
    );

    // Step 5: Create BrandSetting — upsert so it never fails if already exists
    console.log('🏷️ Creating BrandSetting for:', normalizedEmail);
    try {
      const brandResult = await BrandSetting.findOneAndUpdate(
        { userEmail: normalizedEmail },
        {
          $setOnInsert: {
            id:            normalizedEmail,
            userEmail:     normalizedEmail,
            businessName:  businessName.trim(),
            businessEmail: normalizedEmail,
            businessPhone: phone.trim(),
            logoUrl:       logoUrl,
          },
        },
        { upsert: true, new: true }
      );
      console.log('✅ BrandSetting result:', JSON.stringify(brandResult));
    } catch (brandErr) {
      console.error('❌ BrandSetting save failed:', brandErr.message, brandErr.code);
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: newUser,
    });

    // Step 6: Send WhatsApp welcome message (non-blocking)
    if (phone) {
      sendWhatsAppTemplate(phone.trim(), { 1: name.trim() })
        .then((waResult) => {
          if (!waResult.success) console.warn('⚠️ WhatsApp welcome not sent:', waResult.error);
          else console.log('✅ WhatsApp welcome sent to:', phone.trim());
        })
        .catch((err) => console.error('❌ WhatsApp welcome error:', err.message));
    }

  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }
    console.error('❌ Signup error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { signupUser };
