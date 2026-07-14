/**
 * server_sync_test.js
 *
 * Standalone Firebase → MongoDB sync script.
 * Run with: node server_sync_test.js
 *
 * What it does:
 *   1. Reads lastSyncedAt per collection from MongoDB (sync_state collection)
 *   2. Pulls new/updated docs from Firestore since lastSyncedAt
 *   3. Upserts them into the matching MongoDB collection
 *   4. Handles measurements separately (subcollection inside fashiontally_clients)
 *   5. Syncs Firebase Auth users into auth_users
 *   6. Saves lastSyncedAt = now for each collection
 *
 * First run: no lastSyncedAt exists → defaults to epoch (1970) → full sync
 */

const admin    = require('firebase-admin');
const mongoose = require('mongoose');
require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────────
// 1. Init Firebase Admin
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: serviceAccountKey.json lives in backup_backend/ — either:
//   Option A: copy it here → cp ../backup_backend/serviceAccountKey.json .
//   Option B: change the path below to point to backup_backend
let db, auth;
try {
  const serviceAccount = require('../backup_backend/serviceAccountKey.json');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db   = admin.firestore();
  auth = admin.auth();
  console.log('✅ Firebase Admin initialized');
} catch (err) {
  console.error('❌ Firebase init failed:', err.message);
  console.error('   serviceAccountKey.json not found at ../backup_backend/serviceAccountKey.json');
  console.error('   Either copy it to Fashiontally_Backend/ or update the path above.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Init MongoDB
// ─────────────────────────────────────────────────────────────────────────────
async function connectMongo() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME,
  });
  console.log('✅ MongoDB connected');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Sync state model — tracks lastSyncedAt per collection
// ─────────────────────────────────────────────────────────────────────────────
const SyncState = mongoose.model('sync_state', new mongoose.Schema({
  collection:    { type: String, required: true, unique: true },
  lastSyncedAt:  { type: Date, default: new Date(0) }, // epoch = never synced
  lastRunAt:     { type: Date },
  totalSynced:   { type: Number, default: 0 },
}));

async function getLastSyncedAt(collectionName) {
  const state = await SyncState.findOne({ collection: collectionName });
  return state ? state.lastSyncedAt : new Date(0); // epoch if first run
}

async function setLastSyncedAt(collectionName, date, count) {
  await SyncState.findOneAndUpdate(
    { collection: collectionName },
    { $set: { lastSyncedAt: date, lastRunAt: new Date(), totalSynced: count } },
    { upsert: true, new: true }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Helper — normalise Firestore Timestamps to JS Date
//    Firestore can return: ISO string | { _seconds, _nanoseconds } | Timestamp object
// ─────────────────────────────────────────────────────────────────────────────
function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  // Firestore Timestamp object (.toDate method)
  if (typeof val.toDate === 'function') return val.toDate();
  // Plain object from JSON export { _seconds, _nanoseconds }
  if (val._seconds !== undefined) return new Date(val._seconds * 1000);
  return null;
}

// Recursively convert all Timestamp-like objects in a doc to ISO strings
// so MongoDB stores clean values
function sanitiseDoc(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitiseDoc);
  if (typeof obj.toDate === 'function') return obj.toDate().toISOString();
  if (obj._seconds !== undefined && obj._nanoseconds !== undefined) {
    return new Date(obj._seconds * 1000).toISOString();
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = sanitiseDoc(v);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Flat collections to sync
//    { firestoreCollection, mongoCollection, matchKey }
//    matchKey = the field used to detect duplicates (upsert key)
// ─────────────────────────────────────────────────────────────────────────────
const FLAT_COLLECTIONS = [
  // fashiontally_users needs special uid mapping — handled via uidField option
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
// 6. Sync one flat collection
// ─────────────────────────────────────────────────────────────────────────────
async function syncFlatCollection({ fs: fsName, mongo: mongoName, matchKey, uidField }) {
  console.log(`\n[sync] 📦 ${fsName}`);

  const lastSyncedAt = await getLastSyncedAt(fsName);
  const isFirstRun   = lastSyncedAt.getTime() === 0;
  console.log(`[sync]   lastSyncedAt: ${isFirstRun ? 'FIRST RUN (epoch)' : lastSyncedAt.toISOString()}`);

  const mongoCol = mongoose.connection.collection(mongoName);
  let synced = 0;
  let skipped = 0;

  try {
    let query = db.collection(fsName);

    if (!isFirstRun) {
      try {
        query = db.collection(fsName).where('createdAt', '>', lastSyncedAt);
      } catch (_) {
        query = db.collection(fsName);
      }
    }

    const snap = await query.get();
    console.log(`[sync]   Firestore returned ${snap.size} docs`);

    for (const doc of snap.docs) {
      const raw  = { id: doc.id, ...doc.data() };
      const data = sanitiseDoc(raw);

      // ── Special mapping for fashiontally_users ──────────────────────────
      // Firestore uses 'id' as the Firebase UID. MongoDB model requires 'uid'.
      // Map id → uid, fall back to email if id looks like an email or is missing.
      if (uidField) {
        const firestoreId = data[uidField] || data.id;
        // If id looks like an email address it's a phone-based account — use email as uid
        data.uid = firestoreId && !firestoreId.includes('@')
          ? firestoreId
          : (data.email || firestoreId);
      }

      // Skip docs that still have no value for the match key
      if (!data[matchKey]) {
        skipped++;
        continue;
      }

      // Skip users with no uid (can't satisfy the unique index)
      if (uidField && !data.uid) {
        skipped++;
        console.warn(`[sync]   ⚠️  skipped doc with no uid: ${data.email || doc.id}`);
        continue;
      }

      const filter = { [matchKey]: data[matchKey] };

      // Strip _id so MongoDB doesn't try to overwrite the immutable _id field
      const { _id, ...safeData } = data;

      await mongoCol.updateOne(filter, { $set: safeData }, { upsert: true });
      synced++;
    }

    await setLastSyncedAt(fsName, new Date(), synced);
    console.log(`[sync]   ✅ ${synced} upserted, ${skipped} skipped`);

  } catch (err) {
    console.error(`[sync]   ❌ Error syncing ${fsName}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Sync measurements (subcollection: fashiontally_clients/{id}/measurements/latest)
// ─────────────────────────────────────────────────────────────────────────────
const SKIP_MEASUREMENT_FIELDS = ['updatedAt', 'createdAt', 'userEmail', 'customMeasurements'];

// Generate the same id format used in the existing MongoDB records:
// {clientEmail}-{measurementName}-{timestamp}-{random4}
function makeMeasurementId(clientEmail, name, timestamp) {
  const random = Math.random().toString(36).slice(2, 6);
  return `${clientEmail}-${name}-${timestamp}-${random}`;
}

async function syncMeasurements() {
  console.log(`\n[sync] 📐 measurements (subcollection)`);

  const lastSyncedAt = await getLastSyncedAt('fashiontally_measurements');
  const isFirstRun   = lastSyncedAt.getTime() === 0;
  console.log(`[sync]   lastSyncedAt: ${isFirstRun ? 'FIRST RUN (epoch)' : lastSyncedAt.toISOString()}`);

  const mongoCol = mongoose.connection.collection('fashiontally_measurements');
  let synced = 0;

  try {
    const clientsSnap = await db.collection('fashiontally_clients').get();
    console.log(`[sync]   ${clientsSnap.size} clients to check`);

    for (const clientDoc of clientsSnap.docs) {
      const clientData  = clientDoc.data();
      const clientEmail = (clientData.email || '').toLowerCase().trim();
      const userEmail   = (clientData.userEmail || clientData.tailorId || '').toLowerCase().trim();

      if (!clientEmail) continue;

      // ── Path A: subcollection measurements/latest ──────────────────────
      const measurementRef  = db
        .collection('fashiontally_clients')
        .doc(clientDoc.id)
        .collection('measurements')
        .doc('latest');

      const measurementSnap = await measurementRef.get();

      if (measurementSnap.exists) {
        const data      = measurementSnap.data();
        const updatedAt = toDate(data.updatedAt) || new Date();

        if (isFirstRun || updatedAt > lastSyncedAt) {
          const updatedAtIso = updatedAt.toISOString();
          const timestamp    = updatedAt.getTime();

          for (const [key, value] of Object.entries(data)) {
            if (SKIP_MEASUREMENT_FIELDS.includes(key)) continue;
            if (!value || !String(value).trim()) continue;

            // Check if this clientId+name already exists — reuse its id if so
            const existing = await mongoCol.findOne({ clientId: clientEmail, name: key });
            const id = existing?.id || makeMeasurementId(clientEmail, key, timestamp);

            const doc = {
              id,
              userEmail,
              clientId:  clientEmail,
              name:      key,
              value:     String(value).trim(),
              unit:      'inches',
              createdAt: existing?.createdAt || updatedAtIso,
              updatedAt: updatedAtIso,
            };

            await mongoCol.updateOne({ id }, { $set: doc }, { upsert: true });
            synced++;
          }

          // customMeasurements array
          if (Array.isArray(data.customMeasurements)) {
            for (const m of data.customMeasurements) {
              if (!m.name || !m.value) continue;
              const mName = String(m.name).trim();
              const existing = await mongoCol.findOne({ clientId: clientEmail, name: mName });
              const id = existing?.id || makeMeasurementId(clientEmail, mName, timestamp);

              const doc = {
                id,
                userEmail,
                clientId:  clientEmail,
                name:      mName,
                value:     String(m.value).trim(),
                unit:      m.unit || 'inches',
                createdAt: existing?.createdAt || updatedAtIso,
                updatedAt: updatedAtIso,
              };

              await mongoCol.updateOne({ id }, { $set: doc }, { upsert: true });
              synced++;
            }
          }
        }
      }

      // ── Path B: measurements embedded on the client doc itself ─────────
      // Older clients store { measurements: { chest: "38", waist: "32" } }
      if (clientData.measurements && typeof clientData.measurements === 'object' && !Array.isArray(clientData.measurements)) {
        const embeddedUpdatedAt = toDate(clientData.updatedAt || clientData.lastUpdated) || new Date();

        if (isFirstRun || embeddedUpdatedAt > lastSyncedAt) {
          const updatedAtIso = embeddedUpdatedAt.toISOString();
          const timestamp    = embeddedUpdatedAt.getTime();

          for (const [key, value] of Object.entries(clientData.measurements)) {
            if (!value || !String(value).trim()) continue;

            const existing = await mongoCol.findOne({ clientId: clientEmail, name: key });
            const id = existing?.id || makeMeasurementId(clientEmail, key, timestamp);

            const doc = {
              id,
              userEmail,
              clientId:  clientEmail,
              name:      key,
              value:     String(value).trim(),
              unit:      'inches',
              createdAt: existing?.createdAt || updatedAtIso,
              updatedAt: updatedAtIso,
            };

            await mongoCol.updateOne({ id }, { $set: doc }, { upsert: true });
            synced++;
          }
        }
      }
    }

    await setLastSyncedAt('fashiontally_measurements', new Date(), synced);
    console.log(`[sync]   ✅ ${synced} measurement records upserted`);

  } catch (err) {
    console.error(`[sync]   ❌ Error syncing measurements:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Sync Firebase Auth users → auth_users collection
// ─────────────────────────────────────────────────────────────────────────────
async function syncAuthUsers() {
  console.log(`\n[sync] 🔐 Firebase Auth users`);

  const lastSyncedAt = await getLastSyncedAt('auth_users');
  const isFirstRun   = lastSyncedAt.getTime() === 0;
  console.log(`[sync]   lastSyncedAt: ${isFirstRun ? 'FIRST RUN (epoch)' : lastSyncedAt.toISOString()}`);

  const mongoCol = mongoose.connection.collection('auth_users');
  let synced = 0;
  let pageToken;

  try {
    do {
      const listResult = await auth.listUsers(1000, pageToken);

      for (const user of listResult.users) {
        const createdAt = user.metadata?.creationTime
          ? new Date(user.metadata.creationTime)
          : new Date(0);

        // Skip users created before last sync (unless first run)
        if (!isFirstRun && createdAt <= lastSyncedAt) {
          pageToken = listResult.pageToken;
          continue;
        }

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
          bcryptHash:            null,  // will be set when user resets password
          displayName:           user.displayName || '',
          photoURL:              user.photoURL || '',
          emailVerified:         user.emailVerified || false,
          disabled:              user.disabled || false,
          requiresPasswordReset: isEmail,  // email users must reset to get bcrypt hash
          resetToken:            null,
          resetTokenExpiry:      null,
          createdAt:             createdAt.toISOString(),
          updatedAt:             new Date().toISOString(),
        };

        if (!doc.email) continue;

        await mongoCol.updateOne(
          { email: doc.email },
          { $set: doc },
          { upsert: true }
        );
        synced++;
        console.log(`[sync]   ✅ ${doc.email} (${doc.provider})`);
      }

      pageToken = listResult.pageToken;
    } while (pageToken);

    await setLastSyncedAt('auth_users', new Date(), synced);
    console.log(`[sync]   ✅ ${synced} auth users upserted`);

  } catch (err) {
    console.error(`[sync]   ❌ Error syncing auth users:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Main — run everything
// ─────────────────────────────────────────────────────────────────────────────
async function runSync() {
  console.log('\n======================================================');
  console.log('  Firebase → MongoDB Sync');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('======================================================');

  try {
    await connectMongo();

    // Sync all flat collections
    for (const col of FLAT_COLLECTIONS) {
      await syncFlatCollection(col);
    }

    // Sync measurements (subcollection — special handling)
    await syncMeasurements();

    // Sync Firebase Auth users
    await syncAuthUsers();

    console.log('\n======================================================');
    console.log('  ✅ Sync complete');
    console.log(`  Finished: ${new Date().toISOString()}`);
    console.log('======================================================\n');

  } catch (err) {
    console.error('❌ Fatal sync error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected. Exiting.');
    process.exit(0);
  }
}

runSync();
