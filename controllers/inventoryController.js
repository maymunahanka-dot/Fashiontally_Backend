const Inventory = require('../models/Inventory');

const createInventory = async (req, res) => {
  try {
    const data = req.body;
    const userEmail = req.effectiveEmail;
    const newInventory = new Inventory({
      ...data,
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
    const data = req.body;
    const updated = await Inventory.findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
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
