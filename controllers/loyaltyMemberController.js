const LoyaltyMember = require('../models/LoyaltyMember');

const createLoyaltyMember = async (req, res) => {
  try {
    const data = req.body;
    const userEmail = req.effectiveEmail;
    const newMember = new LoyaltyMember({
      ...data,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      tailorId: userEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newMember.save();
    res.status(201).json({ success: true, message: 'Loyalty member created successfully', data: newMember });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteLoyaltyMember = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await LoyaltyMember.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ success: false, error: 'Loyalty member not found' });
    res.json({ success: true, message: 'Loyalty member deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editLoyaltyMember = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updated = await LoyaltyMember.findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Loyalty member not found' });
    res.json({ success: true, message: 'Loyalty member updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getLoyaltyMember = async (req, res) => {
  try {
    const { id } = req.params;
    const member = await LoyaltyMember.findOne({ id });
    if (!member) return res.status(404).json({ success: false, error: 'Loyalty member not found' });
    res.json({ success: true, data: member });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getLoyaltyMemberByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    const members = await LoyaltyMember.find({ tailorId: email }).sort({ points: -1 });
    res.json({ success: true, data: members });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createLoyaltyMember, deleteLoyaltyMember, editLoyaltyMember, getLoyaltyMember, getLoyaltyMemberByEmail };
