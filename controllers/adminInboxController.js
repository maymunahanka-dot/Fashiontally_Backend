const ContactMessage = require('../models/ContactMessage');
const DemoRequest = require('../models/DemoRequest');

// Contact Messages
const getContactMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const markContactSeen = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await ContactMessage.findOneAndUpdate(
      { id },
      { $set: { seen: true } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Message not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Demo Requests
const getDemoRequests = async (req, res) => {
  try {
    const requests = await DemoRequest.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const markDemoSeen = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await DemoRequest.findOneAndUpdate(
      { id },
      { $set: { seen: true } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Request not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getContactMessages, markContactSeen, getDemoRequests, markDemoSeen };
