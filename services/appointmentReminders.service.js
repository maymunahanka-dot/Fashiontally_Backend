/**
 * services/appointmentReminders.service.js
 *
 * Push about an hour before each upcoming appointment. Checks every 15 minutes;
 * each appointment is reminded once (see notificationOnce).
 *
 * Appointment times are stored two ways:
 *   web app    → date "2026-07-06" + time "10:30 AM" (Lagos time)
 *   mobile app → date as a full ISO timestamp, no time field
 */

const cron        = require('node-cron');
const User        = require('../models/User');
const Appointment = require('../models/Appointment');
const { sendNotification } = require('./notification.service');
const { sendOnce } = require('./notificationOnce');
const { extractDatePart } = require('./dailyNotifications.service');

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const WINDOW_START = 30 * MINUTE; // remind when the appointment is 30–75 minutes away
const WINDOW_END   = 75 * MINUTE;
const UPCOMING_STATUSES = ['Scheduled', 'scheduled', 'Confirmed', 'confirmed'];

/** "10:30 AM" / "2:05 pm" / "14:30" → { hours, minutes } */
const parseTime = (value) => {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
};

/** Start instant of an appointment, or null if it can't be worked out. */
const appointmentStart = (appt) => {
  const time = parseTime(appt.time);
  if (time) {
    const day = extractDatePart(appt.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const [y, mo, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1, d, time.hours, time.minutes) - LAGOS_OFFSET_MS);
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(appt.date || ''))) {
    const start = new Date(appt.date);
    return isNaN(start) ? null : start;
  }
  return null;
};

const formatTime = (date) =>
  new Date(date.getTime() + LAGOS_OFFSET_MS).toISOString().slice(11, 16).replace(/^(\d{2}):(\d{2})$/, (_, h, m) => {
    const hour = Number(h);
    return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
  });

const runAppointmentReminders = async (now = new Date()) => {
  const users = await User.find(
    { fcmTokens: { $elemMatch: { enabled: true } } },
    { _id: 1, email: 1 },
  ).lean();
  if (users.length === 0) return { sent: 0 };

  const byEmail = new Map(users.map((u) => [u.email, u]));
  const appts = await Appointment.find({
    userEmail: { $in: [...byEmail.keys()] },
    status:    { $in: UPCOMING_STATUSES },
  }).lean();

  let sent = 0;
  for (const appt of appts) {
    const start = appointmentStart(appt);
    if (!start) continue;
    const until = start - now;
    if (until <= WINDOW_START || until > WINDOW_END) continue;

    const user = byEmail.get(appt.userEmail);
    const minutes = Math.round(until / MINUTE / 5) * 5;
    const outcome = await sendOnce(
      { email: appt.userEmail, kind: 'push:appointment_soon', key: `${appt.id || appt._id}:${start.toISOString()}` },
      async () => {
        await sendNotification(
          String(user._id),
          '⏰ Appointment starting soon',
          `${appt.clientName ? `${appt.clientName}'s appointment` : 'An appointment'} starts at ${formatTime(start)} (in about ${minutes} minutes).`,
          { type: 'appointment_soon', appointmentId: appt.id || String(appt._id) },
        );
        return { success: true };
      },
    );
    if (outcome === 'sent') sent += 1;
  }

  if (sent) console.log(`[appointment-reminders] Sent ${sent} reminder(s)`);
  return { sent };
};

/**
 * Every 15 minutes. Off when NODE_ENV=development so a local backend pointed at the
 * live database doesn't push to customers; override with APPOINTMENT_REMINDERS_ENABLED=true|false.
 */
function startAppointmentReminderScheduler() {
  const flag = process.env.APPOINTMENT_REMINDERS_ENABLED;
  const enabled = flag ? flag === 'true' : process.env.NODE_ENV !== 'development';
  if (!enabled) {
    console.log('⏸️  Appointment reminder pushes disabled (NODE_ENV=development or APPOINTMENT_REMINDERS_ENABLED=false)');
    return;
  }
  cron.schedule('*/15 * * * *', () => {
    runAppointmentReminders().catch((err) => console.error('[appointment-reminders] Unhandled error:', err));
  });
  console.log('✅ Appointment reminder scheduler started (every 15 minutes)');
}

module.exports = { startAppointmentReminderScheduler, runAppointmentReminders, appointmentStart, parseTime };
