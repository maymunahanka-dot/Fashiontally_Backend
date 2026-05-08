const Appointment = require('../models/Appointment');

const createAppointment = async (req, res) => {
  try {
    const data = req.body;
    const userEmail = req.effectiveEmail;
    const newAppointment = new Appointment({
      ...data,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newAppointment.save();
    res.status(201).json({ success: true, message: 'Appointment created successfully', data: newAppointment });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Appointment.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ success: false, error: 'Appointment not found' });
    res.json({ success: true, message: 'Appointment deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updated = await Appointment.findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Appointment not found' });
    res.json({ success: true, message: 'Appointment updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findOne({ id });
    if (!appointment) return res.status(404).json({ success: false, error: 'Appointment not found' });
    res.json({ success: true, data: appointment });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getAppointmentByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    const appointments = await Appointment.find({ userEmail: email }).sort({ date: -1 });
    res.json({ success: true, data: appointments });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createAppointment, deleteAppointment, editAppointment, getAppointment, getAppointmentByEmail };
