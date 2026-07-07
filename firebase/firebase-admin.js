/**
 * firebase/firebase-admin.js
 *
 * Initializes the Firebase Admin SDK once and exports the admin instance.
 * The serviceAccountKey.json lives at the project root (same level as server.js).
 *
 * Firebase Console → Project Settings → Service Accounts → Generate new private key
 */

const admin = require('firebase-admin');
const path  = require('path');

// Guard against hot-reload double-init
if (!admin.apps.length) {
  const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('✅ Firebase Admin SDK initialized (FCM ready)');
}

module.exports = admin;
