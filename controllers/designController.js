const Design = require('../models/Design');
const cloudinary = require('../config/cloudinary');

const uploadImageToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'designs', resource_type: 'image' },
      (error, result) => { if (error) reject(error); else resolve(result.secure_url); }
    );
    stream.end(buffer);
  });
};

const createDesign = async (req, res) => {
  try {
    const data = JSON.parse(req.body.data || '{}');
    const userEmail = req.effectiveEmail;

    let imageUrl = data.imageUrl || '';
    if (req.file) {
      imageUrl = await uploadImageToCloudinary(req.file.buffer);
    }

    const newDesign = new Design({
      ...data,
      type: data.type || 'design',   // preserve type from client, default to "design"
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userEmail,
      imageUrl,
      images: imageUrl ? [imageUrl] : (data.images || []),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newDesign.save();
    res.status(201).json({ success: true, message: 'Design created successfully', data: newDesign });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteDesign = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Design.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ success: false, error: 'Design not found' });
    res.json({ success: true, message: 'Design deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editDesign = async (req, res) => {
  try {
    const { id } = req.params;
    const data = JSON.parse(req.body.data || '{}');

    let imageUrl = data.imageUrl;
    if (req.file) {
      imageUrl = await uploadImageToCloudinary(req.file.buffer);
    }

    const updatePayload = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    if (imageUrl !== undefined) {
      updatePayload.imageUrl = imageUrl;
      updatePayload.images = imageUrl ? [imageUrl] : [];
    }

    const updated = await Design.findOneAndUpdate(
      { id },
      { $set: updatePayload },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Design not found' });
    res.json({ success: true, message: 'Design updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getDesign = async (req, res) => {
  try {
    const { id } = req.params;
    const design = await Design.findOne({ id });
    if (!design) return res.status(404).json({ success: false, error: 'Design not found' });
    res.json({ success: true, data: design });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getDesignByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    const { type } = req.query;

    console.log('🎨 getDesignByEmail called');
    console.log('  email:', email);
    console.log('  ?type query param:', type);

    let filter;
    if (type === 'order') {
      filter = { userEmail: email, $or: [{ type: 'order' }, { type: { $exists: false } }, { type: null }] };
    } else if (type === 'design') {
      filter = { userEmail: email, type: { $ne: 'order' } };
    } else {
      filter = { userEmail: email };
    }

    console.log('  MongoDB filter:', JSON.stringify(filter));

    const designs = await Design.find(filter).sort({ createdAt: -1 });

    console.log(`  Total records returned: ${designs.length}`);
    designs.forEach((d, i) => {
      console.log(`  [${i}] id: ${d.id} | type: "${d.type}" | name: "${d.name}"`);
    });

    res.json({ success: true, data: designs });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createDesign, deleteDesign, editDesign, getDesign, getDesignByEmail };
