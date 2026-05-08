const User = require('../models/User');
const SubAdmin = require('../models/SubAdmin');

// GET all users + sub-admins
const getAllUsers = async (req, res) => {
  try {
    const [users, subAdmins] = await Promise.all([
      User.find({}).sort({ createdAt: -1 }),
      SubAdmin.find({}).sort({ createdAt: -1 }),
    ]);

    const usersList = users.map((u) => ({ ...u.toObject(), userType: 'user' }));
    const adminsList = subAdmins.map((a) => ({ ...a.toObject(), userType: 'admin' }));

    res.json({ success: true, data: { users: usersList, admins: adminsList } });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT edit user
const editUser = async (req, res) => {
  try {
    const { id, userType } = req.params;
    const { name, phone, role, country, state, isActive, status } = req.body;

    const update = { updatedAt: new Date().toISOString() };
    if (name !== undefined) update.name = name;
    if (phone !== undefined) update.phone = phone;
    if (role !== undefined) update.role = role;
    if (country !== undefined) update.country = country;
    if (state !== undefined) update.state = state;
    if (isActive !== undefined) update.isActive = isActive;
    if (status !== undefined) update.status = status;

    let updated;
    if (userType === 'admin') {
      updated = await SubAdmin.findOneAndUpdate({ email: id }, { $set: update }, { new: true });
    } else {
      updated = await User.findOneAndUpdate(
        { $or: [{ email: id }, { _id: id }] },
        { $set: update },
        { new: true }
      );
    }

    if (!updated) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, message: 'User updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE user
const deleteUser = async (req, res) => {
  try {
    const { id, userType } = req.params;

    let deleted;
    if (userType === 'admin') {
      deleted = await SubAdmin.findOneAndDelete({ email: id });
    } else {
      deleted = await User.findOneAndDelete({ $or: [{ email: id }, { _id: id }] });
    }

    if (!deleted) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getAllUsers, editUser, deleteUser };
