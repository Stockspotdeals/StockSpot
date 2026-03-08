const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
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

module.exports = mongoose.model('Product', productSchema);