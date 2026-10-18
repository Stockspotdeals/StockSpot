/**
 * ManualDealService
 *
 * Data-model foundation for the StockSpot MVP's manually curated deal feed.
 * This is the reusable service layer that the future admin "publish deal"
 * endpoint and feed queries will call. It is intentionally NOT wired to any
 * admin route or UI yet.
 *
 * Rules implemented here:
 *   - Category is validated against the exact 8 MVP categories
 *     (drops, food, home, auto, pet, toys, collectibles, electronics).
 *   - Active curated deals are ordered newest-first by postedAt.
 *   - Max 20 active curated deals per category. Publishing the 21st retires
 *     (archives, never deletes) the oldest active curated deal in that
 *     category via Product.archivedAt. Only curated deals are counted;
 *     legacy auto-discovery products are never touched.
 *
 * No files are deleted and no database-wide migration is required: the new
 * Product/FeaturedProduct fields are additive, and `{ archivedAt: null }`
 * matches both missing and null (i.e. "not archived").
 */

const Product = require('../models/Product');

// Canonical MVP constants. The Product model is the intended source of truth;
// fall back to the identical canonical definitions when the model version in
// use does not export them (regression fix for the Phase 12.6.8 publish error
// "Cannot read properties of undefined (reading 'includes')", caused by
// destructuring the constants off a model that lacked them). Categories and
// source-type values are unchanged.
const MVP_CATEGORIES = (
  Array.isArray(Product.MVP_CATEGORIES) && Product.MVP_CATEGORIES.length > 0
)
  ? Product.MVP_CATEGORIES
  : Object.freeze(['drops', 'food', 'home', 'auto', 'pet', 'toys', 'collectibles', 'electronics']);

const PRODUCT_SOURCE_TYPES = (
  Product.PRODUCT_SOURCE_TYPES && Product.PRODUCT_SOURCE_TYPES.MANUAL
)
  ? Product.PRODUCT_SOURCE_TYPES
  : Object.freeze({ AUTO: 'auto', MANUAL: 'manual' });

const MAX_ACTIVE_MANUAL_DEALS_PER_CATEGORY = 20;

/** Throws unless `category` is one of the 8 MVP categories. */
function assertValidCategory(category) {
  if (!MVP_CATEGORIES.includes(category)) {
    throw new Error(
      `Invalid MVP category "${category}". Must be one of: ${MVP_CATEGORIES.join(', ')}`
    );
  }
}

/** Builds the "active curated deals" filter. `category` is optional. */
function activeManualDealFilter(category) {
  const filter = {
    sourceType: PRODUCT_SOURCE_TYPES.MANUAL,
    isAdminCurated: true,
    archivedAt: null
  };
  if (category) {
    const normalizedCategory = typeof category === 'string' ? category.trim().toLowerCase() : category;
    assertValidCategory(normalizedCategory);
    filter.category = normalizedCategory;
  }
  return filter;
}

/**
 * Active curated deals, newest-first by postedAt (createdAt as tiebreak for
 * records that share a timestamp). Pass `category` to scope to one MVP
 * category, or omit it to query across all categories.
 */
async function getActiveManualDeals({ category, limit = 50, skip = 0 } = {}) {
  const filter = activeManualDealFilter(category);
  return Product.find(filter)
    .sort({ postedAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

/** Count of active curated deals, scoped to a category when provided. */
async function countActiveManualDeals(category) {
  const filter = activeManualDealFilter(category);
  return Product.countDocuments(filter);
}

/**
 * Enforces MAX_ACTIVE_MANUAL_DEALS_PER_CATEGORY for a category by retiring
 * (archiving) the oldest active curated deals beyond the cap. Only curated
 * deals in that category are considered — unrelated products are untouched
 * and documents are never deleted.
 *
 * @returns {Promise<{archivedCount: number, archivedIds: string[], maxActive: number}>}
 */
async function retireExcessManualDeals(category, maxActive = MAX_ACTIVE_MANUAL_DEALS_PER_CATEGORY) {
  const normalizedCategory = typeof category === 'string' ? category.trim().toLowerCase() : category;
  assertValidCategory(normalizedCategory);

  const filter = {
    sourceType: PRODUCT_SOURCE_TYPES.MANUAL,
    isAdminCurated: true,
    category: normalizedCategory,
    archivedAt: null
  };

  // Oldest first — the head of this list is what rolls out of the active feed.
  const activeOldestFirst = await Product.find(filter)
    .sort({ postedAt: 1, createdAt: 1 })
    .select('_id name postedAt')
    .lean();

  const excess = activeOldestFirst.slice(0, Math.max(0, activeOldestFirst.length - maxActive));
  if (excess.length === 0) {
    return { archivedCount: 0, archivedIds: [], maxActive };
  }

  const ids = excess.map((doc) => doc._id);
  const retiredAt = new Date();
  const result = await Product.updateMany(
    { _id: { $in: ids } },
    { $set: { archivedAt: retiredAt } }
  );

  return {
    archivedCount: result.modifiedCount || result.n || 0,
    archivedIds: excess.map((doc) => String(doc._id)),
    maxActive,
    retiredAt: retiredAt.toISOString()
  };
}

/**
 * Persists a manually curated deal as the source-of-truth record in the
 * Product collection and enforces the per-category cap. Intended to be called
 * by the future admin publish endpoint.
 *
 * `discountPercent` is stored into the existing Product `discount` field
 * (the schema's canonical percent-off value) — no duplicate field is added.
 *
 * @returns {Promise<{deal: object, retired: object}>}
 */
async function publishManualDeal({
  name,
  title,
  price,
  originalPrice,
  discountPercent,
  image,
  retailer,
  affiliateLink,
  url,
  dealUrl,
  category,
  promoCode
}) {
  const normalizedCategory = typeof category === 'string' ? category.trim().toLowerCase() : category;
  assertValidCategory(normalizedCategory);

  const resolvedUrl = (dealUrl || url || '').trim();
  if (!resolvedUrl) {
    throw new Error('dealUrl (or url) is required to publish a manual deal');
  }

  const resolvedName = (name || title || resolvedUrl).trim();
  if (!resolvedName) {
    throw new Error('name or dealUrl is required to publish a manual deal');
  }

  const deal = await Product.create({
    name: resolvedName,
    title: (title || resolvedName).trim(),
    // Preserve existing display/source fields, passing through only what the
    // caller supplies so legacy-shaped documents are not forced into shape.
    price: price !== undefined ? price : undefined,
    originalPrice: originalPrice !== undefined ? originalPrice : undefined,
    discount: discountPercent !== undefined ? discountPercent : undefined,
    image,
    retailer: retailer || '',
    affiliateLink: affiliateLink || resolvedUrl,
    url: resolvedUrl,
    category: normalizedCategory,
    promoCode: (typeof promoCode === 'string' && promoCode.trim().length > 0) ? promoCode.trim() : undefined,
    inStock: true,
    sourceType: PRODUCT_SOURCE_TYPES.MANUAL,
    isAdminCurated: true,
    postedAt: new Date()
  });

  const retired = await retireExcessManualDeals(normalizedCategory);
  return { deal, retired };
}

module.exports = {
  MVP_CATEGORIES,
  PRODUCT_SOURCE_TYPES,
  MAX_ACTIVE_MANUAL_DEALS_PER_CATEGORY,
  assertValidCategory,
  getActiveManualDeals,
  countActiveManualDeals,
  retireExcessManualDeals,
  publishManualDeal
};