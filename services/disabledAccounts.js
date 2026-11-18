/**
 * Which accounts an admin has deactivated (auth_users.disabled).
 *
 * The auth middleware checks this on every request, so a deactivated owner (and
 * their team) is locked out straight away, not only at their next login. The list
 * is small and kept in memory; it is reloaded every minute and updated at once
 * when an admin changes an account on this server.
 */
const AuthUser = require('../models/AuthUser');

const REFRESH_MS = 60 * 1000;
let disabled = new Set();
let loadedAt = 0;
let loading = null;

const refresh = async () => {
  if (loading) return loading;
  loading = AuthUser.find({ disabled: true }, { email: 1 })
    .lean()
    .then((rows) => {
      disabled = new Set(rows.map((r) => String(r.email || '').toLowerCase()));
      loadedAt = Date.now();
    })
    .catch((error) => console.error('[disabled-accounts] refresh failed:', error.message))
    .finally(() => {
      loading = null;
    });
  return loading;
};

/** True when any of the given emails is deactivated. */
const isDisabled = async (...emails) => {
  if (Date.now() - loadedAt > REFRESH_MS) await refresh();
  return emails.some((e) => e && disabled.has(String(e).toLowerCase()));
};

/** Update the in-memory list right after an admin (de)activates an account. */
const markDisabled = (email, value) => {
  const key = String(email || '').toLowerCase();
  if (!key) return;
  if (value) disabled.add(key);
  else disabled.delete(key);
};

module.exports = { isDisabled, markDisabled, refreshDisabled: refresh };
