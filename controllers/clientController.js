const Client = require('../models/Client');

const createClient = async (req, res) => {
  try {
    const data = req.body;
    const userEmail = req.effectiveEmail;

    // Check for duplicate phone
    const existing = await Client.findOne({ userEmail, phone: data.phone });
    if (existing) {
      return res.status(400).json({ success: false, error: 'You already have a client with this phone number' });
    }

    const newClient = new Client({
      ...data,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newClient.save();

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: newClient
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const buildIdQuery = (id) => {
  const encoded = id.replace(/@/g, '%40');
  const decoded = id.replace(/%40/gi, '@');
  const conditions = [{ id }, { email: id }];
  if (encoded !== id) conditions.push({ id: encoded });
  if (decoded !== id) conditions.push({ id: decoded });
  return { $or: conditions };
};

const editClient = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updated = await Client.findOneAndUpdate(
      buildIdQuery(id),
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Client not found' });
    res.json({ success: true, message: 'Client updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getClient = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await Client.findOne(buildIdQuery(id));
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });
    res.json({ success: true, data: client });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteClient = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Client.findOneAndDelete(buildIdQuery(id));
    if (!deleted) return res.status(404).json({ success: false, error: 'Client not found' });
    res.json({ success: true, message: 'Client deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getClientByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    const clients = await Client.find({ userEmail: email });
    res.json({ success: true, data: clients });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createClient,
  deleteClient,
  editClient,
  getClient,
  getClientByEmail
};
