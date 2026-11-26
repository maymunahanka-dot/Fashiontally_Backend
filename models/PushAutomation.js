const mongoose = require('mongoose');

/**
 * Automated push notifications: the short form of the automated emails, with their own
 * switches, texts and log. See services/pushAutomation.
 *
 * PushAutomationSetting: one row ('main') with the switches from the admin panel. Everything starts OFF.
 * PushAutomationTemplate: title/text an admin changed for one notification in one language
 *   (anything not here uses services/pushAutomation/templates.js).
 * PushAutomationLog: one row per user per notification: sent, skipped (with the reason) or failed.
 *   The unique (email, key) index makes each notification go to a user at most once.
 */

const settingSchema = new mongoose.Schema({
  id:        { type: String, default: 'main', unique: true },
  enabled:   { type: Boolean, default: false },              // main switch
  sequences: {
    A: { type: Boolean, default: false },
    C: { type: Boolean, default: false },
    D: { type: Boolean, default: false },
    E: { type: Boolean, default: false },
    F: { type: Boolean, default: false },
    G: { type: Boolean, default: false },
  },
  // Set the first time sequence G is switched on: it targets users who signed up before this
  gStartedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: '' },
});

const templateSchema = new mongoose.Schema({
  key:       { type: String, required: true },   // e.g. 'A2'
  lang:      { type: String, enum: ['en', 'fr'], required: true },
  title:     { type: String, default: '' },
  body:      { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: '' },
});
templateSchema.index({ key: 1, lang: 1 }, { unique: true });

const logSchema = new mongoose.Schema({
  email:     { type: String, required: true },
  key:       { type: String, required: true },   // unique per user, e.g. 'A2', 'C7:clients', 'E1:2026-12-01'
  template:  { type: String, required: true },
  seq:       { type: String, required: true },
  status:    { type: String, enum: ['sending', 'sent', 'skipped', 'failed'], required: true },
  reason:    { type: String, default: '' },
  lang:      { type: String, default: 'en' },
  day:       { type: String, default: '' },      // Lagos day it was sent (for the per-user limits)
  devices:   { type: Number, default: 0 },       // phones it reached (0 = notification page only)
  at:        { type: Date, default: Date.now },
});
logSchema.index({ email: 1, key: 1 }, { unique: true });
logSchema.index({ at: -1 });
logSchema.index({ template: 1, status: 1 });
logSchema.index({ seq: 1, day: 1, status: 1 });

module.exports = {
  PushAutomationSetting:  mongoose.model('PushAutomationSetting', settingSchema, 'push_automation_settings'),
  PushAutomationTemplate: mongoose.model('PushAutomationTemplate', templateSchema, 'push_automation_templates'),
  PushAutomationLog:      mongoose.model('PushAutomationLog', logSchema, 'push_automation_log'),
};
