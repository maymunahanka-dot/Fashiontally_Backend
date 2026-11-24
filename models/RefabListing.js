const mongoose = require('mongoose');

/**
 * Fashion Refab: leftover fabric a fashion business sells or gives away.
 * Owned by the business account (userEmail = owner; team members post for the owner).
 * Photos are uploaded to Cloudinary by the app; only their URLs are stored here.
 * Not synced to Firebase.
 */
const refabListingSchema = new mongoose.Schema(
  {
    userEmail:   { type: String, required: true, index: true },
    seller:      { type: String, default: '' },       // business name shown to buyers
    title:       { type: String, required: true, trim: true },
    fabric:      { type: String, required: true },
    quantity:    { type: String, required: true, trim: true },
    colours:     { type: [String], default: [] },
    price:       { type: Number, required: true, min: 0 }, // 0 = free
    city:        { type: String, required: true },
    area:        { type: String, required: true, trim: true },
    phone:       { type: String, required: true, trim: true },
    pickupOnly:  { type: Boolean, default: false },
    description: { type: String, default: '' },
    images:      { type: [String], default: [] },          // first one is the cover
    status:      { type: String, enum: ['available', 'reserved', 'sold'], default: 'available', index: true },
    views:       { type: Number, default: 0 },
    enquiries:   { type: Number, default: 0 },
    reports:     { type: Number, default: 0 },
    hidden:      { type: Boolean, default: false },         // taken down (e.g. after reports)
  },
  { timestamps: true }
);

refabListingSchema.index({ hidden: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RefabListing', refabListingSchema, 'fashiontally_refab_listings');
