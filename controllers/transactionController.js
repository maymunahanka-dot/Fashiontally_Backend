const Transaction = require('../models/Transaction');

/** A transaction lookup limited to the signed-in account (older records may differ in case). */
const ownTransaction = (req, id) => ({
  id,
  userEmail: new RegExp(`^${String(req.effectiveEmail || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
});

const createTransaction = async (req, res) => {
  try {
    const data = req.body;
    const userEmail = req.effectiveEmail;
    const newTransaction = new Transaction({
      ...data,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newTransaction.save();
    res.status(201).json({ success: true, message: 'Transaction created successfully', data: newTransaction });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Transaction.findOneAndDelete(ownTransaction(req, id));
    if (!deleted) return res.status(404).json({ success: false, error: 'Transaction not found' });
    res.json({ success: true, message: 'Transaction deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    // A transaction keeps its id, owner and creation time whatever the client sends
    const { id: _id, _id: _mongoId, userEmail: _owner, createdAt: _created, ...data } = req.body || {};
    const updated = await Transaction.findOneAndUpdate(
      ownTransaction(req, id),
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Transaction not found' });
    res.json({ success: true, message: 'Transaction updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findOne(ownTransaction(req, id));
    if (!transaction) return res.status(404).json({ success: false, error: 'Transaction not found' });
    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getTransactionByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    const transactions = await Transaction.find({ userEmail: email }).sort({ createdAt: -1 });
    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createTransaction, deleteTransaction, editTransaction, getTransaction, getTransactionByEmail };
