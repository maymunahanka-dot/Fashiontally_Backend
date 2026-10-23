const Inventory = require('../models/Inventory');
const cloudinary = require('../config/cloudinary');

const uploadImageToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'inventory', resource_type: 'image' },
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

const createInventory = async (req, res) => {
  try {
    const data = readPayload(req);
    const userEmail = req.effectiveEmail;
    let imageUrl = data.imageUrl || '';
    if (req.file) {
      imageUrl = await uploadImageToCloudinary(req.file.buffer);
    }
    const newInventory = new Inventory({
      ...data,
      imageUrl,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newInventory.save();
    res.status(201).json({ success: true, message: 'Inventory item created successfully', data: newInventory });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Inventory.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ success: false, error: 'Inventory item not found' });
    res.json({ success: true, message: 'Inventory item deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const data = readPayload(req);
    let imageUrl = data.imageUrl;
    if (req.file) {
      imageUrl = await uploadImageToCloudinary(req.file.buffer);
    }
    const updatePayload = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    if (imageUrl !== undefined) updatePayload.imageUrl = imageUrl;
    const updated = await Inventory.findOneAndUpdate(
      { id },
      { $set: updatePayload },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Inventory item not found' });
    res.json({ success: true, message: 'Inventory item updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Inventory.findOne({ id });
    if (!item) return res.status(404).json({ success: false, error: 'Inventory item not found' });
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getInventoryByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    const items = await Inventory.find({ userEmail: email });
    res.json({ success: true, data: items });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createInventory, deleteInventory, editInventory, getInventory, getInventoryByEmail };
