/**
 * Default text of the automated emails, in English and French.
 * Admins can override any of it from the admin panel (stored in EmailAutomationTemplate);
 * these defaults are used for anything not overridden.
 *
 * Body format (plain text, the layout adds the styling):
 *   - a blank line starts a new paragraph
 *   - lines starting with "- " become a checklist
 *   - {{placeholders}} are filled in per user; a paragraph that ends up empty is left out
 *
 * Placeholders: first_name, business_name, trial_end_date, plan_name, plan_price, renewal_date,
 * clients_count, invoices_count, orders_count, limit_type, limit_used, offer_text, offer_end_date,
 * progress_line (empty when the user has nothing yet), offer_line (empty when no offer is active).
 *
 * `button.link`: 'app' (open FashionTally) or 'pay' (the pay page, already signed in as the user).
 */

const SEQUENCES = {
  A: { name: 'Welcome and activation', marketing: true },
  C: { name: 'Free plan to paid', marketing: true },
  D: { name: 'New paying subscriber', marketing: false },
  E: { name: 'Renewal', marketing: false },
  F: { name: 'Inactive users', marketing: true },
  G: { name: 'Existing sign-ups (one time)', marketing: true },
};

const T = {};

// ─────────────────────────── A · Activation ───────────────────────────
T.A2 = {
  seq: 'A', name: 'Add your first client', when: 'Day 1 after sign-up, if they have no client yet', link: 'app',
  en: {
    subject: 'Your first client takes 1 minute',
    preview: 'A name and phone number is all you need to start.',
    body: `Hi {{first_name}},

Notebooks get lost. WhatsApp chats get buried. Measurements go missing. FashionTally keeps all of it safe, and it starts with one client.

Add a client now. All you need is a name and phone number; you can add measurements and orders later.

Tip: start with a client you're sewing for this week.`,
    button: 'Add my first client',
  },
  fr: {
    subject: 'Votre premier client en 1 minute',
    preview: 'Un nom et un numéro de téléphone suffisent pour commencer.',
    body: `Bonjour {{first_name}},

Les carnets se perdent. Les discussions WhatsApp s'accumulent. Les mesures disparaissent. FashionTally garde tout en sécurité, et tout commence par un client.

Ajoutez un client maintenant. Il vous suffit d'un nom et d'un numéro de téléphone ; vous pourrez ajouter les mesures et les commandes plus tard.

Astuce : commencez par un client pour qui vous cousez cette semaine.`,
    button: 'Ajouter mon premier client',
  },
};

T.A3 = {
  seq: 'A', name: 'Can we help?', when: 'Day 3 after sign-up, if they still have no client', link: 'app',
  en: {
    subject: 'Can we help you get started?',
    preview: "Reply to this email and we'll set it up with you.",
    body: `Hi {{first_name}},

We noticed you haven't added a client yet. That's okay; starting is the hardest part.

If something is confusing, or you're not sure FashionTally fits the way you work, just reply to this email. We'll walk you through it in 5 minutes.

Or try it now: add one client you're working with today.`,
    button: 'Add a client',
  },
  fr: {
    subject: 'Pouvons-nous vous aider à démarrer ?',
    preview: 'Répondez à cet e-mail et nous le configurerons avec vous.',
    body: `Bonjour {{first_name}},

Nous avons remarqué que vous n'avez pas encore ajouté de client. Ce n'est pas grave : le plus difficile, c'est de commencer.

Si quelque chose n'est pas clair, ou si vous n'êtes pas sûr(e) que FashionTally correspond à votre façon de travailler, répondez simplement à cet e-mail. Nous vous guiderons en 5 minutes.

Ou essayez maintenant : ajoutez un client avec qui vous travaillez aujourd'hui.`,
    button: 'Ajouter un client',
  },
};

T.A4 = {
  seq: 'A', name: 'Save measurements', when: 'Day 2, or 1 day after the first client (whichever is later), if no measurement is saved', link: 'app',
  en: {
    subject: "Never lose a client's measurements again",
    preview: "Save them once. They're there every time the client comes back.",
    body: `Hi {{first_name}},

Well done on adding your first client. Next, save their measurements so they're safe even if your tape notebook goes missing.

You can save as many measurements as you need: bust, waist, hip, length, arm, ankle, and any custom one you use. When the client comes back next year, everything is still there.`,
    button: 'Save measurements',
  },
  fr: {
    subject: "Ne perdez plus jamais les mesures d'un client",
    preview: 'Enregistrez-les une fois. Elles seront là à chaque retour du client.',
    body: `Bonjour {{first_name}},

Bravo pour l'ajout de votre premier client. Prochaine étape : enregistrez ses mesures pour qu'elles soient en sécurité, même si votre carnet se perd.

Vous pouvez enregistrer autant de mesures que nécessaire : poitrine, taille, hanches, longueur, bras, cheville, et toutes vos mesures personnalisées. Quand le client reviendra l'année prochaine, tout sera encore là.`,
    button: 'Enregistrer les mesures',
  },
};

T.A5 = {
  seq: 'A', name: 'Your first invoice', when: 'Day 4, or 1 day after the first measurement (whichever is later), if they have a client but no invoice', link: 'app',
  en: {
    subject: 'Get paid faster with a proper invoice',
    preview: 'Send a clean, branded invoice on WhatsApp in under a minute.',
    body: `Hi {{first_name}},

Clients take you more seriously when they receive a proper invoice with your brand name and logo.

In FashionTally you can create one in under a minute and share it on WhatsApp or by email. It shows what the client has paid and what they still owe, so there's no argument about balances.

Invoices are included on the free plan too.`,
    button: 'Create an invoice',
  },
  fr: {
    subject: 'Soyez payé(e) plus vite avec une vraie facture',
    preview: 'Envoyez une facture propre, à votre marque, sur WhatsApp en moins d’une minute.',
    body: `Bonjour {{first_name}},

Les clients vous prennent plus au sérieux quand ils reçoivent une vraie facture avec le nom et le logo de votre marque.

Dans FashionTally, vous en créez une en moins d'une minute et la partagez sur WhatsApp ou par e-mail. Elle indique ce que le client a payé et ce qu'il doit encore, donc plus de discussions sur les soldes.

Les factures sont aussi incluses dans le forfait gratuit.`,
    button: 'Créer une facture',
  },
};

T.A6 = {
  seq: 'A', name: 'Track your orders', when: 'Day 5 after sign-up, if they have no order yet', link: 'app',
  en: {
    subject: "See every order that's due this week",
    preview: 'Track each job from fabric to delivery.',
    body: `Hi {{first_name}},

Missed deadlines lose clients. With Orders, you see every job, its due date and its stage at a glance: pending, in progress, ready, delivered.

Then record payments and expenses in Finance, and see what you actually made this month.

Orders and Finance are part of the paid plans, from ₦5,000 a month.`,
    button: 'Create an order',
  },
  fr: {
    subject: 'Voyez toutes les commandes à livrer cette semaine',
    preview: 'Suivez chaque travail, du tissu à la livraison.',
    body: `Bonjour {{first_name}},

Les retards font perdre des clients. Avec Commandes, vous voyez chaque travail, sa date de livraison et son étape en un coup d'œil : en attente, en cours, prête, livrée.

Enregistrez ensuite vos paiements et dépenses dans Finances, et voyez ce que vous avez vraiment gagné ce mois-ci.

Commandes et Finances font partie des forfaits payants, à partir de ₦5 000 par mois.`,
    button: 'Créer une commande',
  },
};

T.A7 = {
  seq: 'A', name: "You're all set", when: 'As soon as they have a client, a measurement and an invoice (within the first week)', link: 'app',
  en: {
    subject: "You're all set up, {{first_name}}",
    preview: '{{business_name}} is now running on FashionTally.',
    body: `Hi {{first_name}},

You've added a client, saved their measurements and sent an invoice. {{business_name}} is now running on FashionTally.

Here's what successful designers do next:

- Add the rest of your clients, so every measurement is in one place
- Book fittings in Appointments, so no one waits for you
- Keep track of fabric and materials in Inventory
- Show off your styles in Designs and share them with clients`,
    button: 'Add more clients',
  },
  fr: {
    subject: 'Tout est prêt, {{first_name}}',
    preview: '{{business_name}} fonctionne maintenant avec FashionTally.',
    body: `Bonjour {{first_name}},

Vous avez ajouté un client, enregistré ses mesures et envoyé une facture. {{business_name}} fonctionne maintenant avec FashionTally.

Voici ce que font ensuite les créateurs qui réussissent :

- Ajouter le reste de leurs clients, pour avoir toutes les mesures au même endroit
- Planifier les essayages dans Rendez-vous, pour que personne ne vous attende
- Suivre les tissus et fournitures dans Inventaire
- Présenter leurs modèles dans Créations et les partager avec leurs clients`,
    button: "Ajouter d'autres clients",
  },
};

// ─────────────────────────── C · Free plan to paid ───────────────────────────
T.C1 = {
  seq: 'C', name: 'Appointments', when: '2 days after the trial ended, if not paid', link: 'pay',
  en: {
    subject: 'No more forgotten fittings',
    preview: 'Book every fitting and pickup, and get reminded.',
    body: `Hi {{first_name}},

A client arrives for a fitting and you weren't expecting them. Or you forgot a pickup and they waited. It happens to every busy designer.

With Appointments, you book fittings, pickups and consultations in your calendar, block the days you're not working, and get a reminder before each one.`,
    button: 'Unlock Appointments',
  },
  fr: {
    subject: "Fini les essayages oubliés",
    preview: 'Planifiez chaque essayage et chaque retrait, avec un rappel.',
    body: `Bonjour {{first_name}},

Un client arrive pour un essayage et vous ne l'attendiez pas. Ou vous avez oublié un retrait et il a attendu. Cela arrive à tous les créateurs occupés.

Avec Rendez-vous, vous planifiez essayages, retraits et consultations dans votre agenda, bloquez les jours où vous ne travaillez pas, et recevez un rappel avant chacun.`,
    button: 'Débloquer Rendez-vous',
  },
};

T.C2 = {
  seq: 'C', name: 'Finance', when: '4 days after the trial ended, if not paid', link: 'pay',
  en: {
    subject: 'Do you know how much you made this month?',
    preview: 'Busy is not the same as profitable.',
    body: `Hi {{first_name}},

Many designers are busy all month and still can't say where the money went.

With Finance, you record every payment and every expense, like fabric, thread, lining and transport. FashionTally then shows your income, expenses and profit for the month, so you can price your work properly.`,
    button: 'See my profit',
  },
  fr: {
    subject: 'Savez-vous combien vous avez gagné ce mois-ci ?',
    preview: "Être occupé(e) n'est pas la même chose qu'être rentable.",
    body: `Bonjour {{first_name}},

Beaucoup de créateurs sont occupés tout le mois et ne savent toujours pas où est passé l'argent.

Avec Finances, vous enregistrez chaque paiement et chaque dépense : tissu, fil, doublure, transport. FashionTally affiche ensuite vos revenus, vos dépenses et votre bénéfice du mois, pour fixer vos prix correctement.`,
    button: 'Voir mon bénéfice',
  },
};

T.C3 = {
  seq: 'C', name: 'What it costs you', when: '7 days after the trial ended, if not paid', link: 'pay',
  en: {
    subject: 'One lost order costs more than FashionTally',
    preview: 'Starter is ₦5,000 a month. Do the maths.',
    body: `Hi {{first_name}},

Think about the last time a delivery was late, a measurement was wrong, or a client's balance was forgotten. What did it cost you?

Starter costs ₦5,000 a month. If FashionTally helps you avoid one late order, or collect one forgotten balance, it has paid for itself.`,
    button: 'Choose a plan',
  },
  fr: {
    subject: 'Une commande perdue coûte plus cher que FashionTally',
    preview: 'Starter coûte ₦5 000 par mois. Faites le calcul.',
    body: `Bonjour {{first_name}},

Pensez à la dernière fois qu'une livraison a été en retard, qu'une mesure était fausse ou qu'un solde client a été oublié. Combien cela vous a-t-il coûté ?

Starter coûte ₦5 000 par mois. Si FashionTally vous évite une seule commande en retard, ou vous aide à récupérer un seul solde oublié, il est déjà rentabilisé.`,
    button: 'Choisir un forfait',
  },
};

T.C4 = {
  seq: 'C', name: 'Designs and Inventory', when: '10 days after the trial ended, if not paid', link: 'pay',
  en: {
    subject: 'Show your styles. Know your fabric.',
    preview: 'A catalogue for clients and a stock list for you.',
    body: `Hi {{first_name}},

Two features designers love:

- Designs: put your best styles in one catalogue with prices, and share it with clients when they ask "what can you make?"
- Inventory: know how many yards of each fabric you have, and get warned before you run out.`,
    button: 'Unlock Designs and Inventory',
  },
  fr: {
    subject: 'Montrez vos modèles. Connaissez vos tissus.',
    preview: 'Un catalogue pour vos clients et une liste de stock pour vous.',
    body: `Bonjour {{first_name}},

Deux fonctionnalités que les créateurs adorent :

- Créations : rassemblez vos plus beaux modèles dans un catalogue avec les prix, et partagez-le quand un client demande « qu'est-ce que vous pouvez faire ? »
- Inventaire : sachez combien de mètres de chaque tissu il vous reste, et soyez prévenu(e) avant d'en manquer.`,
    button: 'Débloquer Créations et Inventaire',
  },
};

T.C5 = {
  seq: 'C', name: 'Plan guide (no offer running)', when: '14 days after the trial ended, if not paid and no offer is active', link: 'pay',
  en: {
    subject: 'Every FashionTally feature, from ₦5,000 a month',
    preview: 'Every plan unlocks everything. Pick what fits your budget.',
    body: `Hi {{first_name}},

Every FashionTally plan gives you every feature: Orders, Appointments, Inventory, Finance, Designs, CRM, and no limit on clients or invoices.

Just choose the plan that fits your budget:

- Starter: ₦5,000 a month
- Growth: ₦10,000 a month
- Professional: ₦15,000 a month`,
    button: 'Compare plans',
  },
  fr: {
    subject: 'Toutes les fonctionnalités FashionTally, dès ₦5 000 par mois',
    preview: 'Chaque forfait débloque tout. Choisissez selon votre budget.',
    body: `Bonjour {{first_name}},

Chaque forfait FashionTally vous donne toutes les fonctionnalités : Commandes, Rendez-vous, Inventaire, Finances, Créations, CRM, et aucune limite de clients ou de factures.

Choisissez simplement le forfait adapté à votre budget :

- Starter : ₦5 000 par mois
- Growth : ₦10 000 par mois
- Professional : ₦15 000 par mois`,
    button: 'Comparer les forfaits',
  },
};

T.C5_offer = {
  seq: 'C', name: 'Special offer (offer running)', when: '14 days after the trial ended, if not paid and an offer is active', link: 'pay',
  en: {
    subject: 'A special offer for {{business_name}}, ends {{offer_end_date}}',
    preview: '{{offer_text}}',
    body: `Hi {{first_name}},

We'd love to have {{business_name}} on a paid plan, so we've made it easier:

{{offer_text}}

This offer ends on {{offer_end_date}}.`,
    button: 'Claim my offer',
  },
  fr: {
    subject: "Une offre spéciale pour {{business_name}}, jusqu'au {{offer_end_date}}",
    preview: '{{offer_text}}',
    body: `Bonjour {{first_name}},

Nous aimerions accueillir {{business_name}} sur un forfait payant, alors nous vous facilitons les choses :

{{offer_text}}

Cette offre se termine le {{offer_end_date}}.`,
    button: "Profiter de l'offre",
  },
};

T.C6 = {
  seq: 'C', name: "What's stopping you?", when: '21 days after the trial ended, if not paid (no button: they reply)', link: null,
  en: {
    subject: 'Can I ask you one quick question?',
    preview: 'Just reply with a number.',
    body: `Hi {{first_name}},

You tried FashionTally but haven't upgraded yet. We'd really like to know why, so we can make it better.

Just reply with a number:

1. It's too expensive for me right now
2. I didn't have time to set it up
3. It's missing something I need
4. I prefer my notebook or WhatsApp

Every reply is read by our team.`,
    button: '',
  },
  fr: {
    subject: 'Puis-je vous poser une petite question ?',
    preview: 'Répondez simplement avec un chiffre.',
    body: `Bonjour {{first_name}},

Vous avez essayé FashionTally mais n'êtes pas encore passé(e) à un forfait payant. Nous aimerions vraiment savoir pourquoi, pour nous améliorer.

Répondez simplement avec un chiffre :

1. C'est trop cher pour moi en ce moment
2. Je n'ai pas eu le temps de le configurer
3. Il manque quelque chose dont j'ai besoin
4. Je préfère mon carnet ou WhatsApp

Chaque réponse est lue par notre équipe.`,
    button: '',
  },
};

T.C7 = {
  seq: 'C', name: 'Almost at the limit', when: 'When free-plan clients or invoices reach 8 of 10 (once for each)', link: 'pay',
  en: {
    subject: "You've used {{limit_used}} of your 10 free {{limit_type}}",
    preview: 'Upgrade before you run out of space.',
    body: `Hi {{first_name}},

Your business is growing. You've used {{limit_used}} of the 10 {{limit_type}} on the free plan.

Upgrade now so you can keep adding them without interruption, and unlock every other feature at the same time.`,
    button: 'Remove the limit',
  },
  fr: {
    subject: 'Vous avez utilisé {{limit_used}} {{limit_type}} sur 10 avec le forfait gratuit',
    preview: "Passez à un forfait avant d'être à court de place.",
    body: `Bonjour {{first_name}},

Votre activité grandit. Vous avez utilisé {{limit_used}} {{limit_type}} sur les 10 permis par le forfait gratuit.

Passez à un forfait maintenant pour continuer à en ajouter sans interruption, et débloquer toutes les autres fonctionnalités en même temps.`,
    button: 'Supprimer la limite',
  },
};

T.C8 = {
  seq: 'C', name: 'Limit reached', when: 'When free-plan clients or invoices reach 10 of 10 (once for each)', link: 'pay',
  en: {
    subject: "You've reached your free limit",
    preview: 'Upgrade to keep adding {{limit_type}}.',
    body: `Hi {{first_name}},

You've reached the 10 {{limit_type}} allowed on the free plan, so you can't add more {{limit_type}} until you subscribe.

Everything you've saved is safe. Subscribe to add {{limit_type}} again, with no limit, from ₦5,000 a month.`,
    button: 'Upgrade now',
  },
  fr: {
    subject: 'Vous avez atteint votre limite gratuite',
    preview: 'Passez à un forfait pour continuer à ajouter des {{limit_type}}.',
    body: `Bonjour {{first_name}},

Vous avez atteint la limite de 10 {{limit_type}} du forfait gratuit : vous ne pouvez plus en ajouter tant que vous ne vous abonnez pas.

Tout ce que vous avez enregistré est en sécurité. Abonnez-vous pour en ajouter à nouveau, sans limite, dès ₦5 000 par mois.`,
    button: 'Passer à un forfait',
  },
};

// ─────────────────────────── D · New paying subscriber ───────────────────────────
T.D2 = {
  seq: 'D', name: 'Your new features', when: '2 days after the first payment', link: 'app',
  en: {
    subject: "5 things you can do now that you couldn't before",
    preview: 'Orders, Appointments, Finance, Inventory and Designs.',
    body: `Hi {{first_name}},

Here's how to get the most out of your plan this week:

1. Orders: add every job you're working on, with its due date.
2. Appointments: book your next fittings and pickups.
3. Finance: record today's payments and expenses.
4. Inventory: list the fabric you have in stock.
5. Designs: upload 3 of your best styles to show clients.

Do one a day, and by next week your whole business is in one place.`,
    button: 'Get started',
  },
  fr: {
    subject: '5 choses que vous pouvez faire maintenant',
    preview: 'Commandes, Rendez-vous, Finances, Inventaire et Créations.',
    body: `Bonjour {{first_name}},

Voici comment profiter au maximum de votre forfait cette semaine :

1. Commandes : ajoutez chaque travail en cours, avec sa date de livraison.
2. Rendez-vous : planifiez vos prochains essayages et retraits.
3. Finances : enregistrez les paiements et dépenses du jour.
4. Inventaire : listez les tissus que vous avez en stock.
5. Créations : ajoutez 3 de vos plus beaux modèles à montrer aux clients.

Faites-en un par jour, et d'ici la semaine prochaine toute votre activité sera au même endroit.`,
    button: 'Commencer',
  },
};

T.D3 = {
  seq: 'D', name: 'Set up Orders', when: '4 days after the first payment, if they have no order yet', link: 'app',
  en: {
    subject: "Put this week's orders in FashionTally",
    preview: 'See every due date at a glance.',
    body: `Hi {{first_name}},

You haven't added an order yet. Orders is where FashionTally saves you the most time.

Add the jobs you're working on this week. You'll see what's due, what's ready, and what each client still owes, all on one screen.`,
    button: 'Add an order',
  },
  fr: {
    subject: 'Ajoutez les commandes de la semaine dans FashionTally',
    preview: "Voyez toutes les dates de livraison d'un coup d'œil.",
    body: `Bonjour {{first_name}},

Vous n'avez pas encore ajouté de commande. C'est avec Commandes que FashionTally vous fait gagner le plus de temps.

Ajoutez les travaux de cette semaine. Vous verrez ce qui est à livrer, ce qui est prêt et ce que chaque client doit encore, sur un seul écran.`,
    button: 'Ajouter une commande',
  },
};

T.D4 = {
  seq: 'D', name: 'Add your team', when: '10 days after the first payment, if they have no team member yet', link: 'app',
  en: {
    subject: 'Let your staff help, without seeing everything',
    preview: 'Give each team member only the access they need.',
    body: `Hi {{first_name}},

If you have tailors, apprentices or a front-desk person, you can add them to FashionTally.

Each person only sees what you allow, so your finances stay private.`,
    button: 'Add a team member',
  },
  fr: {
    subject: 'Laissez votre équipe vous aider, sans tout voir',
    preview: "Donnez à chaque membre uniquement l'accès dont il a besoin.",
    body: `Bonjour {{first_name}},

Si vous avez des tailleurs, des apprentis ou une personne à l'accueil, vous pouvez les ajouter à FashionTally.

Chaque personne ne voit que ce que vous autorisez, donc vos finances restent privées.`,
    button: 'Ajouter un membre',
  },
};

// ─────────────────────────── E · Renewal ───────────────────────────
T.E1 = {
  seq: 'E', name: 'Plan ends in 7 days', when: '7 days before a paid plan ends, if not renewed', link: 'pay',
  en: {
    subject: 'Your {{plan_name}} plan ends on {{renewal_date}}',
    preview: 'Renew in 2 minutes and keep everything running.',
    body: `Hi {{first_name}},

Your FashionTally {{plan_name}} plan ends in 7 days, on {{renewal_date}}.

{{progress_line}}

Renew now so nothing stops in the middle of a busy week.`,
    button: 'Renew my plan',
  },
  fr: {
    subject: 'Votre forfait {{plan_name}} se termine le {{renewal_date}}',
    preview: 'Renouvelez en 2 minutes et gardez tout en marche.',
    body: `Bonjour {{first_name}},

Votre forfait FashionTally {{plan_name}} se termine dans 7 jours, le {{renewal_date}}.

{{progress_line}}

Renouvelez maintenant pour que rien ne s'arrête au milieu d'une semaine chargée.`,
    button: 'Renouveler mon forfait',
  },
};

T.E5 = {
  seq: 'E', name: 'We miss you', when: '7 days after a paid plan ended, if not renewed', link: 'pay',
  en: {
    subject: '{{first_name}}, your orders are waiting for you',
    preview: 'Everything is saved. Come back anytime.',
    body: `Hi {{first_name}},

It's been a week since your FashionTally plan ended. Your clients, measurements, orders and records are all still saved.

{{offer_line}}

If something wasn't working for you, reply and tell us. We read every message.`,
    button: 'Come back to FashionTally',
  },
  fr: {
    subject: '{{first_name}}, vos commandes vous attendent',
    preview: 'Tout est enregistré. Revenez quand vous voulez.',
    body: `Bonjour {{first_name}},

Cela fait une semaine que votre forfait FashionTally s'est terminé. Vos clients, mesures, commandes et données sont toujours enregistrés.

{{offer_line}}

Si quelque chose ne vous convenait pas, répondez-nous. Nous lisons chaque message.`,
    button: 'Revenir sur FashionTally',
  },
};

// ─────────────────────────── F · Inactive users ───────────────────────────
T.F1 = {
  seq: 'F', name: "How's business?", when: '7 days without any activity (not during the first week or the free-plan emails)', link: 'app',
  en: {
    subject: "{{first_name}}, how's business this week?",
    preview: 'A 2-minute habit that keeps your records up to date.',
    body: `Hi {{first_name}},

We haven't seen you on FashionTally this week. Busy weeks are exactly when records slip.

Take 2 minutes today: add any new clients, update your orders, and record the payments you received.`,
    button: 'Open FashionTally',
  },
  fr: {
    subject: '{{first_name}}, comment vont les affaires cette semaine ?',
    preview: 'Une habitude de 2 minutes pour garder vos données à jour.',
    body: `Bonjour {{first_name}},

Nous ne vous avons pas vu(e) sur FashionTally cette semaine. C'est justement pendant les semaines chargées que les données prennent du retard.

Prenez 2 minutes aujourd'hui : ajoutez vos nouveaux clients, mettez à jour vos commandes et enregistrez les paiements reçus.`,
    button: 'Ouvrir FashionTally',
  },
};

T.F2 = {
  seq: 'F', name: 'Your records are waiting', when: '14 days without any activity', link: 'app',
  en: {
    subject: 'Is everything okay, {{first_name}}?',
    preview: 'Your clients and measurements are safe and waiting.',
    body: `Hi {{first_name}},

It's been 2 weeks since you last opened FashionTally. Your clients, measurements and invoices are all saved and waiting for you.

If something isn't working, or you need help, reply to this email. We'll sort it out with you.`,
    button: 'Open FashionTally',
  },
  fr: {
    subject: 'Tout va bien, {{first_name}} ?',
    preview: 'Vos clients et vos mesures sont en sécurité et vous attendent.',
    body: `Bonjour {{first_name}},

Cela fait 2 semaines que vous n'avez pas ouvert FashionTally. Vos clients, mesures et factures sont tous enregistrés et vous attendent.

Si quelque chose ne fonctionne pas, ou si vous avez besoin d'aide, répondez à cet e-mail. Nous réglerons cela avec vous.`,
    button: 'Ouvrir FashionTally',
  },
};

// ─────────────────────────── G · Existing sign-ups (one time) ───────────────────────────
T.G1 = {
  seq: 'G', name: "What's new", when: 'The day you switch this sequence on, to users who signed up before that and have not paid', link: 'app',
  en: {
    subject: 'FashionTally has changed a lot since you signed up',
    preview: 'English and French, appointment block days, and easier subscriptions.',
    body: `Hi {{first_name}},

You signed up for FashionTally a while ago. Since then we've been busy making it easier for designers like you:

- English and French: use FashionTally in the language you prefer
- Block days for appointments: mark the days you're not working, so clients can't book them
- Subscribe in the mobile app: choose and pay for your plan in a few taps, right from your phone

Your account is still there. Log in and take another look.`,
    button: 'Take a look',
  },
  fr: {
    subject: 'FashionTally a beaucoup changé depuis votre inscription',
    preview: 'Anglais et français, jours bloqués pour les rendez-vous et abonnement plus simple.',
    body: `Bonjour {{first_name}},

Vous vous êtes inscrit(e) sur FashionTally il y a quelque temps. Depuis, nous avons beaucoup travaillé pour simplifier la vie des créateurs comme vous :

- Anglais et français : utilisez FashionTally dans la langue de votre choix
- Jours bloqués pour les rendez-vous : indiquez les jours où vous ne travaillez pas, pour que les clients ne puissent pas réserver
- Abonnement dans l'application mobile : choisissez et payez votre forfait en quelques secondes, depuis votre téléphone

Votre compte est toujours là. Connectez-vous et jetez un œil.`,
    button: 'Découvrir',
  },
};

T.G2 = {
  seq: 'G', name: 'Free setup call', when: '3 days after G1, if not paid and not active since G1 (no button: they reply)', link: null,
  en: {
    subject: 'Want us to set it up with you?',
    preview: 'A free 10-minute call to get your business set up.',
    body: `Hi {{first_name}},

Setting up a new app takes time, and you're busy running a business. So let us help.

Reply to this email with a good time and your phone number, and someone from our team will call you and set up your first clients with you. It's free and takes about 10 minutes.`,
    button: '',
  },
  fr: {
    subject: 'On le configure ensemble ?',
    preview: 'Un appel gratuit de 10 minutes pour configurer votre activité.',
    body: `Bonjour {{first_name}},

Configurer une nouvelle application prend du temps, et vous êtes occupé(e) à faire tourner votre activité. Alors laissez-nous vous aider.

Répondez à cet e-mail avec un créneau qui vous convient et votre numéro de téléphone : quelqu'un de notre équipe vous appellera pour configurer vos premiers clients avec vous. C'est gratuit et cela prend environ 10 minutes.`,
    button: '',
  },
};

T.G3 = {
  seq: 'G', name: 'Thank-you offer', when: '7 days after G1, if not paid', link: 'pay',
  en: {
    subject: 'A thank-you for our early users',
    preview: 'Every feature is ready for you.',
    body: `Hi {{first_name}},

You were one of the first people to sign up for FashionTally, and we want to say thank you.

{{offer_line}}`,
    button: 'Choose my plan',
  },
  fr: {
    subject: 'Un merci à nos premiers utilisateurs',
    preview: 'Toutes les fonctionnalités vous attendent.',
    body: `Bonjour {{first_name}},

Vous faites partie des premières personnes inscrites sur FashionTally, et nous voulons vous dire merci.

{{offer_line}}`,
    button: 'Choisir mon forfait',
  },
};

/** Sign-off added under every automated email. */
const SIGN_OFF = {
  en: 'Maimuna Anka<br/><span style="color:rgba(243,243,241,0.5);font-size:13px;">Founder, FashionTally</span>',
  fr: 'Maimuna Anka<br/><span style="color:rgba(243,243,241,0.5);font-size:13px;">Fondatrice, FashionTally</span>',
};

/** Small label at the top right of each email, per sequence. */
const LABELS = {
  A: { en: 'Getting started', fr: 'Bien démarrer' },
  C: { en: 'Tip', fr: 'Astuce' },
  D: { en: 'Your plan', fr: 'Votre forfait' },
  E: { en: 'Your plan', fr: 'Votre forfait' },
  F: { en: 'Check-in', fr: 'Des nouvelles' },
  G: { en: "What's new", fr: 'Nouveautés' },
};

module.exports = { TEMPLATES: T, SEQUENCES, SIGN_OFF, LABELS };
