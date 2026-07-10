/**
 * services/syncScheduler.service.js
 *
 * Firebase → MongoDB sync — runs every hour inside the main server process.
 * Re-uses the Firebase Admin instance already initialised by firebase/firebase-admin.js
 * and the Mongoose connection already opened by server.js.
 *
 * Schedule: every hour at :00  (cron: "0 * * * *")
 */

const cron     = require('node-cron');
const mongoose = require('mongoose');
const admin    = require('../firebase/firebase-admin');

const db   = admin.firestore();
const auth = admin.auth();

// ─────────────────────────────────────────────────────────────────────────────
// Sync-state model  (tracks lastSyncedAt per collection)
// ─────────────────────────────────────────────────────────────────────────────
// Guard against redefining the model on hot-reload
const SyncState = mongoose.models.sync_state ||
  mongoose.model('sync_state', new mongoose.Schema({
    collection:   { type: String, required: true, unique: true },
    lastSyncedAt: { type: Date, default: new Date(0) },
    lastRunAt:    { type: Date },
    totalSynced:  { type: Number, default: 0 },
  }));

async function getLastSyncedAt(col) {
  const state = await SyncState.findOne({ collection: col });
  return state ? state.lastSyncedAt : new Date(0);
}

async function setLastSyncedAt(col, date, count) {
  await SyncState.findOneAndUpdate(
    { collection: col },
    { $set: { lastSyncedAt: date, lastRunAt: new Date(), totalSynced: count } },
    { upsert: true }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function toDate(val) {
  if (!val)                              return null;
  if (val instanceof Date)               return val;
  if (typeof val === 'string')           return new Date(val);
  if (typeof val.toDate === 'function')  return val.toDate();
  if (val._seconds !== undefined)        return new Date(val._seconds * 1000);
  return null;
}

function sanitiseDoc(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj))              return obj.map(sanitiseDoc);
  if (typeof obj.toDate === 'function') return obj.toDate().toISOString();
  if (obj._seconds !== undefined && obj._nanoseconds !== undefined)
    return new Date(obj._seconds * 1000).toISOString();
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = sanitiseDoc(v);
  return out;
}

function makeMeasurementId(clientEmail, name, timestamp) {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${clientEmail}-${name}-${timestamp}-${rand}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collections to sync
// ─────────────────────────────────────────────────────────────────────────────
const FLAT_COLLECTIONS = [
  { fs: 'fashiontally_users',          mongo: 'fashiontally_users',          matchKey: 'email', uidField: 'id' },
  { fs: 'fashiontally_clients',        mongo: 'fashiontally_clients',        matchKey: 'id'    },
  { fs: 'fashiontally_orders',         mongo: 'fashiontally_orders',         matchKey: 'id'    },
  { fs: 'fashiontally_appointments',   mongo: 'fashiontally_appointments',   matchKey: 'id'    },
  { fs: 'fashiontally_invoices',       mongo: 'fashiontally_invoices',       matchKey: 'id'    },
  { fs: 'fashiontally_inventory',      mongo: 'fashiontally_inventory',      matchKey: 'id'    },
  { fs: 'fashiontally_designs',        mongo: 'fashiontally_designs',        matchKey: 'id'    },
  { fs: 'fashiontally_transactions',   mongo: 'fashiontally_transactions',   matchKey: 'id'    },
  { fs: 'fashiontally_settings',       mongo: 'fashiontally_settings',       matchKey: 'id'    },
  { fs: 'fashiontally_brand_settings', mongo: 'fashiontally_brand_settings', matchKey: 'userEmail' },
  { fs: 'fashiontally_sms',            mongo: 'fashiontally_sms',            matchKey: 'id'    },
  { fs: 'payments',                    mongo: 'payments',                    matchKey: 'id'    },
  { fs: 'campaigns',                   mongo: 'campaigns',                   matchKey: 'id'    },
  { fs: 'loyaltyMembers',              mongo: 'loyaltyMembers',              matchKey: 'id'    },
  { fs: 'rewards',                     mongo: 'rewards',                     matchKey: 'id'    },
  { fs: 'feedback',                    mongo: 'feedback',                    matchKey: 'id'    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sync one flat collection
// ─────────────────────────────────────────────────────────────────────────────
async function syncFlatCollection({ fs: fsName, mongo: mongoName, matchKey, uidField }) {
  const lastSyncedAt = await getLastSyncedAt(fsName);
  const isFirstRun   = lastSyncedAt.getTime() === 0;
  const mongoCol     = mongoose.connection.collection(mongoName);
  let synced = 0, skipped = 0;

  try {
    let query = db.collection(fsName);
    if (!isFirstRun) {
      try { query = db.collection(fsName).where('createdAt', '>', lastSyncedAt); } catch (_) {}
    }

    const snap = await query.get();

    for (const doc of snap.docs) {
      const raw  = { id: doc.id, ...doc.data() };
      const data = sanitiseDoc(raw);

      if (uidField) {
        const firestoreId = data[uidField] || data.id;
        data.uid = firestoreId && !firestoreId.includes('@')
          ? firestoreId
          : (data.email || firestoreId);
      }

      if (!data[matchKey])          { skipped++; continue; }
      if (uidField && !data.uid)    { skipped++; continue; }

      const { _id, ...safeData } = data;
      await mongoCol.updateOne({ [matchKey]: data[matchKey] }, { $set: safeData }, { upsert: true });
      synced++;
    }

    await setLastSyncedAt(fsName, new Date(), synced);
    console.log(`[sync]   ✅ ${fsName} — ${synced} upserted, ${skipped} skipped`);
  } catch (err) {
    console.error(`[sync]   ❌ ${fsName}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync measurements subcollection
// ─────────────────────────────────────────────────────────────────────────────
const SKIP_FIELDS = ['updatedAt', 'createdAt', 'userEmail', 'customMeasurements'];

async function syncMeasurements() {
  const lastSyncedAt = await getLastSyncedAt('fashiontally_measurements');
  const isFirstRun   = lastSyncedAt.getTime() === 0;
  const mongoCol     = mongoose.connection.collection('fashiontally_measurements');
  let synced = 0;

  try {
    const clientsSnap = await db.collection('fashiontally_clients').get();

    for (const clientDoc of clientsSnap.docs) {
      const clientData  = clientDoc.data();
      const clientEmail = (clientData.email    || '').toLowerCase().trim();
      const userEmail   = (clientData.userEmail || clientData.tailorId || '').toLowerCase().trim();
      if (!clientEmail) continue;

      // Path A: subcollection measurements/latest
      const snap = await db
        .collection('fashiontally_clients')
        .doc(clientDoc.id)
        .collection('measurements')
        .doc('latest')
        .get();

      if (snap.exists) {
        const data      = snap.data();
        const updatedAt = toDate(data.updatedAt) || new Date();

        if (isFirstRun || updatedAt > lastSyncedAt) {
          const iso       = updatedAt.toISOString();
          const timestamp = updatedAt.getTime();

          for (const [key, value] of Object.entries(data)) {
            if (SKIP_FIELDS.includes(key) || !value || !String(value).trim()) continue;
            const existing = await mongoCol.findOne({ clientId: clientEmail, name: key });
            const id       = existing?.id || makeMeasurementId(clientEmail, key, timestamp);
            await mongoCol.updateOne(
              { id },
              { $set: { id, userEmail, clientId: clientEmail, name: key,
                        value: String(value).trim(), unit: 'inches',
                        createdAt: existing?.createdAt || iso, updatedAt: iso } },
              { upsert: true }
            );
            synced++;
          }

          if (Array.isArray(data.customMeasurements)) {
            for (const m of data.customMeasurements) {
              if (!m.name || !m.value) continue;
              const mName    = String(m.name).trim();
              const existing = await mongoCol.findOne({ clientId: clientEmail, name: mName });
              const id       = existing?.id || makeMeasurementId(clientEmail, mName, updatedAt.getTime());
              await mongoCol.updateOne(
                { id },
                { $set: { id, userEmail, clientId: clientEmail, name: mName,
                          value: String(m.value).trim(), unit: m.unit || 'inches',
                          createdAt: existing?.createdAt || iso, updatedAt: iso } },
                { upsert: true }
              );
              synced++;
            }
          }
        }
      }

      // Path B: measurements embedded on the client doc
      if (clientData.measurements && typeof clientData.measurements === 'object' && !Array.isArray(clientData.measurements)) {
        const updatedAt = toDate(clientData.updatedAt || clientData.lastUpdated) || new Date();
        if (isFirstRun || updatedAt > lastSyncedAt) {
          const iso       = updatedAt.toISOString();
          const timestamp = updatedAt.getTime();
          for (const [key, value] of Object.entries(clientData.measurements)) {
            if (!value || !String(value).trim()) continue;
            const existing = await mongoCol.findOne({ clientId: clientEmail, name: key });
            const id       = existing?.id || makeMeasurementId(clientEmail, key, timestamp);
            await mongoCol.updateOne(
              { id },
              { $set: { id, userEmail, clientId: clientEmail, name: key,
                        value: String(value).trim(), unit: 'inches',
                        createdAt: existing?.createdAt || iso, updatedAt: iso } },
              { upsert: true }
            );
            synced++;
          }
        }
      }
    }

    await setLastSyncedAt('fashiontally_measurements', new Date(), synced);
    console.log(`[sync]   ✅ fashiontally_measurements — ${synced} upserted`);
  } catch (err) {
    console.error('[sync]   ❌ fashiontally_measurements:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Firebase Auth users → auth_users
// ─────────────────────────────────────────────────────────────────────────────
async function syncAuthUsers() {
  const lastSyncedAt = await getLastSyncedAt('auth_users');
  const isFirstRun   = lastSyncedAt.getTime() === 0;
  const mongoCol     = mongoose.connection.collection('auth_users');
  let synced = 0, pageToken;

  try {
    do {
      const listResult = await auth.listUsers(1000, pageToken);

      for (const user of listResult.users) {
        const createdAt = user.metadata?.creationTime
          ? new Date(user.metadata.creationTime)
          : new Date(0);

        if (!isFirstRun && createdAt <= lastSyncedAt) { pageToken = listResult.pageToken; continue; }

        const providers = (user.providerData || []).map(p => p.providerId);
        const isGoogle  = providers.includes('google.com');
        const isEmail   = providers.includes('password');

        const doc = {
          email:                 (user.email || '').toLowerCase(),
          firebaseUid:           user.uid || '',
          provider:              isGoogle ? 'google' : 'email',
          googleUid:             isGoogle ? user.uid : null,
          passwordHash:          user.passwordHash || null,
          passwordSalt:          user.passwordSalt || null,
          bcryptHash:            null,
          displayName:           user.displayName || '',
          photoURL:              user.photoURL || '',
          emailVerified:         user.emailVerified || false,
          disabled:              user.disabled || false,
          requiresPasswordReset: isEmail,
          resetToken:            null,
          resetTokenExpiry:      null,
          createdAt:             createdAt.toISOString(),
          updatedAt:             new Date().toISOString(),
        };

        if (!doc.email) continue;
        await mongoCol.updateOne({ email: doc.email }, { $set: doc }, { upsert: true });
        synced++;
      }

      pageToken = listResult.pageToken;
    } while (pageToken);

    await setLastSyncedAt('auth_users', new Date(), synced);
    console.log(`[sync]   ✅ auth_users — ${synced} upserted`);
  } catch (err) {
    console.error('[sync]   ❌ auth_users:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sync job
// ─────────────────────────────────────────────────────────────────────────────
async function runSync() {
  console.log(`\n[sync] ══════════════════════════════════════════`);
  console.log(`[sync] 🔄 Firebase → MongoDB sync started`);
  console.log(`[sync]    ${new Date().toISOString()}`);
  console.log(`[sync] ══════════════════════════════════════════`);

  for (const col of FLAT_COLLECTIONS) {
    await syncFlatCollection(col);
  }

  await syncMeasurements();
  await syncAuthUsers();

  console.log(`[sync] ══════════════════════════════════════════`);
  console.log(`[sync] ✅ Sync complete — ${new Date().toISOString()}`);
  console.log(`[sync] ══════════════════════════════════════════\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler — every hour at :00
// ─────────────────────────────────────────────────────────────────────────────
function startSyncScheduler() {
  // Run once immediately on server start
  runSync().catch(err => console.error('[sync] ❌ Initial run error:', err.message));

  // Then every hour at minute 0
  cron.schedule('0 * * * *', () => {
    runSync().catch(err => console.error('[sync] ❌ Hourly run error:', err.message));
  });

  console.log('✅ Firebase→MongoDB sync scheduler started (every hour + immediate run on boot)');
}

module.exports = { startSyncScheduler, runSync };
