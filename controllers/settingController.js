const Setting = require('../models/Setting');

const createSetting = async (req, res) => {
  try {
    const data = req.body;
    const newSetting = new Setting({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newSetting.save();

    res.status(201).json({
      success: true,
      message: 'Setting created successfully',
      data: newSetting
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteSetting = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Setting.findOneAndDelete({ id });

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }

    res.json({ success: true, message: 'Setting deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editSetting = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const updated = await Setting.findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }

    res.json({ success: true, message: 'Setting updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSetting = async (req, res) => {
  try {
    const { id } = req.params;
    const setting = await Setting.findOne({ id });

    if (!setting) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }

    res.json({ success: true, data: setting });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSettingByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const setting = await Setting.findOne({ userEmail: email.toLowerCase() });

    if (!setting) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }

    res.json({ success: true, data: setting });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createSetting,
  deleteSetting,
  editSetting,
  getSetting,
  getSettingByEmail
};
