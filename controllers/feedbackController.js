const Feedback = require('../models/Feedback');
const cloudinary = require('../config/cloudinary');

const uploadImageToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'feedback', resource_type: 'image' },
      (error, result) => { if (error) reject(error); else resolve(result.secure_url); }
    );
    stream.end(buffer);
  });
};

const readPayload = (req) => {
  if (req.body && typeof req.body.data === 'string') {
    return JSON.parse(req.body.data || '{}');
  }
  return req.body || {};
};

const createFeedback = async (req, res) => {
  try {
    const data = readPayload(req);
    const userEmail = req.effectiveEmail;
    let imageUrl = data.imageUrl || '';
    if (req.file) imageUrl = await uploadImageToCloudinary(req.file.buffer);
    const newFeedback = new Feedback({
      ...data,
      imageUrl,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      tailorId: userEmail,
      userEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newFeedback.save();
    res.status(201).json({ success: true, message: 'Feedback created successfully', data: newFeedback });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Feedback.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ success: false, error: 'Feedback not found' });
    res.json({ success: true, message: 'Feedback deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const data = readPayload(req);
    let imageUrl = data.imageUrl;
    if (req.file) imageUrl = await uploadImageToCloudinary(req.file.buffer);
    const updatePayload = { ...data, updatedAt: new Date().toISOString() };
    if (imageUrl !== undefined) updatePayload.imageUrl = imageUrl;
    const updated = await Feedback.findOneAndUpdate(
      { id },
      { $set: updatePayload },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Feedback not found' });
    res.json({ success: true, message: 'Feedback updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const replyFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;
    const updated = await Feedback.findOneAndUpdate(
      { id },
      { $set: { reply, repliedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Feedback not found' });
    res.json({ success: true, message: 'Reply saved', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const feedback = await Feedback.findOne({ id });
    if (!feedback) return res.status(404).json({ success: false, error: 'Feedback not found' });
    res.json({ success: true, data: feedback });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getFeedbackByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    const feedbacks = await Feedback.find({
      $or: [{ tailorId: email }, { userEmail: email }]
    }).sort({ createdAt: -1 });
    res.json({ success: true, data: feedbacks });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createFeedback, deleteFeedback, editFeedback, getFeedback, getFeedbackByEmail, replyFeedback };
