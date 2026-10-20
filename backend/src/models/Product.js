const mongoose = require('mongoose');

// ─── Manually curated deal system (MVP) — canonical constants ─────────────
// The MVP category taxonomy is EXACTLY these 8 values. The auto-discovery
// pipeline's legacy categories (pokemon_tcg, gaming, etc.) remain untouched
// in existing documents; only NEW manually curated deals must use these values.
const MVP_CATEGORIES = Object.freeze(['drops', 'food', 'home', 'auto', 'pet', 'toys', 'collectibles', 'electronics']);

// Product record source. 'auto' = legacy discovery/monitoring pipeline
// (currently dormant), 'manual' = admin-submitted curated deal.
const PRODUCT_SOURCE_TYPES = Object.freeze({ AUTO: 'auto', MANUAL: 'manual' });

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
  },

  // ─── Manually curated deals (MVP) ─────────────────────────────────
  // Whether this record was created by the admin-curated deal flow.
  sourceType: {
    type: String,
    enum: Object.values(PRODUCT_SOURCE_TYPES),
    default: PRODUCT_SOURCE_TYPES.AUTO,
    index: true
  },
  // Shortcut flag for admin-curated deals (sourceType === 'manual').
  isAdminCurated: {
    type: Boolean,
    default: false,
    index: true
  },
  // Optional promo code rendered on the deal card as the "COPY CODE" action.
  promoCode: {
    type: String,
    trim: true
  },
  // Publish/completion timestamp. The curated feed is ordered newest-first
  // by postedAt; legacy documents without postedAt sort below curated deals.
  postedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Retirement marker for the 20-active-deals-per-category cap. A curated
  // deal is retired (archived) when archivedAt is set — it is never deleted.
  archivedAt: {
    type: Date,
    index: true
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

// Manual deal feed queries: active curated deals in a category, newest first.
productSchema.index({ sourceType: 1, isAdminCurated: 1, category: 1, archivedAt: 1, postedAt: -1 });

const ProductModel = mongoose.model('Product', productSchema);

// Keep the default export as the model (existing consumers) while exposing
// the canonical constants on it for service-layer reuse.
ProductModel.MVP_CATEGORIES = MVP_CATEGORIES;
ProductModel.PRODUCT_SOURCE_TYPES = PRODUCT_SOURCE_TYPES;

module.exports = ProductModel;