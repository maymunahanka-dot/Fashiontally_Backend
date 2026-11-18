/**
 * Account times kept by Firebase Auth (email → { created, signIn, refresh }), for the admin panel.
 *
 * - `created`: when the account was made. Some older Mongo users have no createdAt; this fills it.
 * - `signIn`: last sign-in. `lastLoginAt` in Mongo only exists for logins since it was added.
 * - `refresh`: last token refresh, i.e. the last time the app was in use.
 *
 * Accounts created after sign-up moved off Firebase are not listed here.
 * Cached for 10 minutes; on a Firebase error the last good copy (or an empty map) is returned.
 */
const TTL = 10 * 60 * 1000;
let cache = { at: 0, map: new Map() };
let pending = null;

const iso = (v) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : null);

const load = async () => {
  const admin = require('../firebase/firebase-admin');
  const map = new Map();
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      if (!u.email) continue;
      map.set(u.email.toLowerCase(), {
        created: iso(u.metadata?.creationTime),
        signIn: iso(u.metadata?.lastSignInTime),
        refresh: iso(u.metadata?.lastRefreshTime),
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return map;
};

const firebaseAccountTimes = async () => {
  if (Date.now() - cache.at < TTL) return cache.map;
  // Two admin pages loading at once share one Firebase listing
  if (!pending) {
    pending = load()
      .then((map) => {
        cache = { at: Date.now(), map };
        return map;
      })
      .catch((error) => {
        console.warn('[admin] firebase account times:', error.message);
        return cache.map;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
};

/** Sign-up date: Mongo's createdAt when valid, else Firebase's creation time, else null */
const joinedDate = (createdAt, fb) => {
  const t = createdAt ? new Date(createdAt) : null;
  if (t && !Number.isNaN(t.getTime())) return createdAt;
  return fb?.created || null;
};

module.exports = { firebaseAccountTimes, joinedDate };
