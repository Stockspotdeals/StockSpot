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
    index: true,
    sparse: true
  },
  // Optional display title
  title: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    default: null,
    min: 0
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
    min: 0,
    index: true
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
  },

  // ── Campaign B: Product Intelligence Fields ──
  classification: {
    type: String,
    default: null
  },
  classificationConfidence: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  isCollectible: {
    type: Boolean,
    default: false
  },
  collectibleConfidence: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  estimatedMSRP: {
    type: Number,
    default: null
  },
  msrpConfidence: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  releaseWindow: {
    type: String,
    default: null
  },
  releaseMonth: {
    type: Number,
    default: null
  },
  releaseQuarter: {
    type: Number,
    default: null
  },
  releaseYear: {
    type: Number,
    default: null
  },
  preorderStatus: {
    type: Boolean,
    default: false
  },
  launchStatus: {
    type: Boolean,
    default: false
  },
  alreadyReleased: {
    type: Boolean,
    default: false
  },
  demandScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  scarcityScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  flipScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  confidenceScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true,
  collection: 'products'
});

// Indexes for performance
productSchema.index({ stock: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ retailer: 1, inStock: 1 });
productSchema.index({ productId: 1 });
productSchema.index({ retailer: 1 });
productSchema.index({ category: 1 });
productSchema.index({ updatedAt: -1 });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);