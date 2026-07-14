// Orders are stored in the same fashiontally_designs collection as designs,
// distinguished by type: "order" — matching how mm (the tailor portal) works.
const Design = require('../models/Design');

const createOrder = async (req, res) => {
  try {
    const data = req.body;
    const userEmail = req.effectiveEmail;

    const newOrder = new Design({
      ...data,
      type: 'order',   // always force type = "order"
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userEmail,
      tailorId: userEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newOrder.save();
    res.status(201).json({ success: true, message: 'Order created successfully', data: newOrder });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Design.findOneAndDelete({ id, type: 'order' });
    if (!deleted) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, message: 'Order deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const updated = await Design.findOneAndUpdate(
      { id, type: 'order' },
      { $set: { ...data, type: 'order', updatedAt: new Date().toISOString() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, message: 'Order updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Design.findOne({ id, type: 'order' });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getOrderByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    // Match mm: type === "order" OR no type set (legacy records)
    const orders = await Design.find({
      userEmail: email,
      $or: [{ type: 'order' }, { type: { $exists: false } }, { type: '' }],
    }).sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createOrder, deleteOrder, editOrder, getOrder, getOrderByEmail };
