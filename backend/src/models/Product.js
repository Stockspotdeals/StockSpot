const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  // Link back to TrackedProduct (source of truth)
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrackedProduct',
    unique: true,
    sparse: true
  },
  // Optional display title
  title: {
    type: String,
    trim: true
  },
  // price is optional so that valid product metadata (ASIN, title, URL, images,
  // availability) can still be stored when Amazon returns no usable price.
  // Such products are explicitly marked via priceStatus (e.g. 'missing').
  price: {
    type: Number,
    min: 0
  },
  // Price state classification (Phase 12.6.6):
  //   available   - a valid current numeric price exists
  //   unavailable - item exists but is out of stock / unavailable
  //   missing     - item exists but Amazon returned no usable price
  //   error       - API request failed or returned an item-level error
  priceStatus: {
    type: String,
    enum: ['available', 'unavailable', 'missing', 'error'],
    default: 'missing'
  },
  originalPrice: {
    type: Number,
    min: 0
  },
  stock: {
    type: Number,
    default: 0,
    min: 0
  },
  url: {
    type: String,
    trim: true
  },
  affiliateLink: {
    type: String,
    trim: true
  },
  image: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    trim: true
  },
  retailer: {
    type: String,
    trim: true
  },
  inStock: {
    type: Boolean,
    default: false
  },
  // Numeric stock and lastStock used by signalEngine
  stock: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    min: 0,
    max: 100
  },
  confidence: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  // Signal engine tracking fields
  lastStock: {
    type: Number,
    default: 0
  },
  previousPrice: {
    type: Number
  },
  detectedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'products'
});

// Indexes for performance
productSchema.index({ stock: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ retailer: 1, inStock: 1 });
productSchema.index({ retailer: 1 });
productSchema.index({ category: 1 });
productSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Product', productSchema);