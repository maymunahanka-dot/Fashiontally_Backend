const Payment = require('../models/Payment');

const createPayment = async (req, res) => {
  try {
    const data = req.body;
    const email = req.effectiveEmail;
    const newPayment = new Payment({
      ...data,
      id: data.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newPayment.save();
    res.status(201).json({ success: true, message: 'Payment created successfully', data: newPayment });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Payment.findOneAndDelete({ id });

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({ success: true, message: 'Payment deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const updated = await Payment.findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({ success: true, message: 'Payment updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findOne({ id });

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getPaymentByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    const payments = await Payment.find({ email }).sort({ createdAt: -1 });
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createPayment,
  deletePayment,
  editPayment,
  getPayment,
  getPaymentByEmail
};
