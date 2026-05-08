const Measurement = require('../models/Measurement');

// Create one or more measurements for a client
const createMeasurement = async (req, res) => {
  try {
    const userEmail = req.effectiveEmail;
    const { clientId, measurements } = req.body; // clientId = client email

    if (!clientId) return res.status(400).json({ success: false, error: 'clientId (client email) is required' });
    if (!Array.isArray(measurements) || measurements.length === 0)
      return res.status(400).json({ success: false, error: 'measurements array is required' });

    const created = [];
    const duplicates = [];

    for (const m of measurements) {
      if (!m.name || !m.value) continue;

      // Check if measurement with same name already exists for this client
      const existing = await Measurement.findOne({
        userEmail,
        clientId: clientId.toLowerCase(),
        name: m.name.trim(),
      });

      if (existing) {
        duplicates.push(m.name.trim());
        continue;
      }

      const doc = new Measurement({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        userEmail,
        clientId: clientId.toLowerCase(),
        name: m.name.trim(),
        value: m.value.trim(),
        unit: m.unit || 'inches',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await doc.save();
      created.push(doc);
    }

    if (duplicates.length > 0 && created.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Measurement(s) already exist for this client: ${duplicates.join(', ')}`,
      });
    }

    res.status(201).json({
      success: true,
      data: created,
      ...(duplicates.length > 0 && { warning: `Skipped duplicates: ${duplicates.join(', ')}` }),
    });
  } catch (error) {
    console.error('❌ createMeasurement error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all measurements for a client (clientId = client email)
const getMeasurements = async (req, res) => {
  try {
    const userEmail = req.effectiveEmail;
    const clientId = decodeURIComponent(req.params.clientId).toLowerCase();

    const list = await Measurement.find({ userEmail, clientId }).sort({ createdAt: 1 });
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('❌ getMeasurements error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Edit a single measurement by its id
const editMeasurement = async (req, res) => {
  try {
    const userEmail = req.effectiveEmail;
    const { id } = req.params;
    const { name, value, unit } = req.body;

    const updated = await Measurement.findOneAndUpdate(
      { id, userEmail },
      { $set: { name, value, unit, updatedAt: new Date().toISOString() } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, error: 'Measurement not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('❌ editMeasurement error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete a single measurement by its id
const deleteMeasurement = async (req, res) => {
  try {
    const userEmail = req.effectiveEmail;
    const { id } = req.params;

    const deleted = await Measurement.findOneAndDelete({ id, userEmail });
    if (!deleted) return res.status(404).json({ success: false, error: 'Measurement not found' });
    res.json({ success: true, message: 'Measurement deleted' });
  } catch (error) {
    console.error('❌ deleteMeasurement error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createMeasurement, getMeasurements, editMeasurement, deleteMeasurement };
