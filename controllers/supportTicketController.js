const SupportTicket = require('../models/SupportTicket');
const cloudinary    = require('../config/cloudinary');
const User          = require('../models/User');
const { sendNotification } = require('../services/notification.service');

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Find the user by email and send them a push notification.
 * Fails silently — never blocks the HTTP response.
 */
async function notifyTicketUser(userEmail, title, body) {
  try {
    const user = await User.findOne({ email: userEmail }).select('_id fcmTokens').lean();
    if (!user) return;
    await sendNotification(String(user._id), title, body, { type: 'support_ticket' });
  } catch (err) {
    console.error('[ticket-notif] Failed to send notification:', err.message);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateTicketId() {
  const chars   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand    = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const now     = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `SUP-${dateStr}-${rand}`;
}

const uploadFileToCloudinary = (buffer, mimetype) => {
  const resourceType = mimetype === 'application/pdf' ? 'raw' : 'image';
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'support_tickets', resource_type: resourceType },
      (error, result) => { if (error) reject(error); else resolve(result.secure_url); }
    );
    stream.end(buffer);
  });
};

// ── User: Create ticket ────────────────────────────────────────────────────────

const createTicket = async (req, res) => {
  try {
    const { category, subIssue, description, dateNoticed } = req.body;
    const userEmail = req.effectiveEmail;

    if (!category || !subIssue || !description) {
      return res.status(400).json({ success: false, error: 'category, subIssue and description are required' });
    }

    // Upload attachments to Cloudinary (if any)
    const attachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadFileToCloudinary(file.buffer, file.mimetype);
        attachments.push(url);
      }
    }

    const newTicket = new SupportTicket({
      id: generateTicketId(),
      userEmail,
      category,
      subIssue,
      description,
      dateNoticed: dateNoticed || '',
      attachments,
      messages:  [{ sender: 'user', text: description }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await newTicket.save();
    res.status(201).json({ success: true, message: 'Ticket created successfully', data: newTicket });
  } catch (error) {
    console.error('❌ Error creating ticket:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── User: List all tickets for the logged-in user ─────────────────────────────

const getUserTickets = async (req, res) => {
  try {
    const userEmail = req.effectiveEmail;
    const tickets   = await SupportTicket.find({ userEmail }).sort({ createdAt: -1 });
    res.json({ success: true, data: tickets });
  } catch (error) {
    console.error('❌ Error fetching tickets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── User: Get single ticket ────────────────────────────────────────────────────

const getTicket = async (req, res) => {
  try {
    const { id }    = req.params;
    const userEmail = req.effectiveEmail;
    const ticket    = await SupportTicket.findOne({ id, userEmail });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    res.json({ success: true, data: ticket });
  } catch (error) {
    console.error('❌ Error fetching ticket:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── User: Add a message to a thread ───────────────────────────────────────────

const addMessage = async (req, res) => {
  try {
    const { id }    = req.params;
    const { text }  = req.body;
    const userEmail = req.effectiveEmail;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    const ticket = await SupportTicket.findOne({ id, userEmail });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    if (ticket.status === 'resolved') {
      return res.status(400).json({ success: false, error: 'Cannot reply to a resolved ticket' });
    }

    ticket.messages.push({ sender: 'user', text: text.trim() });
    ticket.updatedAt = new Date().toISOString();
    await ticket.save();

    res.json({ success: true, message: 'Message sent', data: ticket });
  } catch (error) {
    console.error('❌ Error adding message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Admin: Get single ticket by id ────────────────────────────────────────────

const adminGetTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await SupportTicket.findOne({ id });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    res.json({ success: true, data: ticket });
  } catch (error) {
    console.error('❌ Error fetching ticket:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Admin: Get all tickets (optional ?status= filter) ─────────────────────────

const adminGetAllTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const query      = status ? { status } : {};
    const tickets    = await SupportTicket.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: tickets });
  } catch (error) {
    console.error('❌ Error fetching all tickets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Admin: Reply to a ticket thread ───────────────────────────────────────────

const adminReply = async (req, res) => {
  try {
    const { id }   = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    const ticket = await SupportTicket.findOne({ id });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    ticket.messages.push({ sender: 'support', text: text.trim() });
    // Move open → in_progress on first support reply
    if (ticket.status === 'open') ticket.status = 'in_progress';
    ticket.updatedAt = new Date().toISOString();
    await ticket.save();

    // ── Push notification to the user ─────────────────────────
    const preview = text.trim().length > 80
      ? text.trim().slice(0, 77) + '…'
      : text.trim();
    notifyTicketUser(
      ticket.userEmail,
      '💬 Support Reply',
      `Your ticket (${ticket.id}) has a new reply: "${preview}"`
    );

    res.json({ success: true, message: 'Reply sent', data: ticket });
  } catch (error) {
    console.error('❌ Error sending admin reply:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Admin: Update ticket status ────────────────────────────────────────────────

const adminUpdateStatus = async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;
    const allowed    = ['open', 'in_progress', 'resolved'];

    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${allowed.join(', ')}` });
    }

    const ticket = await SupportTicket.findOneAndUpdate(
      { id },
      { $set: { status, updatedAt: new Date().toISOString() } },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    // ── Push notification to the user ─────────────────────────
    const statusLabels = {
      open:        '🔓 Reopened',
      in_progress: '🔄 In Progress',
      resolved:    '✅ Resolved',
    };
    const statusMessages = {
      open:        `Your ticket (${ticket.id}) has been reopened.`,
      in_progress: `Your ticket (${ticket.id}) is now being worked on.`,
      resolved:    `Your ticket (${ticket.id}) has been marked as resolved. We hope your issue is fixed!`,
    };
    notifyTicketUser(
      ticket.userEmail,
      `🎫 Ticket ${statusLabels[status] || status}`,
      statusMessages[status] || `Your ticket (${ticket.id}) status changed to ${status}.`
    );

    res.json({ success: true, message: 'Status updated', data: ticket });
  } catch (error) {
    console.error('❌ Error updating ticket status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createTicket,
  getUserTickets,
  getTicket,
  addMessage,
  adminGetTicket,
  adminGetAllTickets,
  adminReply,
  adminUpdateStatus,
};
