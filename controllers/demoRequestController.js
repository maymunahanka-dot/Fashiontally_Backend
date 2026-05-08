const DemoRequest = require('../models/DemoRequest');

const createDemoRequest = async (req, res) => {
  try {
    const { fullName, email, phoneNumber, businessName, businessType, preferredDate, preferredTime, message } = req.body;

    if (!fullName || !email || !phoneNumber || !businessName || !preferredDate || !preferredTime) {
      return res.status(400).json({ success: false, error: 'Please fill in all required fields' });
    }

    const newRequest = new DemoRequest({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber.trim(),
      businessName: businessName.trim(),
      businessType: businessType || '',
      preferredDate,
      preferredTime,
      message: (message || '').trim(),
      status: 'pending',
    });

    await newRequest.save();
    res.status(201).json({ success: true, message: 'Demo request submitted successfully' });
  } catch (error) {
    console.error('❌ Demo request error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createDemoRequest };
