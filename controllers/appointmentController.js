const Appointment = require('../models/Appointment');
const AppointmentBlock = require('../models/AppointmentBlock');

const isWeekend = (dateStr) => {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  if (!year || !month || !day) return false;
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 || weekday === 6;
};

const blockedReason = async (userEmail, dateStr) => {
  if (!dateStr) return null;
  const block = await AppointmentBlock.findOne({ userEmail });
  if (!block) return null;
  if (block.dates?.includes(dateStr)) return 'That day is blocked.';
  if (block.blockWeekends && isWeekend(dateStr)) return 'Weekends are blocked.';
  return null;
};

const getBlockedDays = async (req, res) => {
  try {
    const block = await AppointmentBlock.findOne({ userEmail: req.effectiveEmail });
    res.json({
      success: true,
      data: {
        blockWeekends: Boolean(block?.blockWeekends),
        dates: block?.dates || [],
      },
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const saveBlockedDays = async (req, res) => {
  try {
    const dates = Array.isArray(req.body.dates)
      ? [...new Set(req.body.dates.map((date) => String(date).trim()).filter(Boolean))]
      : [];
    const block = await AppointmentBlock.findOneAndUpdate(
      { userEmail: req.effectiveEmail },
      {
        $set: {
          blockWeekends: Boolean(req.body.blockWeekends),
          dates,
          updatedAt: new Date().toISOString(),
        },
      },
      { new: true, upsert: true }
    );
    res.json({
      success: true,
      data: { blockWeekends: block.blockWeekends, dates: block.dates },
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const createAppointment = async (req, res) => {
  try {
    const data = req.body;
    const userEmail = req.effectiveEmail;
    const reason = await blockedReason(userEmail, data.date);
    if (reason) return res.status(400).json({ success: false, error: reason });
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
    const reason = await blockedReason(req.effectiveEmail, data.date);
    if (reason) return res.status(400).json({ success: false, error: reason });
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

module.exports = { createAppointment, deleteAppointment, editAppointment, getAppointment, getAppointmentByEmail, getBlockedDays, saveBlockedDays };
