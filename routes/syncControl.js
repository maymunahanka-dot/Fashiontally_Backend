/**
 * routes/syncControl.js
 *
 * Admin-only routes for Firebase ↔ MongoDB sync control + monitoring.
 *
 * GET  /api/sync/status      — current in-memory state + recent events
 * GET  /api/sync/logs        — historical daily totals for graph (?days=30)
 * PUT  /api/sync/toggle      — enable or disable sync  { enabled: true/false }
 * POST /api/sync/shutdown    — gracefully stop all Firebase listeners
 */

const express  = require('express');
const router   = express.Router();
const { verifyAdminToken } = require('../middleware/adminAuth');
const syncStats = require('../services/syncStats.service');

// Lazy import to avoid circular deps — syncScheduler exports stopAllListeners
function getSyncScheduler() {
  return require('../services/syncScheduler.service');
}

// ── GET /api/sync/status ──────────────────────────────────────────────────────
router.get('/status', verifyAdminToken, (req, res) => {
  const s = syncStats.getState();
  res.json({
    success: true,
    data: {
      syncEnabled:     s.syncEnabled,
      isRunning:       s.isRunning,
      listenersActive: s.listenersActive,
      sessionStart:    s.sessionStart,
      totalSynced:     s.totalSynced,
      totalErrors:     s.totalErrors,
      lastEventAt:     s.lastEventAt,
      lastEventType:   s.lastEventType,
      lastCollection:  s.lastCollection,
      recentEvents:    s.recentEvents,
    },
  });
});

// ── GET /api/sync/logs ────────────────────────────────────────────────────────
router.get('/logs', verifyAdminToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const logs = await syncStats.getLogs(days);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/sync/toggle ──────────────────────────────────────────────────────
router.put('/toggle', verifyAdminToken, (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enabled must be boolean' });
  }
  syncStats.setSyncEnabled(enabled);
  console.log(`[syncControl] Sync ${enabled ? 'ENABLED' : 'DISABLED'} by admin`);
  res.json({ success: true, data: { syncEnabled: enabled } });
});

// ── POST /api/sync/shutdown ───────────────────────────────────────────────────
router.post('/shutdown', verifyAdminToken, (req, res) => {
  try {
    const { stopAllListeners } = getSyncScheduler();
    stopAllListeners();
    syncStats.setListenersActive(false);
    console.log('[syncControl] ⛔ Sync listeners shut down by admin');
    res.json({ success: true, message: 'Sync listeners stopped. Restart server to re-activate.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
