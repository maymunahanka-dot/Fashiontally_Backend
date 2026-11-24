/**
 * Fashion Refab: marketplace for leftover fabric.
 *
 * Public (no login):  browse listings, open one, count views / WhatsApp & phone contacts, report.
 * Signed-in business: list, create, edit, change status and delete its own listings.
 * Team members act for the owner's business (req.effectiveEmail).
 */
const RefabListing = require('../models/RefabListing');
const User = require('../models/User');
const BrandSetting = require('../models/BrandSetting');

const FABRICS = ['Ankara', 'Lace', 'Cotton', 'Aso-oke', 'Silk', 'Denim', 'Chiffon', 'Adire', 'Other'];
const CITIES = ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt', 'Enugu', 'Other'];
const STATUSES = ['available', 'reserved', 'sold'];
const MAX_IMAGES = 8;
const PAGE_SIZE = 24;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ownerOf = (req) => String(req.effectiveEmail || req.user?.email || '').toLowerCase();

/** What buyers see (no owner email, no moderation fields) */
const toPublic = (l) => ({
  id: String(l._id),
  seller: l.seller,
  title: l.title,
  fabric: l.fabric,
  quantity: l.quantity,
  colours: l.colours,
  price: l.price,
  city: l.city,
  area: l.area,
  phone: l.status === 'sold' ? '' : l.phone,
  pickupOnly: l.pickupOnly,
  description: l.description,
  images: l.images,
  status: l.status,
  postedAt: l.createdAt,
});

/** What the owner sees in the dashboard */
const toOwner = (l) => ({ ...toPublic(l), phone: l.phone, views: l.views, enquiries: l.enquiries, hidden: l.hidden, updatedAt: l.updatedAt });

/** Checks and cleans what the app sends. Returns { data } or { errors }. */
const readListing = (body = {}) => {
  const errors = {};
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const data = {
    title: str(body.title, 80),
    fabric: str(body.fabric, 30),
    quantity: str(body.quantity, 60),
    colours: (Array.isArray(body.colours) ? body.colours : [])
      .map((c) => str(c, 24))
      .filter(Boolean)
      .slice(0, 10),
    price: Number(body.price),
    city: str(body.city, 40),
    area: str(body.area, 60),
    phone: str(body.phone, 30),
    pickupOnly: Boolean(body.pickupOnly),
    description: str(body.description, 1500),
    images: (Array.isArray(body.images) ? body.images : [])
      .map((u) => str(u, 600))
      .filter((u) => /^https:\/\/\S+$/i.test(u))
      .slice(0, MAX_IMAGES),
  };
  if (!data.title) errors.title = 'Give your listing a title';
  if (!FABRICS.includes(data.fabric)) errors.fabric = 'Pick a fabric type';
  if (!data.quantity) errors.quantity = 'Say how much you have';
  if (!Number.isFinite(data.price) || data.price < 0 || data.price > 10000000) errors.price = 'Enter a valid price (0 for free)';
  if (!CITIES.includes(data.city)) errors.city = 'Pick a city';
  if (!data.area) errors.area = 'Add your area';
  if (!/^[+\d][\d\s()-]{6,}$/.test(data.phone)) errors.phone = 'Add a valid phone number';
  data.price = Math.round(data.price || 0);
  return Object.keys(errors).length ? { errors } : { data };
};

const sellerName = async (email) => {
  const [brand, user] = await Promise.all([
    BrandSetting.findOne({ userEmail: email }, 'businessName').lean(),
    User.findOne({ email }, 'businessName name').lean(),
  ]);
  return brand?.businessName || user?.businessName || user?.name || 'FashionTally designer';
};

// ── Public ─────────────────────────────────────────────────────────────────

// GET /api/refab/listings?q=&fabric=&city=&price=free|under10|over10&sort=newest|price-asc|price-desc&hideSold=1&page=1
const listPublic = async (req, res) => {
  try {
    const { q, fabric, city, price, sort = 'newest', hideSold } = req.query;
    const filter = { hidden: { $ne: true } };
    if (fabric && fabric !== 'All') filter.fabric = String(fabric);
    if (city && city !== 'All') filter.city = String(city);
    if (price === 'free') filter.price = 0;
    if (price === 'under10') filter.price = { $gt: 0, $lt: 10000 };
    if (price === 'over10') filter.price = { $gte: 10000 };
    if (hideSold === '1' || hideSold === 'true') filter.status = { $ne: 'sold' };
    if (q && String(q).trim()) {
      const re = new RegExp(escapeRegex(String(q).trim().slice(0, 60)), 'i');
      filter.$or = [{ title: re }, { fabric: re }, { city: re }, { area: re }, { colours: re }, { seller: re }];
    }
    const sortBy = sort === 'price-asc' ? { price: 1, createdAt: -1 } : sort === 'price-desc' ? { price: -1, createdAt: -1 } : { createdAt: -1 };
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const [rows, total, stats] = await Promise.all([
      RefabListing.find(filter).sort(sortBy).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      RefabListing.countDocuments(filter),
      RefabListing.aggregate([
        { $match: { hidden: { $ne: true } } },
        {
          $group: {
            _id: null,
            available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
            free: { $sum: { $cond: [{ $and: [{ $eq: ['$price', 0] }, { $ne: ['$status', 'sold'] }] }, 1, 0] } },
            cities: { $addToSet: '$city' },
          },
        },
      ]),
    ]);
    const s = stats[0] || { available: 0, free: 0, cities: [] };
    res.json({
      success: true,
      data: {
        listings: rows.map(toPublic),
        total,
        page,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        stats: { available: s.available, free: s.free, cities: s.cities.length },
      },
    });
  } catch (error) {
    console.error('[refab] list failed:', error.message);
    res.status(500).json({ success: false, error: 'Could not load listings' });
  }
};

// GET /api/refab/listings/:id
const getPublic = async (req, res) => {
  try {
    const l = await RefabListing.findOne({ _id: req.params.id, hidden: { $ne: true } }).lean();
    if (!l) return res.status(404).json({ success: false, error: 'Listing not found' });
    res.json({ success: true, data: toPublic(l) });
  } catch {
    res.status(404).json({ success: false, error: 'Listing not found' });
  }
};

// POST /api/refab/listings/:id/track  { event: 'view' | 'contact' }
const track = async (req, res) => {
  try {
    const field = req.body?.event === 'contact' ? 'enquiries' : req.body?.event === 'view' ? 'views' : null;
    if (!field) return res.status(400).json({ success: false, error: 'Unknown event' });
    await RefabListing.updateOne({ _id: req.params.id, hidden: { $ne: true } }, { $inc: { [field]: 1 } });
    res.json({ success: true });
  } catch {
    res.json({ success: true }); // counting is best effort
  }
};

// POST /api/refab/listings/:id/report  { reason }
const report = async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').slice(0, 300);
    const l = await RefabListing.findOneAndUpdate({ _id: req.params.id }, { $inc: { reports: 1 } }, { new: true }).lean();
    if (!l) return res.status(404).json({ success: false, error: 'Listing not found' });
    console.warn(`[refab] listing ${l._id} ("${l.title}") reported (${l.reports} total)${reason ? `: ${reason}` : ''}`);
    res.json({ success: true });
  } catch {
    res.status(404).json({ success: false, error: 'Listing not found' });
  }
};

// ── Owner ──────────────────────────────────────────────────────────────────

// GET /api/refab/mine
const listMine = async (req, res) => {
  try {
    const rows = await RefabListing.find({ userEmail: ownerOf(req) }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: rows.map(toOwner) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/refab
const create = async (req, res) => {
  try {
    const { data, errors } = readListing(req.body);
    if (errors) return res.status(400).json({ success: false, error: Object.values(errors)[0], errors });
    const email = ownerOf(req);
    const count = await RefabListing.countDocuments({ userEmail: email, status: { $ne: 'sold' } });
    if (count >= 100) return res.status(400).json({ success: false, error: 'You can have up to 100 active listings.' });
    const listing = await RefabListing.create({ ...data, userEmail: email, seller: await sellerName(email) });
    res.status(201).json({ success: true, data: toOwner(listing.toObject()) });
  } catch (error) {
    console.error('[refab] create failed:', error.message);
    res.status(500).json({ success: false, error: 'Could not save the listing' });
  }
};

// PUT /api/refab/:id
const update = async (req, res) => {
  try {
    const { data, errors } = readListing(req.body);
    if (errors) return res.status(400).json({ success: false, error: Object.values(errors)[0], errors });
    if (STATUSES.includes(req.body?.status)) data.status = req.body.status;
    const listing = await RefabListing.findOneAndUpdate({ _id: req.params.id, userEmail: ownerOf(req) }, { $set: data }, { new: true }).lean();
    if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });
    res.json({ success: true, data: toOwner(listing) });
  } catch {
    res.status(404).json({ success: false, error: 'Listing not found' });
  }
};

// PATCH /api/refab/:id/status  { status }
const setStatus = async (req, res) => {
  try {
    const status = req.body?.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ success: false, error: 'Unknown status' });
    const listing = await RefabListing.findOneAndUpdate({ _id: req.params.id, userEmail: ownerOf(req) }, { $set: { status } }, { new: true }).lean();
    if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });
    res.json({ success: true, data: toOwner(listing) });
  } catch {
    res.status(404).json({ success: false, error: 'Listing not found' });
  }
};

// DELETE /api/refab/:id
const remove = async (req, res) => {
  try {
    const { deletedCount } = await RefabListing.deleteOne({ _id: req.params.id, userEmail: ownerOf(req) });
    if (!deletedCount) return res.status(404).json({ success: false, error: 'Listing not found' });
    res.json({ success: true });
  } catch {
    res.status(404).json({ success: false, error: 'Listing not found' });
  }
};

module.exports = { listPublic, getPublic, track, report, listMine, create, update, setStatus, remove, FABRICS, CITIES };
