const BrandSetting = require('../models/BrandSetting');

const createBrandSetting = async (req, res) => {
  try {
    const data = req.body;
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
    const data = req.body;

    const updated = await BrandSetting.findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Brand setting not found' });
    }

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

let rateCache = { usdToNgn: null, fetchedAt: 0 };

const getExchangeRate = async (req, res) => {
  try {
    const fresh = rateCache.usdToNgn && Date.now() - rateCache.fetchedAt < 60 * 60 * 1000;
    if (fresh) {
      return res.json({ success: true, usdToNgn: rateCache.usdToNgn });
    }

    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await response.json();
    const usdToNgn = Number(data?.rates?.NGN);
    if (!response.ok || !usdToNgn) {
      throw new Error('Exchange rate unavailable');
    }

    rateCache = { usdToNgn, fetchedAt: Date.now() };
    res.json({ success: true, usdToNgn });
  } catch (error) {
    if (rateCache.usdToNgn) {
      return res.json({ success: true, usdToNgn: rateCache.usdToNgn });
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
