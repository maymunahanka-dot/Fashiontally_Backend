/**
 * One place that decides what a user's subscription looks like right now.
 *
 * The web and mobile subscription screens both display this summary as-is,
 * so they always show the same plan, status and day counts. It never trusts
 * the stored `isSubscribed` flag on its own: that flag is not switched off
 * when a plan simply runs out, so the end date decides.
 */
const { TRIAL_DAYS } = require('../config/trial');
const { PLAN_PRICES, YEARLY_PLAN_PRICES } = require('./flutterwavePayment.service');

const DAY_MS = 24 * 60 * 60 * 1000;
const CYCLE_DAYS = { monthly: 30, yearly: 365 };

const toMs = (value) => {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
};

/** "GROWTH" / "growth" → "Growth" */
const planName = (plan) => {
  if (!plan) return null;
  const s = String(plan).trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

/** Best plan an amount covers, for old payments saved without a plan name. */
const planFromAmount = (amount) => {
  const paid = Number(amount) || 0;
  const match = Object.entries(PLAN_PRICES)
    .sort((a, b) => b[1] - a[1])
    .find(([, price]) => paid >= price);
  return match ? planName(match[0]) : null;
};

/** Paid period length: stored on new payments, worked out from the amount for older ones. */
const cycleFor = (user) => {
  if (user.billingCycle === 'monthly' || user.billingCycle === 'yearly') return user.billingCycle;
  const yearlyPrice = YEARLY_PLAN_PRICES[String(user.planType || '').toUpperCase()];
  return yearlyPrice && Number(user.payment_amount) >= yearlyPrice ? 'yearly' : 'monthly';
};

/**
 * @returns {{
 *   status: 'trial'|'active'|'trial_ended'|'expired'|'cancelled',
 *   isActive: boolean,
 *   plan: string,
 *   billingCycle: 'monthly'|'yearly'|null,
 *   startDate: string|null,
 *   endDate: string|null,
 *   totalDays: number,
 *   daysLeft: number,
 *   daysUsed: number,
 *   autoRenews: boolean,
 * }}
 */
const subscriptionSummary = (user, now = Date.now()) => {
  const u = typeof user?.toObject === 'function' ? user.toObject() : user || {};
  const isTrial = u.subscriptionType === 'trial';
  // Very old accounts have a payment but no subscriptionType.
  const isPaid = u.subscriptionType === 'paid' || (!u.subscriptionType && Number(u.payment_amount) > 0);

  let endMs = toMs(u.subscriptionEndDate);
  // Very old payments only stored a payment date: they covered 30 days.
  if (!Number.isFinite(endMs) && Number(u.payment_amount) > 0 && Number.isFinite(toMs(u.payment_date))) {
    endMs = toMs(u.payment_date) + 30 * DAY_MS;
  }

  const billingCycle = isPaid ? cycleFor(u) : null;
  const periodDays = isTrial ? TRIAL_DAYS : CYCLE_DAYS[billingCycle || 'monthly'];

  // subscriptionStartDate is only trusted when the payment code wrote it (it saves
  // billingCycle at the same time); older accounts can carry a stale value.
  let startMs = isTrial
    ? toMs(u.trialStartDate)
    : (u.billingCycle && toMs(u.subscriptionStartDate)) || toMs(u.payment_date);
  if (Number.isFinite(endMs) && (!Number.isFinite(startMs) || startMs >= endMs)) {
    startMs = endMs - periodDays * DAY_MS;
  }

  const hasPeriod = Number.isFinite(endMs);
  const totalDays = hasPeriod ? Math.max(1, Math.round((endMs - startMs) / DAY_MS)) : 0;

  // Cancelled (or switched off by an admin) ends access straight away.
  const switchedOff = u.subscriptionType === 'free' || u.isSubscribed === false;
  const isActive = hasPeriod && !switchedOff && endMs > now;
  const daysLeft = isActive ? Math.min(totalDays, Math.ceil((endMs - now) / DAY_MS)) : 0;

  let status;
  if (isActive) status = isTrial ? 'trial' : 'active';
  else if (u.subscriptionType === 'free') status = 'cancelled';
  else status = isTrial ? 'trial_ended' : 'expired';

  return {
    status,
    isActive,
    plan: status === 'cancelled' ? 'Free' : planName(u.planType) || planFromAmount(u.payment_amount) || 'Free',
    billingCycle,
    startDate: hasPeriod ? new Date(startMs).toISOString() : null,
    endDate: hasPeriod ? new Date(endMs).toISOString() : null,
    totalDays,
    daysLeft,
    daysUsed: totalDays - daysLeft,
    // Flutterwave payments are one-off: nothing renews by itself.
    autoRenews: false,
  };
};

module.exports = { subscriptionSummary };
