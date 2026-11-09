/**
 * Free plan: what an account can still do once its trial or paid plan has ended.
 *
 *   • Only the Dashboard, Clients and Invoices stay open (the apps lock the rest).
 *   • At most FREE_PLAN_LIMIT clients and FREE_PLAN_LIMIT invoices. Accounts that
 *     already have more keep them all, they just can't add new ones.
 *
 * Enforced here on the server so older app versions can't get around it.
 * Team members use the owner's plan (req.effectiveEmail is the owner).
 */
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');
const { subscriptionSummary } = require('./subscriptionSummary');

const FREE_PLAN_LIMIT = 10;

/** Admins can switch subscriptions off for everyone; then nothing is limited. */
const subscriptionsEnabled = async () => {
  const setting = await SystemSetting.findOne({ id: 'subscription' }).lean();
  return setting ? setting.subscriptionsEnabled !== false : true;
};

const hasActivePlan = async (ownerEmail) => {
  if (!(await subscriptionsEnabled())) return true;
  const user = await User.findOne({ email: ownerEmail }).lean();
  return user ? subscriptionSummary(user).isActive : false;
};

/**
 * Express middleware factory: blocks creating a new record past the free limit.
 * @param Model  mongoose model whose records belong to an owner via `userEmail`
 * @param label  plural name used in the message, e.g. "clients"
 */
const enforceFreePlanLimit = (Model, label) => async (req, res, next) => {
  try {
    const ownerEmail = req.effectiveEmail;
    if (!ownerEmail || (await hasActivePlan(ownerEmail))) return next();

    const count = await Model.countDocuments({ userEmail: ownerEmail });
    if (count < FREE_PLAN_LIMIT) return next();

    return res.status(403).json({
      success: false,
      code: 'FREE_PLAN_LIMIT',
      limit: FREE_PLAN_LIMIT,
      error: `Your plan has ended. Free accounts can have up to ${FREE_PLAN_LIMIT} ${label}. Subscribe to add more.`,
    });
  } catch (error) {
    // Never block someone because of a failed check
    console.error('[freePlan] limit check failed:', error.message);
    return next();
  }
};

module.exports = { FREE_PLAN_LIMIT, hasActivePlan, enforceFreePlanLimit };
