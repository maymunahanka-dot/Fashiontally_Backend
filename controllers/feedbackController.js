const Feedback = require('../models/Feedback');

const createFeedback = async (req, res) => {
  try {
    const data = req.body;
    const userEmail = req.effectiveEmail;
    const newFeedback = new Feedback({
      ...data,
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
    const data = req.body;
    const updated = await Feedback.findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
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
