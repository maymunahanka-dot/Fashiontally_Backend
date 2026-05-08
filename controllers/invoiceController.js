const Invoice = require('../models/Invoice');

const createInvoice = async (req, res) => {
  try {
    const data = req.body;
    const userEmail = req.effectiveEmail;
    const newInvoice = new Invoice({
      ...data,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newInvoice.save();
    res.status(201).json({ success: true, message: 'Invoice created successfully', data: newInvoice });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Invoice.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, message: 'Invoice deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updated = await Invoice.findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, message: 'Invoice updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findOne({ id });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getInvoiceByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    const invoices = await Invoice.find({ userEmail: email }).sort({ createdAt: -1 });
    res.json({ success: true, data: invoices });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createInvoice, deleteInvoice, editInvoice, getInvoice, getInvoiceByEmail };
