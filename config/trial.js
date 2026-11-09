/**
 * Free trial given to every new account (email and Google sign-up).
 * Change it here only. The mobile app's sign-up grace period
 * (ft-app/src/hooks/useSubscriptionGuard.ts) should match.
 */
const TRIAL_DAYS = 3;

/** ISO end date for a trial starting now. */
const trialEndDate = () => new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

module.exports = { TRIAL_DAYS, trialEndDate };
