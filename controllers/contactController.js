const ContactMessage = require('../models/ContactMessage');

const createContactMessage = async (req, res) => {
  try {
    const { name, email, company, phone, subject, message, priority } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Name, email and message are required' });
    }

    const newMessage = new ContactMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      company: (company || '').trim(),
      phone: (phone || '').trim(),
      subject: (subject || '').trim(),
      message: message.trim(),
      priority: priority || 'medium',
    });

    await newMessage.save();
    res.status(201).json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('❌ Contact error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createContactMessage };
