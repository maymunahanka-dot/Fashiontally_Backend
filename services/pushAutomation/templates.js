/**
 * Default text of the automated push notifications: a short form of each automated email
 * (same keys, same timing, see services/emailAutomation/templates.js), in English and French.
 * Admins can override any of it from the admin panel (stored in PushAutomationTemplate).
 *
 * title: up to ~50 characters, body: up to ~150 characters (phones cut longer text).
 * Placeholders are the same as the emails: first_name, business_name, plan_name, renewal_date,
 * trial_end_date, clients_count, invoices_count, orders_count, limit_type, limit_used,
 * offer_text, offer_end_date, and offer_short (the offer and its end date while one is running,
 * otherwise the starting price).
 *
 * `open`: what tapping it opens.
 *   web:  path on the website (used by the web notification page's "Open" link)
 *   push: the notification `type` the mobile app already knows how to open
 *         (see ft-app/src/lib/notificationRoutes.ts); '' just opens the app.
 */

const OPEN = {
  app:      { web: '/dashboard', push: '' },
  clients:  { web: '/dashboard/clients', push: '' },
  invoices: { web: '/dashboard/invoice', push: 'invoice_overdue' },   // → Invoices tab
  orders:   { web: '/dashboard/orders', push: 'pending_orders' },     // → Orders tab
  team:     { web: '/dashboard/settings', push: 'team_member_added' }, // → More tab
  pay:      { web: '/subscription', push: 'plan_ending' },           // → Subscription screen
};

const T = {};

// ─────────────────────────── A · Activation ───────────────────────────
T.A2 = {
  open: 'clients',
  en: { title: 'Your first client takes 1 minute', body: 'Just a name and phone number. Add one client now and keep everything in one place.' },
  fr: { title: 'Votre premier client en 1 minute', body: "Un nom et un numéro suffisent. Ajoutez un client maintenant et gardez tout au même endroit." },
};
T.A3 = {
  open: 'clients',
  en: { title: 'Need help getting started?', body: "Start with one client you're sewing for today. Stuck? Reply to our email and we'll help." },
  fr: { title: "Besoin d'aide pour démarrer ?", body: "Commencez par un client pour qui vous cousez aujourd'hui. Bloqué(e) ? Répondez à notre e-mail." },
};
T.A4 = {
  open: 'clients',
  en: { title: 'Save your measurements', body: "Never lose a client's measurements again. Save them once, find them in seconds." },
  fr: { title: 'Enregistrez vos mesures', body: "Ne perdez plus jamais les mesures d'un client. Enregistrez-les une fois, retrouvez-les en secondes." },
};
T.A5 = {
  open: 'invoices',
  en: { title: 'Send your first invoice', body: 'Get paid faster with a clean, professional invoice. It takes less than a minute.' },
  fr: { title: 'Envoyez votre première facture', body: 'Soyez payé(e) plus vite avec une facture professionnelle. Moins d\'une minute.' },
};
T.A6 = {
  open: 'orders',
  en: { title: 'Track your orders', body: "Add this week's orders and see everything that's due at a glance." },
  fr: { title: 'Suivez vos commandes', body: 'Ajoutez les commandes de la semaine et voyez tout ce qui est à livrer en un coup d\'œil.' },
};
T.A7 = {
  open: 'app',
  en: { title: "You're all set, {{first_name}} 🎉", body: 'Clients, measurements and invoices are ready. Your business is now in FashionTally.' },
  fr: { title: 'Tout est prêt, {{first_name}} 🎉', body: 'Clients, mesures et factures sont prêts. Votre activité est maintenant dans FashionTally.' },
};

// ─────────────────────────── C · Free plan to paid ───────────────────────────
T.C1 = {
  open: 'pay',
  en: { title: 'No more forgotten fittings', body: 'Appointments with reminders keep every fitting on time. Choose a plan to switch them on.' },
  fr: { title: 'Fini les essayages oubliés', body: 'Les rendez-vous avec rappels gardent chaque essayage à l\'heure. Choisissez un forfait.' },
};
T.C2 = {
  open: 'pay',
  en: { title: 'How much did you make this month?', body: 'See your income and expenses in one place. Choose a plan to unlock Finance.' },
  fr: { title: 'Combien avez-vous gagné ce mois-ci ?', body: 'Voyez vos revenus et dépenses au même endroit. Choisissez un forfait pour Finances.' },
};
T.C3 = {
  open: 'pay',
  en: { title: 'One lost order costs more', body: 'A single lost order costs more than FashionTally. Keep every order safe from ₦5,000 a month.' },
  fr: { title: 'Une commande perdue coûte plus cher', body: 'Une seule commande perdue coûte plus que FashionTally. Tout en sécurité dès ₦5 000 par mois.' },
};
T.C4 = {
  open: 'pay',
  en: { title: 'Show your styles. Know your fabric.', body: 'Designs and Inventory help you sell more and never run out. Choose a plan to unlock them.' },
  fr: { title: 'Montrez vos modèles. Connaissez vos tissus.', body: 'Modèles et Inventaire vous aident à vendre plus. Choisissez un forfait pour les débloquer.' },
};
T.C5 = {
  open: 'pay',
  en: { title: 'Every feature from ₦5,000 a month', body: 'Clients, orders, invoices, appointments and more. Pick the plan that fits your business.' },
  fr: { title: 'Tout FashionTally dès ₦5 000 par mois', body: 'Clients, commandes, factures, rendez-vous et plus. Choisissez le forfait qui vous convient.' },
};
T.C5_offer = {
  open: 'pay',
  en: { title: 'A special offer for {{business_name}}', body: '{{offer_text}}. Ends {{offer_end_date}}.' },
  fr: { title: 'Une offre spéciale pour {{business_name}}', body: "{{offer_text}}. Jusqu'au {{offer_end_date}}." },
};
T.C6 = {
  open: 'app',
  en: { title: 'Can we ask you one question?', body: "What's stopping you from choosing a plan? Reply to our email, we read every answer." },
  fr: { title: 'Une petite question ?', body: "Qu'est-ce qui vous empêche de choisir un forfait ? Répondez à notre e-mail, nous lisons tout." },
};
T.C7 = {
  open: 'pay',
  en: { title: '{{limit_used}} of 10 free {{limit_type}} used', body: "You're almost at your free limit. Choose a plan to keep adding without limits." },
  fr: { title: '{{limit_used}} {{limit_type}} sur 10 utilisés', body: 'Vous approchez de votre limite gratuite. Choisissez un forfait pour continuer sans limite.' },
};
T.C8 = {
  open: 'pay',
  en: { title: "You've reached your free limit", body: 'You have used all 10 free {{limit_type}}. Choose a plan to keep going.' },
  fr: { title: 'Limite gratuite atteinte', body: 'Vous avez utilisé vos 10 {{limit_type}} gratuits. Choisissez un forfait pour continuer.' },
};

// ─────────────────────────── D · New paying subscriber ───────────────────────────
T.D2 = {
  open: 'app',
  en: { title: '5 things you can do now', body: 'Your {{plan_name}} plan unlocked appointments, finance, designs and more. Take a look.' },
  fr: { title: '5 choses que vous pouvez faire', body: 'Votre forfait {{plan_name}} débloque rendez-vous, finances, modèles et plus. Découvrez-les.' },
};
T.D3 = {
  open: 'orders',
  en: { title: "Add this week's orders", body: 'Put your orders in FashionTally and see what is due each day.' },
  fr: { title: 'Ajoutez les commandes de la semaine', body: 'Mettez vos commandes dans FashionTally et voyez ce qui est à livrer chaque jour.' },
};
T.D4 = {
  open: 'team',
  en: { title: 'Let your staff help', body: 'Add team members and choose what they can see. Your finances stay private.' },
  fr: { title: 'Laissez votre équipe aider', body: 'Ajoutez des membres et choisissez ce qu\'ils voient. Vos finances restent privées.' },
};

// ─────────────────────────── E · Renewal ───────────────────────────
T.E1 = {
  open: 'pay',
  en: { title: 'Your plan ends on {{renewal_date}}', body: 'Renew your {{plan_name}} plan to keep your orders, invoices and reminders running.' },
  fr: { title: 'Votre forfait se termine le {{renewal_date}}', body: 'Renouvelez votre forfait {{plan_name}} pour garder commandes, factures et rappels actifs.' },
};
T.E5 = {
  open: 'pay',
  en: { title: 'Your orders are waiting, {{first_name}}', body: 'Everything is still saved. Renew your plan to pick up where you left off.' },
  fr: { title: 'Vos commandes vous attendent', body: 'Tout est encore enregistré. Renouvelez votre forfait pour reprendre où vous en étiez.' },
};

// ─────────────────────────── F · Inactive ───────────────────────────
T.F1 = {
  open: 'app',
  en: { title: "How's business this week?", body: 'Take a minute to update your orders and payments so nothing slips.' },
  fr: { title: 'Comment vont les affaires ?', body: 'Prenez une minute pour mettre à jour vos commandes et paiements.' },
};
T.F2 = {
  open: 'app',
  en: { title: 'Your records are waiting', body: 'Your clients, measurements and orders are safe. Open FashionTally to pick up where you left off.' },
  fr: { title: 'Vos données vous attendent', body: 'Vos clients, mesures et commandes sont en sécurité. Ouvrez FashionTally pour reprendre.' },
};

// ─────────────────────────── G · Existing sign-ups ───────────────────────────
T.G1 = {
  open: 'app',
  en: { title: 'FashionTally has changed a lot', body: 'New features since you signed up: orders, appointments, finance and more. Take a look.' },
  fr: { title: 'FashionTally a beaucoup changé', body: 'Nouveautés depuis votre inscription : commandes, rendez-vous, finances et plus.' },
};
T.G2 = {
  open: 'app',
  en: { title: 'Want us to set it up with you?', body: 'Free 10-minute call to set up your first clients. Reply to our email with a good time.' },
  fr: { title: 'On le configure ensemble ?', body: 'Appel gratuit de 10 minutes pour configurer vos premiers clients. Répondez à notre e-mail.' },
};
T.G3 = {
  open: 'pay',
  en: { title: 'A thank-you for our early users', body: 'Every feature is ready for you. {{offer_short}}' },
  fr: { title: 'Un merci à nos premiers utilisateurs', body: 'Toutes les fonctionnalités vous attendent. {{offer_short}}' },
};

module.exports = { TEMPLATES: T, OPEN };
