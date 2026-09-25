/**
 * services/syncStats.service.js
 *
 * In-memory sync stats — resets every server restart (by design).
 * Also persists daily summaries to MongoDB sync_logs collection
 * so the admin dashboard can show historical graphs.
 */

const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// In-memory state — lives only while server is running
// ─────────────────────────────────────────────────────────────────────────────
const state = {
  syncEnabled:   true,       // master switch — can be toggled via API
  isRunning:     false,      // true while initial full sync is in progress
  listenersActive: false,    // true once all listeners are attached
  sessionStart:  new Date(), // when this server instance started
  totalSynced:   0,          // total events processed this session
  totalErrors:   0,
  lastEventAt:   null,       // timestamp of last sync event
  lastEventType: null,       // 'added' | 'modified' | 'removed'
  lastCollection: null,      // which collection the last event was for
  recentEvents:  [],         // last 50 events (ring buffer)
};

// ─────────────────────────────────────────────────────────────────────────────
// MongoDB model — persists daily totals for the graph
// ─────────────────────────────────────────────────────────────────────────────
const syncLogSchema = new mongoose.Schema({
  date:       { type: String, required: true, unique: true }, // YYYY-MM-DD
  added:      { type: Number, default: 0 },
  modified:   { type: Number, default: 0 },
  removed:    { type: Number, default: 0 },
  errors:     { type: Number, default: 0 },
  total:      { type: Number, default: 0 },
  updatedAt:  { type: Date,   default: Date.now },
});

const SyncLog = mongoose.models.sync_logs ||
  mongoose.model('sync_logs', syncLogSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Record a sync event
// ─────────────────────────────────────────────────────────────────────────────
async function recordEvent(type, collection) {
  if (!state.syncEnabled) return;

  const now = new Date();

  // Update in-memory state
  state.totalSynced++;
  state.lastEventAt     = now.toISOString();
  state.lastEventType   = type;
  state.lastCollection  = collection;

  // Add to recent events ring buffer (keep last 50)
  state.recentEvents.unshift({
    type,
    collection,
    timestamp: now.toISOString(),
  });
  if (state.recentEvents.length > 50) state.recentEvents.pop();

  // Persist to MongoDB daily summary (fire and forget)
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const inc = {};
  if (type === 'added')    inc.added    = 1;
  if (type === 'modified') inc.modified = 1;
  if (type === 'removed')  inc.removed  = 1;
  inc.total = 1;

  SyncLog.findOneAndUpdate(
    { date: dateStr },
    { $inc: inc, $set: { updatedAt: now } },
    { upsert: true }
  ).catch(() => {}); // never block
}

async function recordError(collection) {
  state.totalErrors++;
  const dateStr = new Date().toISOString().slice(0, 10);
  SyncLog.findOneAndUpdate(
    { date: dateStr },
    { $inc: { errors: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true }
  ).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Getters / setters
// ─────────────────────────────────────────────────────────────────────────────
function getState()                    { return { ...state }; }
function setSyncEnabled(val)           { state.syncEnabled = val; }
function setRunning(val)               { state.isRunning = val; }
function setListenersActive(val)       { state.listenersActive = val; }

// Get historical logs for graph — last N days
async function getLogs(days = 30) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);

  return SyncLog.find({ date: { $gte: fromStr } })
    .sort({ date: 1 })
    .lean();
}

module.exports = {
  recordEvent,
  recordError,
  getState,
  setSyncEnabled,
  setRunning,
  setListenersActive,
  getLogs,
  SyncLog,
};
