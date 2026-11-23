/**
 * Records when an account was last active: the last signed-in request it made to the backend.
 * Saved on the owner's account (a team member's activity counts for the business), at most
 * once an hour per account, without slowing the request down.
 */
const User = require('../models/User');

const EVERY_MS = 60 * 60 * 1000;
const lastSaved = new Map(); // email -> ms of the last save from this server

const touchLastActive = (email) => {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return;
  const now = Date.now();
  if (now - (lastSaved.get(key) || 0) < EVERY_MS) return;
  lastSaved.set(key, now);
  if (lastSaved.size > 50000) lastSaved.clear(); // keep memory bounded

  User.updateOne({ email: key }, { $set: { lastActiveAt: new Date(now).toISOString() } }).catch((error) => {
    lastSaved.delete(key);
    console.error('[last-active] save failed:', error.message);
  });
};

module.exports = { touchLastActive };
