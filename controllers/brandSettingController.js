const BrandSetting = require('../models/BrandSetting');

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Find a business's brand record(s). Many older records (copied from Firebase)
 * have an empty `id`, so also match on the owner's email, ignoring capitals.
 */
const brandFilter = (idOrEmail) => {
  const value = String(idOrEmail || '').trim();
  return {
    $or: [
      { id: value },
      { userEmail: new RegExp(`^${escapeRegex(value)}$`, 'i') },
    ],
  };
};

/** Fields the app may change (never the Mongo _id). */
const editableFields = (data = {}) => {
  const { _id, __v, ...rest } = data;
  if (rest.inventoryCurrency) rest.inventoryCurrency = String(rest.inventoryCurrency).toUpperCase();
  return rest;
};

const createBrandSetting = async (req, res) => {
  try {
    const data = editableFields(req.body);

    // The app falls back to "create" when an edit fails; if the business already
    // has a brand record, update it instead of making a duplicate.
    const owner = data.userEmail || data.id;
    if (owner && (await BrandSetting.exists(brandFilter(owner)))) {
      req.params = { ...req.params, id: owner };
      req.body = data;
      return editBrandSetting(req, res);
    }

    const newBrandSetting = new BrandSetting({
      ...data,
      updatedAt: new Date().toISOString(),
    });
    await newBrandSetting.save();

    res.status(201).json({
      success: true,
      message: 'Brand setting created successfully',
      data: newBrandSetting
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteBrandSetting = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await BrandSetting.findOneAndDelete({ id });

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Brand setting not found' });
    }

    res.json({ success: true, message: 'Brand setting deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editBrandSetting = async (req, res) => {
  try {
    const { id } = req.params;
    const data = editableFields(req.body);
    const filter = brandFilter(id);

    const existing = await BrandSetting.findOne(filter).lean();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Brand setting not found' });
    }

    const changes = { ...data, updatedAt: new Date().toISOString() };
    // Fill in the id older records are missing, so later saves find it directly
    if (!existing.id) changes.id = String(existing.userEmail || id).toLowerCase();

    // Update every record for this business (a few accounts have duplicates) so they stay the same
    await BrandSetting.updateMany(filter, { $set: changes }, { runValidators: true });
    const updated = await BrandSetting.findById(existing._id);

    res.json({ success: true, message: 'Brand setting updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getBrandSetting = async (req, res) => {
  try {
    const { id } = req.params;
    const brandSetting = await BrandSetting.findOne({ id });

    if (!brandSetting) {
      return res.status(404).json({ success: false, error: 'Brand setting not found' });
    }

    res.json({ success: true, data: brandSetting });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getBrandSettingByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const brandSetting = await BrandSetting.findOne({ userEmail: email.toLowerCase() });

    if (!brandSetting) {
      return res.status(404).json({ success: false, error: 'Brand setting not found' });
    }

    res.json({ success: true, data: brandSetting });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

let rateCache = { usdToNgn: null, rates: null, updatedAt: null, fetchedAt: 0 };

/**
 * GET /api/brand-setting/exchange-rate
 * `rates` = units of each currency per 1 USD (e.g. rates.NGN, rates.CNY), refreshed hourly.
 * `usdToNgn` is kept for older app versions.
 */
const getExchangeRate = async (req, res) => {
  const reply = () => ({
    success: true,
    usdToNgn: rateCache.usdToNgn,
    rates: rateCache.rates,
    updatedAt: rateCache.updatedAt,
  });
  try {
    const fresh = rateCache.rates && Date.now() - rateCache.fetchedAt < 60 * 60 * 1000;
    if (fresh) return res.json(reply());

    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await response.json();
    const usdToNgn = Number(data?.rates?.NGN);
    if (!response.ok || !usdToNgn) {
      throw new Error('Exchange rate unavailable');
    }

    rateCache = {
      usdToNgn,
      rates: data.rates,
      updatedAt: data.time_last_update_utc || new Date().toISOString(),
      fetchedAt: Date.now(),
    };
    res.json(reply());
  } catch (error) {
    if (rateCache.rates) {
      return res.json(reply());
    }
    console.error('❌ Error:', error);
    res.status(502).json({ success: false, error: 'Could not load the exchange rate' });
  }
};

module.exports = {
  createBrandSetting,
  deleteBrandSetting,
  editBrandSetting,
  getBrandSetting,
  getBrandSettingByEmail,
  getExchangeRate
};
