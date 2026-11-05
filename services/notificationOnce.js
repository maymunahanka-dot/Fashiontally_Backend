const NotificationLog = require('../models/NotificationLog');

/**
 * Runs `send` only if this (email, kind, key) hasn't been sent before.
 * The log entry is claimed first so two servers can't both send; it's
 * released again if sending fails, so the next run can retry.
 *
 * @param {() => Promise<{success: boolean}>} send
 * @returns {Promise<'sent' | 'skipped' | 'failed'>}
 */
const sendOnce = async ({ email, kind, key }, send) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !key) return 'skipped';

  try {
    await NotificationLog.create({ email: normalizedEmail, kind, key: String(key) });
  } catch (error) {
    if (error.code === 11000) return 'skipped';
    throw error;
  }

  const result = await send();
  if (!result?.success) {
    await NotificationLog.deleteOne({ email: normalizedEmail, kind, key: String(key) });
    return 'failed';
  }
  return 'sent';
};

module.exports = { sendOnce };
