const mongoose = require('mongoose');

/**
 * Automated emails (welcome sequence, free-to-paid, renewal...). See services/emailAutomation.
 *
 * EmailAutomationSetting: one row ('main') with the switches set from the admin panel.
 *   Everything starts OFF.
 * EmailAutomationTemplate: text an admin changed for one email in one language
 *   (anything not here uses the defaults in services/emailAutomation/templates.js).
 * EmailAutomationLog: one row per user per email: sent, skipped (with the reason) or failed.
 *   The unique (email, key) index makes each email go to a user at most once.
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
  // Optional offer used by C5 / E5 / G3 while it hasn't ended
  offer: {
    textEn:  { type: String, default: '' },
    textFr:  { type: String, default: '' },
    endDate: { type: Date, default: null },
  },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: '' },
});

const templateSchema = new mongoose.Schema({
  key:       { type: String, required: true },   // e.g. 'A2'
  lang:      { type: String, enum: ['en', 'fr'], required: true },
  subject:   { type: String, default: '' },
  preview:   { type: String, default: '' },
  body:      { type: String, default: '' },
  button:    { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: '' },
});
templateSchema.index({ key: 1, lang: 1 }, { unique: true });

const logSchema = new mongoose.Schema({
  email:     { type: String, required: true },
  key:       { type: String, required: true },   // unique per user, e.g. 'A2', 'C7:clients', 'E1:2026-12-01'
  template:  { type: String, required: true },   // e.g. 'C7'
  seq:       { type: String, required: true },
  status:    { type: String, enum: ['sending', 'sent', 'skipped', 'failed'], required: true },
  reason:    { type: String, default: '' },
  lang:      { type: String, default: 'en' },
  day:       { type: String, default: '' },      // Lagos day it was sent (for the daily limits)
  messageId: { type: String, default: '' },
  at:        { type: Date, default: Date.now },
});
logSchema.index({ email: 1, key: 1 }, { unique: true });
logSchema.index({ email: 1, status: 1, at: -1 });
logSchema.index({ at: -1 });
logSchema.index({ template: 1, status: 1 });

module.exports = {
  EmailAutomationSetting:  mongoose.model('EmailAutomationSetting', settingSchema, 'email_automation_settings'),
  EmailAutomationTemplate: mongoose.model('EmailAutomationTemplate', templateSchema, 'email_automation_templates'),
  EmailAutomationLog:      mongoose.model('EmailAutomationLog', logSchema, 'email_automation_log'),
};
