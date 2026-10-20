/**
 * middleware/firebaseSync.js
 *
 * Automatic MongoDB → Firebase sync middleware.
 *
 * HOW IT WORKS:
 *   1. Intercepts every outgoing API response
 *   2. If the request was a write (POST / PUT / PATCH / DELETE)
 *      AND the response was successful (2xx)
 *      AND the response contains data for a known collection
 *      → automatically pushes the change to Firebase
 *
 * This means NO controller needs to be touched.
 * Every write to MongoDB is automatically mirrored to Firebase.
 *
 * HOW IT FIGURES OUT WHICH COLLECTION:
 *   It maps the request URL prefix to a Firestore collection name.
 *   e.g. POST /api/order/create  → 'fashiontally_orders'
 *        DELETE /api/client/delete/123 → 'fashiontally_clients' (delete doc 123)
 *
 * LOOP PREVENTION:
 *   pushToFirebase() tags every Firestore write with _syncSource: 'mongodb'
 *   The Firebase→MongoDB listener checks this tag and skips it.
 *   So: MongoDB write → Firebase write → listener sees tag → skips → no loop.
 */

const { pushToFirebase, pushDeleteToFirebase, pushAuthUpdateToFirebase } =
  require('../services/syncScheduler.service');
const firebaseAdmin = require('../firebase/firebase-admin'); // the admin APP instance
const adminSdk      = require('firebase-admin');             // the SDK (for FieldValue)
const db            = firebaseAdmin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// MEASUREMENT SPECIAL HANDLER
// Measurements in Firestore live as a subcollection:
//   fashiontally_clients/{clientDocId}/measurements/latest
// So we can't use the flat pushToFirebase — we need to find the client doc
// by email and write to its subcollection.
// ─────────────────────────────────────────────────────────────────────────────
async function pushMeasurementToFirebase(measurementDoc) {
  try {
    const clientEmail = measurementDoc.clientId; // clientId = client email
    if (!clientEmail) return;

    // Find the Firestore client document by email field
    const clientSnap = await db.collection('fashiontally_clients')
      .where('email', '==', clientEmail)
      .limit(1)
      .get();

    if (clientSnap.empty) {
      console.log(`[sync→firebase] ⏭️  measurement: client not in Firebase (${clientEmail}) — skipping`);
      return;
    }

    const clientDocId = clientSnap.docs[0].id;

    // Read existing measurements/latest doc
    const latestRef  = db.collection('fashiontally_clients')
      .doc(clientDocId)
      .collection('measurements')
      .doc('latest');

    const latestSnap = await latestRef.get();
    const existing   = latestSnap.exists ? latestSnap.data() : {};

    // Merge this single measurement into the latest doc
    await latestRef.set(
      {
        ...existing,
        [measurementDoc.name]: measurementDoc.value,
        updatedAt: measurementDoc.updatedAt || new Date().toISOString(),
        _syncSource: 'mongodb',
        _syncedAt:   new Date().toISOString(),
      },
      { merge: true }
    );

    console.log(`[sync→firebase] ✅ measurement pushed to Firebase subcollection: ${clientEmail} / ${measurementDoc.name}`);
  } catch (err) {
    console.error(`[sync→firebase] ❌ measurement push failed:`, err.message);
  }
}

async function deleteMeasurementFromFirebase(measurementDoc) {
  try {
    const clientEmail = (measurementDoc.clientId || '').toLowerCase().trim();
    const measureName = measurementDoc.name;
    if (!clientEmail || !measureName) {
      console.warn(`[sync→firebase] ⚠️  measurement delete: missing clientId or name`);
      return;
    }

    console.log(`[sync→firebase] 🗑️  deleting measurement from Firebase: ${clientEmail} / ${measureName}`);

    const clientSnap = await db.collection('fashiontally_clients')
      .where('email', '==', clientEmail)
      .limit(1)
      .get();

    if (clientSnap.empty) {
      console.log(`[sync→firebase] ⏭️  measurement delete: client not in Firebase (${clientEmail})`);
      return;
    }

    const clientDocId = clientSnap.docs[0].id;
    const latestRef   = db.collection('fashiontally_clients')
      .doc(clientDocId)
      .collection('measurements')
      .doc('latest');

    const latestSnap = await latestRef.get();
    if (!latestSnap.exists) {
      console.log(`[sync→firebase] ⏭️  measurement delete: no measurements/latest doc for ${clientEmail}`);
      return;
    }

    // Use firebase-admin SDK FieldValue (not the app instance)
    await latestRef.update({
      [measureName]:  adminSdk.firestore.FieldValue.delete(),
      _syncSource:    'mongodb',
      _syncedAt:      new Date().toISOString(),
    });

    console.log(`[sync→firebase] ✅ measurement deleted from Firebase: ${clientEmail} / ${measureName}`);
  } catch (err) {
    console.error(`[sync→firebase] ❌ measurement delete failed:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// URL prefix → MongoDB collection name mapping
// Matches the route prefixes defined in server.js
// ─────────────────────────────────────────────────────────────────────────────
const ROUTE_TO_COLLECTION = {
  '/api/order':            'fashiontally_designs',   // orders live in fashiontally_designs (type='order')
  '/api/client':           'fashiontally_clients',
  '/api/appointment':      'fashiontally_appointments',
  '/api/invoice':          'fashiontally_invoices',
  '/api/inventory':        'fashiontally_inventory',
  '/api/design':           'fashiontally_designs',
  '/api/transaction':      'fashiontally_transactions',
  '/api/setting':          'fashiontally_settings',
  '/api/brand-setting':    'fashiontally_brand_settings',
  '/api/sms':              'fashiontally_sms',
  '/api/payment':          'payments',
  '/api/campaign':         'campaigns',
  '/api/loyalty-member':   'loyaltyMembers',
  '/api/reward':           'rewards',
  '/api/feedback':         'feedback',
  '/api/user':             'fashiontally_users',
  '/api/sub-admin':        'fashiontally_admins',
  // measurements are excluded here — handled separately below via pushMeasurementToFirebase
};

// Routes that touch auth — handled separately via pushAuthUpdateToFirebase
const AUTH_ROUTES = [
  '/api/auth',
  '/api/user',
];

// Methods that mutate data
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// ─────────────────────────────────────────────────────────────────────────────
// Find which collection this URL belongs to
// Returns null if not a synced route
// ─────────────────────────────────────────────────────────────────────────────
function getCollectionForUrl(url) {
  for (const [prefix, collection] of Object.entries(ROUTE_TO_COLLECTION)) {
    if (url.startsWith(prefix)) return collection;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract the document ID from a DELETE url
// e.g. /api/order/delete/order-123-abc → 'order-123-abc'
// ─────────────────────────────────────────────────────────────────────────────
function extractDeleteId(url) {
  // Pattern: /delete/:id  or  /remove/:id
  const match = url.match(/\/(?:delete|remove)\/([^/]+)/i);
  return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────
function firebaseSyncMiddleware(req, res, next) {
  // Only intercept write methods
  if (!WRITE_METHODS.includes(req.method)) return next();

  // ── MEASUREMENT routes — special handling ──────────────────────────────────
  if (req.path.startsWith('/api/measurement')) {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      originalJson(body);
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      if (!body?.success) return;

      setImmediate(async () => {
        try {
          if (req.method === 'DELETE') {
            // For delete we need the measurement doc — it's in body.data
            // (controller returns deleted doc)
            const doc = body?.data;
            if (doc) {
              let plain = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: false }) : doc;
              await deleteMeasurementFromFirebase(plain).catch(() => {});
            }
            return;
          }

          // CREATE or UPDATE — body.data can be array (create) or single (edit)
          let docData = body?.data;
          if (!docData) return;

          if (Array.isArray(docData)) {
            for (let item of docData) {
              if (typeof item.toObject === 'function') item = item.toObject({ virtuals: false });
              await pushMeasurementToFirebase(item).catch(() => {});
            }
          } else {
            if (typeof docData.toObject === 'function') docData = docData.toObject({ virtuals: false });
            await pushMeasurementToFirebase(docData).catch(() => {});
          }
        } catch (err) {
          console.error('[firebaseSync middleware] measurement error:', err.message);
        }
      });
    };
    return next();
  }

  const collection = getCollectionForUrl(req.path);
  if (!collection) return next(); // not a synced route

  // Intercept res.json so we can read the response body after the controller runs
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // Call the original so the response is sent to the client
    originalJson(body);

    // Only sync if response was successful
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    if (!body?.success) return;

    // Fire-and-forget — never block the response
    setImmediate(() => {
      try {
        // ── DELETE ──────────────────────────────────────────────────────────
        if (req.method === 'DELETE') {
          // Try to get the ID from the URL first, fallback to response data
          const urlId    = extractDeleteId(req.path);
          const dataId   = body?.data?.id || body?.data?._id;
          const deleteId = urlId || dataId || req.params?.id;

          if (deleteId) {
            pushDeleteToFirebase(collection, deleteId).catch(() => {});
          }
          return;
        }

        // ── CREATE / UPDATE ──────────────────────────────────────────────────
        // Response body should have { success: true, data: { ...document } }
        let docData = body?.data || body?.user;
        if (!docData) return;

        // Convert Mongoose document to plain object so virtual 'id' doesn't
        // shadow the custom 'id' field stored in the document
        if (typeof docData.toObject === 'function') {
          docData = docData.toObject({ virtuals: false });
        } else if (typeof docData.toJSON === 'function') {
          docData = docData.toJSON({ virtuals: false });
        }

        // Handle arrays (e.g. bulk operations) — sync each item
        if (Array.isArray(docData)) {
          for (let item of docData) {
            if (typeof item.toObject === 'function') item = item.toObject({ virtuals: false });
            pushToFirebase(collection, item).catch(() => {});
          }
          return;
        }

        // Single document
        pushToFirebase(collection, docData).catch(() => {});

        // Also push auth update if this is a user/auth route
        const isAuthRoute = AUTH_ROUTES.some(r => req.path.startsWith(r));
        if (isAuthRoute && docData.email) {
          const authFields = {};
          if (docData.displayName !== undefined) authFields.displayName  = docData.displayName;
          if (docData.photoURL    !== undefined) authFields.photoURL     = docData.photoURL;
          if (docData.disabled    !== undefined) authFields.disabled     = docData.disabled;
          if (docData.name        !== undefined) authFields.displayName  = docData.name;
          if (Object.keys(authFields).length > 0) {
            pushAuthUpdateToFirebase(docData.email, authFields).catch(() => {});
          }
        }

      } catch (err) {
        // Never crash the server because of a sync failure
        console.error('[firebaseSync middleware] error:', err.message);
      }
    });
  };

  next();
}

module.exports = { firebaseSyncMiddleware };
