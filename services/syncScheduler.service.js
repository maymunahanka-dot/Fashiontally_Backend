/**
 * services/syncScheduler.service.js
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           TWO-WAY FIREBASE ↔ MONGODB SYNC                   ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                              ║
 * ║  FIREBASE → MONGODB  (real-time listener)                   ║
 * ║    • added    → upsert in MongoDB                           ║
 * ║    • modified → update in MongoDB (only if Firebase is newer)║
 * ║    • removed  → delete from MongoDB                         ║
 * ║                                                              ║
 * ║  MONGODB → FIREBASE  (called by controllers after a write)  ║
 * ║    • pushToFirebase(collection, data) — call this after any  ║
 * ║      MongoDB write to keep Firebase in sync                 ║
 * ║    • pushDeleteToFirebase(collection, docId) — call after   ║
 * ║      a MongoDB delete                                        ║
 * ║                                                              ║
 * ║  LOOP PREVENTION                                             ║
 * ║    Every write to Firebase is tagged with:                   ║
 * ║      _syncSource: 'mongodb'                                  ║
 * ║      _syncedAt: ISO timestamp                                ║
 * ║    The listener checks this tag and skips docs we wrote      ║
 * ║    ourselves (within the last 10 seconds).                   ║
 * ║                                                              ║
 * ║  AUTH RULES                                                  ║
 * ║    • Firebase → MongoDB: always sync auth_users              ║
 * ║    • MongoDB → Firebase: only update if user EXISTS in       ║
 * ║      Firebase Auth already. Never create new Firebase users. ║
 * ║    • bcryptHash, resetToken, resetTokenExpiry are            ║
 * ║      MongoDB-only fields — never sent to Firebase.           ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const mongoose = require('mongoose');
const admin    = require('../firebase/firebase-admin');
const syncStats = require('./syncStats.service');

const db   = admin.firestore();
const auth = admin.auth();

// Stores all listener unsubscribe functions for clean shutdown
const unsubscribeFunctions = [];

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Tag we add to every Firestore write that comes FROM MongoDB
// so the listener knows to skip it and not loop back
const SYNC_SOURCE_TAG  = '_syncSource';
const SYNC_TIME_TAG    = '_syncedAt';
const SYNC_SOURCE_VAL  = 'mongodb';
const LOOP_WINDOW_MS   = 10000; // ignore our own writes for 10 seconds

// Fields that only MongoDB owns — never overwrite these from Firebase
// and never send them to Firebase
const MONGO_ONLY_FIELDS = [
  'bcryptHash',
  'resetToken',
  'resetTokenExpiry',
  'requiresPasswordReset',
  'fcmTokens',
  '_id',
  '__v',
];

// ─────────────────────────────────────────────────────────────────────────────
// COLLECTIONS CONFIG
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
  { fs: 'fashiontally_admins',         mongo: 'fashiontally_admins',         matchKey: 'email' },
  { fs: 'payments',                    mongo: 'payments',                    matchKey: 'id'    },
  { fs: 'campaigns',                   mongo: 'campaigns',                   matchKey: 'id'    },
  { fs: 'loyaltyMembers',              mongo: 'loyaltyMembers',              matchKey: 'id'    },
  { fs: 'rewards',                     mongo: 'rewards',                     matchKey: 'id'    },
  { fs: 'feedback',                    mongo: 'feedback',                    matchKey: 'id'    },
];

// Quick lookup: mongoCollectionName → config
const COLLECTION_MAP = {};
for (const col of FLAT_COLLECTIONS) {
  COLLECTION_MAP[col.mongo] = col;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function toDate(val) {
  if (!val)                             return null;
  if (val instanceof Date)              return val;
  if (typeof val === 'string')          return new Date(val);
  if (typeof val.toDate === 'function') return val.toDate();
  if (val._seconds !== undefined)       return new Date(val._seconds * 1000);
  return null;
}

/**
 * Convert all Firestore Timestamps in a document to ISO strings
 */
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

/**
 * Strip fields that should never leave MongoDB before sending to Firebase
 */
function stripMongoOnlyFields(data) {
  const clean = { ...data };
  for (const field of MONGO_ONLY_FIELDS) delete clean[field];
  // Also remove internal Mongo fields
  delete clean._id;
  delete clean.__v;
  return clean;
}

/**
 * Check if a Firestore document was written by us (loop detection)
 * Returns true if we should skip processing this change
 */
function isOurOwnWrite(data) {
  if (data[SYNC_SOURCE_TAG] !== SYNC_SOURCE_VAL) return false;
  const syncedAt = toDate(data[SYNC_TIME_TAG]);
  if (!syncedAt) return false;
  return (Date.now() - syncedAt.getTime()) < LOOP_WINDOW_MS;
}

/**
 * Build MongoDB-ready data object from a Firestore document snapshot
 */
function buildDocData(fsDoc, uidField) {
  const raw  = { id: fsDoc.id, ...fsDoc.data() };
  const data = sanitiseDoc(raw);

  // fashiontally_users: map Firestore 'id' field → 'uid' in MongoDB
  if (uidField) {
    const firestoreId = data[uidField] || data.id;
    data.uid = firestoreId && !firestoreId.includes('@')
      ? firestoreId
      : (data.email || firestoreId);
  }

  // Remove our sync tags — don't store these in MongoDB
  delete data[SYNC_SOURCE_TAG];
  delete data[SYNC_TIME_TAG];

  return data;
}

/**
 * Compare updatedAt timestamps — returns true if Firebase data is newer
 * or equal (meaning we should apply it). Returns false if MongoDB is newer
 * (meaning we keep the MongoDB value).
 */
function firebaseIsNewerOrEqual(firebaseData, mongoDoc) {
  const fbTime    = toDate(firebaseData.updatedAt);
  const mongoTime = toDate(mongoDoc?.updatedAt);

  // No timestamps available → always apply Firebase (safe default)
  if (!fbTime)    return true;
  if (!mongoTime) return true;

  return fbTime >= mongoTime;
}

function makeMeasurementId(clientEmail, name, timestamp) {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${clientEmail}-${name}-${timestamp}-${rand}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ██████████████████████████████████████████████████████████████████████████
// DIRECTION 1:  FIREBASE → MONGODB
// ██████████████████████████████████████████████████████████████████████████
// ─────────────────────────────────────────────────────────────────────────────

// ── Initial full sync on startup ─────────────────────────────────────────────

// Wraps a promise with a timeout — so Firestore .get() never hangs forever
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms — ${label}`)), ms)
    ),
  ]);
}

async function runInitialFullSync() {
  console.log('\n[sync] ══════════════════════════════════════════');
  console.log('[sync] 🔄 Initial full sync (Firebase → MongoDB)');
  console.log('[sync] ══════════════════════════════════════════');

  // Test Firestore connectivity FIRST before looping all collections
  console.log('[sync] 🔍 Testing Firestore connection...');
  try {
    await withTimeout(
      db.collection('fashiontally_users').limit(1).get(),
      15000,
      'Firestore connectivity test'
    );
    console.log('[sync] ✅ Firestore connection OK');
  } catch (err) {
    console.error('[sync] ❌ FIRESTORE CONNECTION FAILED:', err.message);
    console.error('[sync]    Check your serviceAccountKey.json and Firestore permissions.');
    console.error('[sync]    Skipping initial sync — listeners will still be attempted.');
    return;
  }

  for (const col of FLAT_COLLECTIONS) {
    await fullSyncCollection(col);
  }
  await fullSyncMeasurements();
  await fullSyncAuthUsers();

  console.log('[sync] ✅ Initial full sync complete');
  console.log('[sync] ══════════════════════════════════════════\n');
}

async function fullSyncCollection({ fs: fsName, mongo: mongoName, matchKey, uidField }) {
  const mongoCol = mongoose.connection.collection(mongoName);
  let synced = 0, skipped = 0;
  console.log(`[sync]   📦 syncing ${fsName}...`);
  try {
    const snap = await withTimeout(
      db.collection(fsName).get(),
      30000,
      `fullSync ${fsName}`
    );
    console.log(`[sync]   📦 ${fsName} — got ${snap.size} docs from Firestore`);

    // Build bulk upsert operations — one MongoDB round trip for the whole collection
    const bulkOps = [];
    for (const doc of snap.docs) {
      const data = buildDocData(doc, uidField);
      if (!data[matchKey])       { skipped++; continue; }
      if (uidField && !data.uid) { skipped++; continue; }

      const { _id, ...safeData } = data;
      bulkOps.push({
        updateOne: {
          filter: { [matchKey]: data[matchKey] },
          update: { $set: safeData },
          upsert: true,
        },
      });
      synced++;
    }

    if (bulkOps.length > 0) {
      await mongoCol.bulkWrite(bulkOps, { ordered: false });
    }

    console.log(`[sync]   ✅ ${fsName} — ${synced} upserted, ${skipped} skipped`);
  } catch (err) {
    console.error(`[sync]   ❌ ${fsName}: ${err.message}`);
  }
}

// ── Real-time listener: Firebase → MongoDB ───────────────────────────────────

function startListenerForCollection({ fs: fsName, mongo: mongoName, matchKey, uidField }) {
  const mongoCol = mongoose.connection.collection(mongoName);

  console.log(`[sync:listener] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[sync:listener] 📡 ATTACHING listener to Firestore collection:`);
  console.log(`[sync:listener]    Firestore : ${fsName}`);
  console.log(`[sync:listener]    MongoDB   : ${mongoName}`);
  console.log(`[sync:listener]    Match key : ${matchKey}`);
  console.log(`[sync:listener] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Firestore sends ALL existing docs as 'added' on first snapshot.
  // We skip that initial dump since full sync already handled it.
  // After the first call, we process everything normally.
  let isFirstSnapshot = true;

  const unsubscribe = db.collection(fsName).onSnapshot(
    async (snapshot) => {
      const changes = snapshot.docChanges();

      // First snapshot = initial state dump from Firestore (all docs as 'added')
      // Skip it — full sync already handled this
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        const realChanges = changes.filter(c => c.type !== 'added');
        if (realChanges.length === 0) {
          console.log(`[sync:listener] ✅ Listener READY — ${fsName} (skipped ${changes.length} initial docs, waiting for real changes...)\n`);
          return;
        }
        // If somehow there are non-added changes in first snapshot, process them
        console.log(`[sync:listener] ✅ Listener READY — ${fsName} (${realChanges.length} pending changes)\n`);
      }

      // Filter to only real changes (skip 'added' after initial snapshot too,
      // since new docs from Firebase will show as 'added' — we DO want those)
      // Actually after first snapshot, 'added' means a genuinely new document
      // So we only skip 'added' in the very first snapshot call
      console.log(`\n[sync:listener] 🔔 FIREBASE CALLED BACK — collection: ${fsName}`);
      console.log(`[sync:listener]    changes: ${changes.length} | ${new Date().toISOString()}`);

      for (const change of changes) {
        const fsDoc      = change.doc;
        const changeType = change.type;

        console.log(`[sync:listener]    ── ${changeType.toUpperCase()} | docId: ${fsDoc.id}`);

        try {
          // ── DELETED ──────────────────────────────────────────────────────
          if (changeType === 'removed') {
            const raw        = sanitiseDoc({ id: fsDoc.id, ...fsDoc.data() });
            const matchValue = raw[matchKey];
            if (matchValue) {
              console.log(`[sync:listener]       🗑️  DELETING from MongoDB — ${matchKey}: ${matchValue}`);
              const result = await mongoCol.deleteOne({ [matchKey]: matchValue });
              console.log(`[sync:listener]       ✅ deleted ${result.deletedCount} doc(s) from ${mongoName}`);
              syncStats.recordEvent('removed', fsName);
            } else {
              console.warn(`[sync:listener]       ⚠️  REMOVED but no matchKey (${matchKey}) — skipping`);
            }
            continue;
          }

          // ── ADDED or MODIFIED ─────────────────────────────────────────────
          const rawData = { id: fsDoc.id, ...fsDoc.data() };

          // Loop detection: skip if this write came from us
          if (isOurOwnWrite(rawData)) {
            console.log(`[sync:listener]       ⏭️  SKIPPING — our own write (loop prevention)`);
            continue;
          }

          const data = buildDocData(fsDoc, uidField);
          if (!data[matchKey]) {
            console.warn(`[sync:listener]       ⚠️  SKIPPING — missing matchKey (${matchKey})`);
            continue;
          }
          if (uidField && !data.uid) {
            console.warn(`[sync:listener]       ⚠️  SKIPPING — missing uid`);
            continue;
          }

          // Conflict resolution: only update if Firebase is newer
          const existing = await mongoCol.findOne({ [matchKey]: data[matchKey] });
          if (existing && !firebaseIsNewerOrEqual(data, existing)) {
            console.log(`[sync:listener]       ⏭️  SKIPPING — MongoDB is newer for ${data[matchKey]}`);
            continue;
          }

          const { _id, ...safeData } = data;
          const result = await mongoCol.updateOne(
            { [matchKey]: data[matchKey] },
            { $set: safeData },
            { upsert: true }
          );

          const action = result.upsertedCount > 0 ? 'INSERTED' : 'UPDATED';
          const emoji  = changeType === 'added' ? '➕' : '✏️ ';
          console.log(`[sync:listener]       ${emoji} ${action} in MongoDB — ${matchKey}: ${data[matchKey]}`);
          syncStats.recordEvent(changeType, fsName);

          // ── Special: fashiontally_users from Firebase ──────────────────
          // When old app signs up, Firestore creates a fashiontally_users doc.
          // We auto-create auth_users in MongoDB so the user can log in
          // via the new web app too (scrypt hash fetched from Firebase Auth).
          if (fsName === 'fashiontally_users' && data.email) {
            try {
              const authCol      = mongoose.connection.collection('auth_users');
              const existingAuth = await authCol.findOne({ email: data.email.toLowerCase() });
              if (!existingAuth) {
                // Pull their password hash from Firebase Auth
                let passwordHash = null, passwordSalt = null, firebaseUid = data.uid || null;
                const lookupUid = data.uid && !String(data.uid).includes('@') ? data.uid : null;
                if (lookupUid) {
                  try {
                    const fbUser = await auth.getUser(lookupUid);
                    passwordHash = fbUser.passwordHash || null;
                    passwordSalt = fbUser.passwordSalt || null;
                    firebaseUid  = fbUser.uid;
                  } catch (_) {}
                }
                if (!firebaseUid && data.email) {
                  try {
                    const fbUser = await auth.getUserByEmail(data.email.toLowerCase());
                    passwordHash = fbUser.passwordHash || null;
                    passwordSalt = fbUser.passwordSalt || null;
                    firebaseUid  = fbUser.uid;
                  } catch (_) {}
                }

                const isGoogle = data.provider === 'google' || (!passwordHash && !passwordSalt);
                await authCol.insertOne({
                  email:                 data.email.toLowerCase(),
                  firebaseUid:           firebaseUid || null,
                  provider:              isGoogle ? 'google' : 'email',
                  googleUid:             isGoogle ? firebaseUid : null,
                  passwordHash,
                  passwordSalt,
                  bcryptHash:            null,
                  displayName:           data.name || data.displayName || '',
                  photoURL:              data.photoURL || data.logoUrl || '',
                  emailVerified:         data.emailVerified || false,
                  disabled:              false,
                  requiresPasswordReset: !isGoogle,
                  resetToken:            null,
                  resetTokenExpiry:      null,
                  createdAt:             new Date(),
                  updatedAt:             new Date(),
                });
                console.log(`[sync:listener]       ✅ auth_users created for new signup: ${data.email} (${isGoogle ? 'google' : 'email'})`);
              }
            } catch (authErr) {
              console.error(`[sync:listener]       ⚠️  auth_users creation failed for ${data.email}: ${authErr.message}`);
            }
          }

          // ── Special: fashiontally_admins from Firebase ──────────────────
          // When old app creates a subadmin in Firestore, auto-create their
          // auth_users record so they can also log in via the new web app.
          if (fsName === 'fashiontally_admins' && result.upsertedCount > 0 && data.email) {
            try {
              const authCol = mongoose.connection.collection('auth_users');
              const existingAuth = await authCol.findOne({ email: data.email.toLowerCase() });
              if (!existingAuth) {
                // Get their Firebase Auth password hash so scrypt login works
                let passwordHash = null, passwordSalt = null;
                if (data.uid) {
                  try {
                    const fbUser = await auth.getUser(data.uid);
                    passwordHash = fbUser.passwordHash || null;
                    passwordSalt = fbUser.passwordSalt || null;
                  } catch (_) {}
                }
                await authCol.insertOne({
                  email:         data.email.toLowerCase(),
                  firebaseUid:   data.uid || null,
                  provider:      'email',
                  googleUid:     null,
                  passwordHash,
                  passwordSalt,
                  bcryptHash:    null,
                  displayName:   data.name || '',
                  photoURL:      '',
                  emailVerified: false,
                  disabled:      data.status === 'inactive',
                  requiresPasswordReset: true,
                  resetToken:    null,
                  resetTokenExpiry: null,
                  createdAt:     new Date(),
                  updatedAt:     new Date(),
                });
                console.log(`[sync:listener]       ✅ auth_users created for subadmin: ${data.email}`);
              }
            } catch (authErr) {
              console.error(`[sync:listener]       ⚠️  auth_users creation failed for ${data.email}: ${authErr.message}`);
            }
          }

        } catch (err) {
          console.error(`[sync:listener]       ❌ ERROR (${changeType}) ${fsDoc.id}:`, err.message);
        }
      }

      console.log(`[sync:listener]    ✅ done\n`);
    },

    (err) => {
      console.error(`\n[sync:listener] ❌❌❌ LISTENER ERROR — ${fsName}`);
      console.error(`[sync:listener]    ${err.code}: ${err.message}\n`);
    }
  );

  unsubscribeFunctions.push({ name: fsName, unsubscribe });
}

// ─────────────────────────────────────────────────────────────────────────────
// ██████████████████████████████████████████████████████████████████████████
// DIRECTION 2:  MONGODB → FIREBASE
// ██████████████████████████████████████████████████████████████████████████
// ─────────────────────────────────────────────────────────────────────────────

/**
 * pushToFirebase(mongoCollectionName, data)
 *
 * Call this from any controller AFTER writing to MongoDB.
 * It will push the same data to Firestore so old mobile users see the change.
 *
 * Rules:
 *   - Strips MongoDB-only fields before sending
 *   - Tags the write with _syncSource so the listener ignores it (no loop)
 *   - Uses the matchKey to find the Firestore document ID
 *
 * Example usage in a controller:
 *   await Order.findOneAndUpdate({ id }, { $set: update });
 *   pushToFirebase('fashiontally_orders', { id, ...update }).catch(() => {});
 */
async function pushToFirebase(mongoCollectionName, data) {
  const config = COLLECTION_MAP[mongoCollectionName];
  if (!config) {
    // Collection not in our sync list — skip silently
    return;
  }

  try {
    // Strip fields that must never go to Firebase
    const cleanData = stripMongoOnlyFields(data);

    // Add our sync tag so the listener skips this write
    cleanData[SYNC_SOURCE_TAG] = SYNC_SOURCE_VAL;
    cleanData[SYNC_TIME_TAG]   = new Date().toISOString();

    // Find the Firestore document ID
    // For most collections it's the 'id' field
    // For fashiontally_users it's the firebaseUid
    let fsDocId = cleanData[config.matchKey];

    if (!fsDocId) {
      console.warn(`[sync→firebase] No matchKey (${config.matchKey}) in data for ${mongoCollectionName}`);
      return;
    }

    // For fashiontally_users the Firestore doc ID is the firebase UID, not email
    if (config.uidField && cleanData.uid && !cleanData.uid.includes('@')) {
      fsDocId = cleanData.uid;
    }

    await db.collection(config.fs).doc(String(fsDocId)).set(cleanData, { merge: true });
    console.log(`[sync→firebase] ✅ ${mongoCollectionName} pushed: ${fsDocId}`);

  } catch (err) {
    console.error(`[sync→firebase] ❌ ${mongoCollectionName}:`, err.message);
  }
}

/**
 * pushDeleteToFirebase(mongoCollectionName, matchValue)
 *
 * Call this from any controller AFTER deleting from MongoDB.
 * It deletes the same document from Firestore.
 *
 * Example usage in a controller:
 *   await Order.deleteOne({ id });
 *   pushDeleteToFirebase('fashiontally_orders', id).catch(() => {});
 */
async function pushDeleteToFirebase(mongoCollectionName, matchValue) {
  const config = COLLECTION_MAP[mongoCollectionName];
  if (!config) return;

  try {
    // For most collections, matchValue IS the Firestore doc ID
    await db.collection(config.fs).doc(String(matchValue)).delete();
    console.log(`[sync→firebase] 🗑️  ${mongoCollectionName} deleted: ${matchValue}`);
  } catch (err) {
    console.error(`[sync→firebase] ❌ delete ${mongoCollectionName}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH USERS — Firebase → MongoDB (Auth has no real-time listener API)
// ─────────────────────────────────────────────────────────────────────────────

async function fullSyncAuthUsers() {
  const mongoCol = mongoose.connection.collection('auth_users');
  let synced = 0, pageToken;
  console.log(`[sync]   📦 syncing auth_users...`);
  try {
    const bulkOps = [];
    do {
      const listResult = await auth.listUsers(1000, pageToken);

      for (const user of listResult.users) {
        const providers = (user.providerData || []).map(p => p.providerId);
        const isGoogle  = providers.includes('google.com');
        const createdAt = user.metadata?.creationTime
          ? new Date(user.metadata.creationTime)
          : new Date(0);

        const firebaseFields = {
          email:         (user.email || '').toLowerCase(),
          firebaseUid:   user.uid || '',
          provider:      isGoogle ? 'google' : 'email',
          googleUid:     isGoogle ? user.uid : null,
          passwordHash:  user.passwordHash || null,
          passwordSalt:  user.passwordSalt || null,
          displayName:   user.displayName || '',
          photoURL:      user.photoURL || '',
          emailVerified: user.emailVerified || false,
          disabled:      user.disabled || false,
          createdAt:     createdAt.toISOString(),
        };

        if (!firebaseFields.email) continue;

        // $set only — bcryptHash, resetToken, resetTokenExpiry are never touched
        bulkOps.push({
          updateOne: {
            filter: { email: firebaseFields.email },
            update: { $set: firebaseFields },
            upsert: true,
          },
        });
        synced++;
      }
      pageToken = listResult.pageToken;
    } while (pageToken);

    if (bulkOps.length > 0) {
      await mongoCol.bulkWrite(bulkOps, { ordered: false });
    }

    console.log(`[sync]   ✅ auth_users — ${synced} upserted`);
  } catch (err) {
    console.error('[sync]   ❌ auth_users:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH USERS — MongoDB → Firebase Auth
// Only updates existing Firebase users — never creates new ones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * pushAuthUpdateToFirebase(email, updates)
 *
 * Call this from controllers when user profile data changes
 * (e.g. displayName, photoURL, emailVerified, disabled).
 *
 * Only pushes if the user already exists in Firebase Auth.
 * Never creates new Firebase Auth users.
 * Never sends password hashes or MongoDB-only fields.
 *
 * Example:
 *   await pushAuthUpdateToFirebase(email, { displayName: 'New Name' });
 */
async function pushAuthUpdateToFirebase(email, updates) {
  try {
    // Look up the user's Firebase UID from MongoDB
    const mongoCol  = mongoose.connection.collection('auth_users');
    const authUser  = await mongoCol.findOne({ email: email.toLowerCase() });

    if (!authUser?.firebaseUid) {
      // User does not exist in Firebase — MongoDB-only user, skip
      console.log(`[sync→firebase] ⏭️  auth: ${email} not in Firebase, skipping`);
      return;
    }

    // Only send safe profile fields to Firebase
    const safeUpdates = {};
    if (updates.displayName  !== undefined) safeUpdates.displayName  = updates.displayName;
    if (updates.photoURL     !== undefined) safeUpdates.photoURL     = updates.photoURL;
    if (updates.emailVerified!== undefined) safeUpdates.emailVerified= updates.emailVerified;
    if (updates.disabled     !== undefined) safeUpdates.disabled     = updates.disabled;
    if (updates.phoneNumber  !== undefined) safeUpdates.phoneNumber  = updates.phoneNumber;

    if (Object.keys(safeUpdates).length === 0) return;

    await auth.updateUser(authUser.firebaseUid, safeUpdates);
    console.log(`[sync→firebase] ✅ auth updated in Firebase: ${email}`);

  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // User was in our DB but not in Firebase — that's fine, just skip
      console.log(`[sync→firebase] ⏭️  auth: ${email} not found in Firebase Auth, skipping`);
    } else {
      console.error(`[sync→firebase] ❌ auth update ${email}:`, err.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MEASUREMENTS — Firebase → MongoDB
// ─────────────────────────────────────────────────────────────────────────────

const SKIP_FIELDS = ['updatedAt', 'createdAt', 'userEmail', 'customMeasurements'];

async function upsertMeasurementDoc(mongoCol, clientEmail, userEmail, key, value, unit, updatedAt) {
  if (!value || !String(value).trim()) return;
  const iso       = updatedAt.toISOString();
  const timestamp = updatedAt.getTime();

  // Check if MongoDB already has a newer value for this measurement
  const existing = await mongoCol.findOne({ clientId: clientEmail, name: key });
  const existingUpdatedAt = toDate(existing?.updatedAt);
  if (existingUpdatedAt && existingUpdatedAt > updatedAt) {
    return; // MongoDB is newer — keep it
  }

  const id = existing?.id || makeMeasurementId(clientEmail, key, timestamp);
  await mongoCol.updateOne(
    { id },
    { $set: { id, userEmail, clientId: clientEmail, name: key,
              value: String(value).trim(), unit: unit || 'inches',
              createdAt: existing?.createdAt || iso, updatedAt: iso } },
    { upsert: true }
  );
}

async function fullSyncMeasurements() {
  const mongoCol = mongoose.connection.collection('fashiontally_measurements');
  let synced = 0;
  console.log(`[sync]   📦 syncing fashiontally_measurements (embedded only — fast path)...`);
  try {
    // We already have all client docs from the flat sync above.
    // Only process measurements EMBEDDED on the client doc (Path B).
    // Subcollection measurements (Path A) are handled by the real-time listener
    // when a client doc changes — no need to read 679 subcollections on startup.
    const clientsSnap = await withTimeout(
      db.collection('fashiontally_clients').get(),
      30000,
      'fullSyncMeasurements clients'
    );

    const bulkOps = [];

    for (const clientDoc of clientsSnap.docs) {
      const clientData  = clientDoc.data();
      const clientEmail = (clientData.email    || '').toLowerCase().trim();
      const userEmail   = (clientData.userEmail || clientData.tailorId || '').toLowerCase().trim();
      if (!clientEmail) continue;

      // Path B only: measurements embedded directly on the client doc
      // e.g. { measurements: { chest: "38", waist: "32" } }
      if (
        clientData.measurements &&
        typeof clientData.measurements === 'object' &&
        !Array.isArray(clientData.measurements)
      ) {
        const updatedAt  = toDate(clientData.updatedAt || clientData.lastUpdated) || new Date();
        const iso        = updatedAt.toISOString();
        const timestamp  = updatedAt.getTime();

        for (const [key, value] of Object.entries(clientData.measurements)) {
          if (!value || !String(value).trim()) continue;
          const id = makeMeasurementId(clientEmail, key, timestamp);
          bulkOps.push({
            updateOne: {
              filter: { clientId: clientEmail, name: key },
              update: {
                $setOnInsert: { id },
                $set: {
                  userEmail, clientId: clientEmail, name: key,
                  value: String(value).trim(), unit: 'inches',
                  updatedAt: iso,
                },
                $setOnInsert2: { createdAt: iso }, // handled below
              },
              upsert: true,
            },
          });
          synced++;
        }
      }
    }

    // bulkWrite doesn't support $setOnInsert + $set together cleanly for createdAt
    // so use a simpler approach: just $set everything (createdAt will be overwritten
    // but that's acceptable for the initial sync)
    const simpleBulkOps = [];
    for (const clientDoc of clientsSnap.docs) {
      const clientData  = clientDoc.data();
      const clientEmail = (clientData.email    || '').toLowerCase().trim();
      const userEmail   = (clientData.userEmail || clientData.tailorId || '').toLowerCase().trim();
      if (!clientEmail) continue;
      if (!clientData.measurements || typeof clientData.measurements !== 'object' || Array.isArray(clientData.measurements)) continue;

      const updatedAt = toDate(clientData.updatedAt || clientData.lastUpdated) || new Date();
      const iso       = updatedAt.toISOString();
      const timestamp = updatedAt.getTime();

      for (const [key, value] of Object.entries(clientData.measurements)) {
        if (!value || !String(value).trim()) continue;
        const id = makeMeasurementId(clientEmail, key, timestamp);
        simpleBulkOps.push({
          updateOne: {
            filter: { clientId: clientEmail, name: key },
            update: { $set: { id, userEmail, clientId: clientEmail, name: key, value: String(value).trim(), unit: 'inches', updatedAt: iso, createdAt: iso } },
            upsert: true,
          },
        });
      }
    }

    if (simpleBulkOps.length > 0) {
      await mongoCol.bulkWrite(simpleBulkOps, { ordered: false });
    }

    console.log(`[sync]   ✅ fashiontally_measurements — ${simpleBulkOps.length} embedded measurements upserted`);
    console.log(`[sync]   ℹ️  subcollection measurements will sync via real-time listener on client changes`);
  } catch (err) {
    console.error('[sync]   ❌ fashiontally_measurements:', err.message);
  }
}

function startMeasurementsListener() {
  const mongoCol = mongoose.connection.collection('fashiontally_measurements');

  console.log(`[sync:listener] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[sync:listener] 📡 ATTACHING listener for measurements/latest subcollections`);
  console.log(`[sync:listener] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  let isFirstSnapshot = true;

  const unsubscribe = db.collectionGroup('measurements').onSnapshot(
    async (snapshot) => {
      const changes = snapshot.docChanges();

      // Skip initial dump
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        console.log(`[sync:listener] ✅ Measurements listener READY (skipped ${changes.length} initial docs)\n`);
        return;
      }

      console.log(`\n[sync:listener] 🔔 FIREBASE CALLED BACK — measurements subcollection`);
      console.log(`[sync:listener]    changes: ${changes.length} | ${new Date().toISOString()}`);

      for (const change of snapshot.docChanges()) {
        const measureDoc = change.doc;
        const changeType = change.type;
        const rawData    = measureDoc.data();

        // Only care about 'latest' docs
        if (measureDoc.id !== 'latest') continue;

        console.log(`[sync:listener]    ── ${changeType.toUpperCase()} measurements/latest | clientDoc: ${measureDoc.ref.parent.parent?.id}`);

        if (changeType === 'removed') continue;

        // Loop detection
        if (isOurOwnWrite(rawData)) {
          console.log(`[sync:listener]       ⏭️  SKIPPING — our own write`);
          continue;
        }

        try {
          const clientDocRef = measureDoc.ref.parent.parent;
          if (!clientDocRef) continue;

          const clientDocId = clientDocRef.id;

          // Look up the client's email from MongoDB — avoids an extra Firestore read
          const clientsCol  = mongoose.connection.collection('fashiontally_clients');
          const clientInMongo = await clientsCol.findOne({ id: clientDocId });

          let clientEmail, userEmail;

          if (clientInMongo) {
            clientEmail = (clientInMongo.email    || '').toLowerCase().trim();
            userEmail   = (clientInMongo.userEmail || clientInMongo.tailorId || '').toLowerCase().trim();
          } else {
            // Fallback: try to decode the clientDocId as an email
            // Some Firebase clients use email as doc ID (URL-encoded)
            const decoded = decodeURIComponent(clientDocId).toLowerCase().trim();
            if (decoded.includes('@')) {
              clientEmail = decoded;
              userEmail   = '';
            } else {
              console.warn(`[sync:listener]       ⚠️  could not find client for docId: ${clientDocId}`);
              continue;
            }
          }

          if (!clientEmail) continue;

          console.log(`[sync:listener]       🔍 processing measurements for: ${clientEmail}`);

          const updatedAt = toDate(rawData.updatedAt) || new Date();
          let count = 0;

          for (const [key, value] of Object.entries(rawData)) {
            if (SKIP_FIELDS.includes(key) || key === SYNC_SOURCE_TAG || key === SYNC_TIME_TAG) continue;
            if (!value || !String(value).trim()) continue;
            await upsertMeasurementDoc(mongoCol, clientEmail, userEmail, key, value, 'inches', updatedAt);
            count++;
          }

          if (Array.isArray(rawData.customMeasurements)) {
            for (const m of rawData.customMeasurements) {
              if (!m.name || !m.value) continue;
              await upsertMeasurementDoc(mongoCol, clientEmail, userEmail, m.name, m.value, m.unit || 'inches', updatedAt);
              count++;
            }
          }

          console.log(`[sync:listener]       ✅ synced ${count} measurement(s) for ${clientEmail}`);

        } catch (err) {
          console.error(`[sync:listener]       ❌ ERROR on measurements:`, err.message);
        }
      }
    },
    (err) => {
      console.error(`\n[sync:listener] ❌❌❌ MEASUREMENTS LISTENER ERROR`);
      console.error(`[sync:listener]    code   : ${err.code}`);
      console.error(`[sync:listener]    message: ${err.message}`);
      if (err.message && err.message.includes('index')) {
        console.error(`[sync:listener]    ⚠️  Firestore requires an index for collectionGroup queries.`);
        console.error(`[sync:listener]    Go to Firebase Console → Firestore → Indexes → add:`);
        console.error(`[sync:listener]    Collection group: measurements | Field: __name__ | Ascending`);
      }
      console.error(`[sync:listener]    Measurements will NOT sync from Firebase until this is fixed.\n`);
    }
  );

  unsubscribeFunctions.push({ name: 'fashiontally_measurements', unsubscribe });
  console.log(`[sync:listener] ✅ Measurements listener ACTIVE\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH USERS — Hourly re-sync (Firebase Auth has no real-time listener)
// ─────────────────────────────────────────────────────────────────────────────
function startAuthUsersHourlySync() {
  const cron = require('node-cron');
  cron.schedule('0 * * * *', async () => {
    console.log('[sync] 🔄 Hourly auth_users re-sync...');
    await fullSyncAuthUsers();
  });
  console.log('[sync] 🕐 auth_users hourly re-sync scheduled');
}

// ─────────────────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────────────────────
function stopAllListeners() {
  console.log('\n[sync] 🛑 Closing all Firebase listeners...');
  for (const { name, unsubscribe } of unsubscribeFunctions) {
    try   { unsubscribe(); console.log(`[sync]   closed: ${name}`); }
    catch (err) { console.error(`[sync]   error closing ${name}:`, err.message); }
  }
}

process.on('SIGINT',  stopAllListeners);
process.on('SIGTERM', stopAllListeners);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT — called from server.js
// ─────────────────────────────────────────────────────────────────────────────
async function startSyncScheduler() {
  try {
    syncStats.setRunning(true);
    await runInitialFullSync();
    syncStats.setRunning(false);

    console.log('\n[sync] ╔══════════════════════════════════════════════════╗');
    console.log('[sync] ║       STARTING REAL-TIME FIREBASE LISTENERS       ║');
    console.log('[sync] ╚══════════════════════════════════════════════════╝');
    console.log(`[sync] Total collections to watch: ${FLAT_COLLECTIONS.length + 1} (+ measurements)\n`);

    for (const col of FLAT_COLLECTIONS) {
      startListenerForCollection(col);
    }
    startMeasurementsListener();
    startAuthUsersHourlySync();
    syncStats.setListenersActive(true);

    console.log('[sync] ╔══════════════════════════════════════════════════╗');
    console.log('[sync] ║           ALL LISTENERS ARE NOW ACTIVE           ║');
    console.log('[sync] ║                                                  ║');
    console.log('[sync] ║  Firebase → MongoDB : REAL-TIME                  ║');
    console.log('[sync] ║  MongoDB → Firebase : via middleware              ║');
    console.log('[sync] ║  Auth re-sync       : every hour                 ║');
    console.log('[sync] ╚══════════════════════════════════════════════════╝\n');

  } catch (err) {
    syncStats.setRunning(false);
    console.error('[sync] ❌ Failed to start sync:', err.message);
    console.error(err.stack);
  }
}

module.exports = {
  startSyncScheduler,
  runInitialFullSync,
  stopAllListeners,
  pushToFirebase,
  pushDeleteToFirebase,
  pushAuthUpdateToFirebase,
};
