/**
 * Phase 12.6.7 — PRODUCTION DIAGNOSTIC (STRICTLY READ-ONLY)
 *
 * Inspects the PRODUCTION MongoDB used by StockSpot when executed inside
 * Render's shell. This script performs ZERO writes:
 *   - No insert / update / replace / delete / upsert / index creation.
 *   - No Amazon API calls. No server startup.
 *   - Uses only the project's existing mongoose + model definitions.
 *
 * Run inside Render Shell (repo root):
 *   node scripts/phase-12-6-7-production-diagnostic.js
 *
 * The script uses the production `process.env.MONGO_URI` provided by Render.
 * It never prints the connection string, credentials, tokens, or secrets.
 */
'use strict';

const path = require('path');

// True when executed directly (`node scripts/phase-12-6-7-production-diagnostic.js`).
// When false, this module was imported by the temporary diagnostic HTTP route
// running inside the deployed web service.
const IS_MAIN = require.main === module;

const repoRoot = path.resolve(__dirname, '..');
const backendRoot = path.resolve(repoRoot, 'backend');
const backendSrc = path.resolve(backendRoot, 'src');

// ---------------------------------------------------------------------------
// Resolve a SINGLE mongoose instance — the exact one the backend models use.
// (backend/node_modules has mongoose 8; root has 9. Mixing instances would
//  register models on an unconnected mongoose.)
// ---------------------------------------------------------------------------
let mongoose;
try {
  mongoose = require(require.resolve('mongoose', { paths: [backendRoot] }));
} catch (_innerResolve) {
  // Fallback for unusual install layouts.
  mongoose = require('mongoose');
}

// Read-only guarantee: never let model compile-time trigger index creation.
// Only mutated for the standalone process. When imported by the running server
// the models are already compiled (cached), so this global must not be changed.
if (IS_MAIN) {
  mongoose.set('autoIndex', false);
}

// ---------------------------------------------------------------------------
// Report capture (TEMPORARY — used by the diagnostic HTTP route only).
//
// When this module is imported (not run directly), console.log is wrapped so
// the diagnostic's full report can be returned as JSON by the route. Capture is
// only active between resetDiagnosticReport() and stopDiagnosticReport();
// outside that window the wrapper is a transparent pass-through so normal
// server logging is unaffected. Direct execution leaves console.log untouched,
// so standalone output is byte-for-byte identical to before.
// ---------------------------------------------------------------------------
const __reportLines = [];
let __captureActive = false;

function resetDiagnosticReport() {
  __reportLines.length = 0;
  __captureActive = true;
}

function stopDiagnosticReport() {
  __captureActive = false;
}

function getDiagnosticReport() {
  return __reportLines.join('\n');
}

if (!IS_MAIN) {
  const __realConsoleLog = console.log;
  console.log = (...args) => {
    __realConsoleLog.apply(console, args);
    if (__captureActive) __reportLines.push(args.map(String).join(' '));
  };
}

// Existing model definitions (read-only usage only).
const Product = require(path.resolve(backendSrc, 'models/Product'));
const { TrackedProduct } = require(path.resolve(backendSrc, 'models/TrackedProduct'));
const FeaturedProduct = require(path.resolve(backendSrc, 'models/FeaturedProduct'));

// ---- Small read-only helpers ---------------------------------------------

function hasField(doc, key) {
  return !!doc && Object.prototype.hasOwnProperty.call(doc, key);
}

function safeString(value) {
  if (value === undefined) return '<missing>';
  if (value === null) return 'null';
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    if (value.toString && value.toString() !== '[object Object]') return value.toString();
  }
  return String(value);
}

/**
 * Return ONLY a sanitized error message. Never the URI / secrets.
 */
function sanitizeError(err) {
  let s = String((err && err.message) || err || 'unknown error');
  s = s.replace(/(mongodb(\+srv)?:\/\/)[^\s"'`]+/gi, '$1<REDACTED>');
  s = s.replace(/(\/\/)[^@\s/]+@/g, '$1<REDACTED>@');
  s = s.replace(/((?:api[_-]?key|password|token|secret)\s*[:=]\s*)\S+/gi, '$1<REDACTED>');
  s = s.replace(/(^|[\s,'"`])([^\/\s:]{1,80}):([^@\s]{1,80})@/g, '$1<REDACTED>@');
  return s;
}

/**
 * Extract ASINs from a raw document's trusted fields.
 * The Product schema has NO `asin` field; the canonical ASIN is embedded in
 * the `url` (e.g. https://www.amazon.com/dp/B0GF4MXFPC). We also honour any
 * raw stored `asin`/`ASIN` field that may exist in the actual document.
 */
function extractAsinsFromText(text) {
  const found = new Set();
  if (typeof text !== 'string' || !text.trim()) return found;
  const lower = text.toLowerCase();
  if (!/amazon\./.test(lower) && !/^[a-z0-9]{10}$/i.test(text.trim())) return found;
  const m1 = text.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[\/?#&]|$)/i);
  if (m1) found.add(m1[1].toUpperCase());
  const m2 = text.match(/[?&]asin=([A-Z0-9]{10})(?:[&]|$)/i);
  if (m2) found.add(m2[1].toUpperCase());
  const bare = text.trim();
  if (/^[A-Z0-9]{10}$/i.test(bare)) found.add(bare.toUpperCase());
  return found;
}

function extractAsins(doc) {
  const found = new Set();
  if (!doc || typeof doc !== 'object') return found;
  for (const key of ['asin', 'ASIN', 'asinId']) {
    const v = doc[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (/^[A-Z0-9]{10}$/i.test(t)) found.add(t.toUpperCase());
    }
  }
  for (const key of ['url', 'affiliateLink', 'originalUrl', 'asinUrl', 'asin_url', 'productUrl']) {
    const v = doc[key];
    if (typeof v === 'string') {
      for (const a of extractAsinsFromText(v)) found.add(a);
    }
  }
  return found;
}

function matchesAsin(doc, asin) {
  if (!doc) return false;
  if (extractAsins(doc).has(asin)) return true;
  for (const key of ['url', 'affiliateLink', 'originalUrl']) {
    if (typeof doc[key] === 'string' && doc[key].toUpperCase().includes(asin)) return true;
  }
  return false;
}

function isAmazonDoc(doc) {
  if (!doc || typeof doc !== 'object') return false;
  const retailer = String(doc.retailer || '').trim().toLowerCase();
  if (retailer === 'amazon' || retailer === 'amazon.com') return true;
  const textBits = [doc.url, doc.affiliateLink, doc.originalUrl].filter(v => typeof v === 'string');
  for (const bit of textBits) {
    if (/^https?:\/\/[^/]*amazon\./i.test(bit)) return true;
  }
  return false;
}
// Environment: Render-provided vars take precedence; local backend/.env is a
// fallback so the script can run against a local DB when desired. Never throws
// when NO .env exists and never prints the URI.
const { initEnvironment } = require(path.resolve(backendSrc, 'utils/envInit'));
initEnvironment({ requireMongoUri: false, logMongoStatus: false });

const SEED_ASINS = [
  'B0829FT44S',
  'B01CYZHGC8',
  'B09ZPYQT55',
  'B0GF4MXFPC',
  'B09YS3LL3N'
];

const CANONICAL_URL_PREFIX = 'https://www.amazon.com/dp/';

/**
 * Price classification based on the RAW stored value (lean, uncensored by
 * mongoose casting) using the project's isValidProductPrice contract:
 *   valid   = typeof number && isFinite && > 0
 *   null    = field present with value null
 *   missing = field absent from document
 *   zero    = numeric 0
 *   invalid = anything else (NaN, Infinity, strings, negative, ...)
 */
function priceBucket(doc) {
  if (!hasField(doc, 'price')) return 'missing';
  const p = doc.price;
  if (typeof p === 'number' && Number.isFinite(p) && p > 0) return 'valid';
  if (p === null) return 'null';
  if (typeof p === 'number' && p === 0) return 'zero';
  return 'invalid';
}

function stockBucket(doc) {
  if (!hasField(doc, 'inStock') || doc.inStock === null) return 'null/missing';
  return doc.inStock === true ? 'true' : 'false';
}

function countByBucket(docs, bucketFn) {
  const counts = {};
  for (const d of docs) {
    const b = bucketFn(d);
    counts[b] = (counts[b] || 0) + 1;
  }
  return counts;
}

function prettyCounts(counts, order) {
  const lines = [];
  for (const k of order) lines.push(`${k}: ${counts[k] || 0}`);
  return lines.join('\n');
}

function objectIdEquals(a, b) {
  try { return String(a) === String(b); } catch (_) { return false; }
}

function sortNewestFirst(docs) {
  const arr = [...docs];
  arr.sort((x, y) => {
    let xts = 0;
    let yts = 0;
    try {
      xts = new Date(x.updatedAt || x.createdAt || (x._id ? x._id.getTimestamp() : null)).getTime() || 0;
      yts = new Date(y.updatedAt || y.createdAt || (y._id ? y._id.getTimestamp() : null)).getTime() || 0;
    } catch (_) { xts = 0; yts = 0; }
    if (xts !== yts) return xts > yts ? -1 : 1;
    return String(y._id || '').localeCompare(String(x._id || ''));
  });
  return arr;
}

const PRICE_ORDER = ['valid', 'null', 'missing', 'zero', 'invalid'];
const IN_STOCK_ORDER = ['true', 'false', 'null/missing'];

// ===========================================================================
// MAIN (all 17 parts)
// ===========================================================================

async function runDiagnostic(options = {}) {
  // closeConnection: standalone runs always close their own mongoose
  // connection. When invoked from the temporary HTTP route inside the deployed
  // server, the mongoose connection is the server's SHARED connection and must
  // be left open (default true = standalone behavior, unchanged).
  const closeConnection = options.closeConnection !== false;

  // ---------- PART 1 — CONNECTION ----------
  console.log('\n==============================');
  console.log('PART 1 — CONNECTION');
  if (!process.env.MONGO_URI) {
    console.log('MONGO_URI is not configured');
    if (IS_MAIN) process.exit(1);
    return { ok: false, error: 'MONGO_URI is not configured' };
  }

  // Reuse an already-open mongoose connection (e.g. the deployed server's own
  // connection). Only connect here when nothing is connected yet.
  let alreadyConnected = false;
  try {
    const rs = mongoose.connection && typeof mongoose.connection.readyState === 'number'
      ? mongoose.connection.readyState : 0;
    alreadyConnected = rs === 1 || rs === 2;
  } catch (_) {
    alreadyConnected = false;
  }

  if (!alreadyConnected) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 20000,
        connectTimeoutMS: 20000
      });
    } catch (err) {
      console.log('MONGODB CONNECTION FAILED: ' + sanitizeError(err));
      if (IS_MAIN) process.exit(1);
      return { ok: false, error: sanitizeError(err) };
    }
  }

  console.log('PRODUCTION MONGODB CONNECTION: SUCCESS');
  try {
    const conn = mongoose.connection;
    let dbName = null;
    if (conn) {
      if (typeof conn.name === 'string' && conn.name) dbName = conn.name;
      else if (conn.db && typeof conn.db.getName === 'function') dbName = conn.db.getName();
      else if (conn.db && conn.db.name) dbName = conn.db.name;
    }
    console.log('DATABASE NAME: ' + (dbName || '<unavailable>'));
  } catch (_) {
    console.log('DATABASE NAME: <unavailable>');
  }

  // ---------- PART 2 — COLLECTION INVENTORY ----------
  console.log('\n==============================');
  console.log('PART 2 — COLLECTION INVENTORY');
  let totalProductDocs = 0;
  let totalTrackedDocs = 0;
  let totalFeaturedDocs = 0;
  try {
    totalProductDocs = await Product.countDocuments({});
    totalTrackedDocs = await TrackedProduct.countDocuments({});
    totalFeaturedDocs = await FeaturedProduct.countDocuments({});
  } catch (err) {
    console.log('QUERY FAILURE (countDocuments inventory): ' + sanitizeError(err));
  }
  const productColName = Product.collection.name;
  const trackedColName = TrackedProduct.collection.name;
  const featuredColName = FeaturedProduct.collection.name;

  // Single read-only snapshot of ALL Product documents (raw, lean).
  // Declared before the inventory print below so `AMAZON:` uses the same
  // retailer classification as Part 3.
  const allProducts = await Product.find({}).sort({ updatedAt: -1, _id: -1 }).lean();
  const amazonProducts = allProducts.filter(d => isAmazonDoc(d));

  console.log(`PRODUCT COLLECTION: ${productColName}`);
  console.log(`TOTAL: ${totalProductDocs}`);
  console.log(`AMAZON: ${amazonProducts.length}`);
  console.log(`TRACKED PRODUCT COLLECTION: ${trackedColName}`);
  console.log(`TOTAL: ${totalTrackedDocs}`);
  console.log(`FEATURED PRODUCT COLLECTION: ${featuredColName}`);
  console.log(`TOTAL: ${totalFeaturedDocs}`);

  const seedProductMap = new Map(); // asin -> docs
  for (const asin of SEED_ASINS) {
    seedProductMap.set(asin, allProducts.filter(d => matchesAsin(d, asin)));
  }

  // ---------- PART 3 — ALL AMAZON PRODUCT COUNTS ----------
  console.log('\n==============================');
  console.log('PART 3 — ALL AMAZON PRODUCT COUNTS');
  const retailerDist = countByBucket(allProducts, d => hasField(d, 'retailer') ? String(d.retailer) : '<missing>');
  console.log('RETAILER FIELD DISTRIBUTION (raw stored values):');
  for (const [k, v] of Object.entries(retailerDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('NOTE: Product schema field used for retailer = "retailer".');
  console.log(`TOTAL AMAZON PRODUCTS: ${amazonProducts.length}`);
  const rawAsinDocs = allProducts.filter(d => hasField(d, 'asin') || hasField(d, 'ASIN'));
  console.log(`CANONICAL ASIN FIELD: none defined in Product schema — ASIN is embedded in "url" as /dp/<ASIN>; raw "asin" field present in ${rawAsinDocs.length} document(s)`);

  const asinGroup = new Map();
  let otherAmazonDocs = 0;
  const otherAsinValues = new Set();
  for (const doc of amazonProducts) {
    const asins = extractAsins(doc);
    let matchedSeed = false;
    for (const a of asins) {
      if (!asinGroup.has(a)) asinGroup.set(a, []);
      asinGroup.get(a).push(doc);
      if (SEED_ASINS.includes(a)) matchedSeed = true;
    }
    if (asins.size === 0) {
      // Still count against seed ASINs via URL substring fallback.
      let subMatched = false;
      for (const asin of SEED_ASINS) {
        if (matchesAsin(doc, asin)) {
          if (!asinGroup.has(asin)) asinGroup.set(asin, []);
          asinGroup.get(asin).push(doc);
          subMatched = true;
        }
      }
      matchedSeed = subMatched;
    }
    if (!matchedSeed) {
      otherAmazonDocs++;
      for (const a of asins) otherAsinValues.add(a);
    }
  }
  console.log('ASIN | COUNT  (Amazon products only)');
  for (const asin of SEED_ASINS) {
    const docs = asinGroup.get(asin) || [];
    const distinct = new Set(docs.map(d => d._id && String(d._id))).size;
    console.log(`${asin} | ${docs.length} (distinct _id: ${distinct})`);
  }
  console.log(`OTHER AMAZON ASINS: ${otherAmazonDocs}`);
  if (otherAsinValues.size > 0) {
    console.log(`OTHER DISTINCT ASIN VALUES: ${[...otherAsinValues].sort().join(', ')}`);
  } else {
    console.log('OTHER DISTINCT ASIN VALUES: (none)');
  }

  // ---------- PART 4 — DETAILED PRODUCT RECORDS ----------
  console.log('\n==============================');
  console.log('PART 4 — DETAILED PRODUCT RECORDS');
  console.log('Printed fields: _id productId asin title name retailer price priceStatus inStock category isCollectible msrp flipScore url createdAt updatedAt');
  console.log('Missing fields print as <missing>. Only the fields above are shown — full documents are NOT dumped.');

  function printDetailedRecords(asin, docs) {
    console.log('\n---');
    console.log(`PRODUCT RECORDS: ${asin}`);
    console.log(`COUNT: ${docs.length}`);
    console.log('--------');
    let i = 1;
    for (const d of sortNewestFirst(docs)) {
      const asinValue = (typeof d.asin === 'string' && d.asin) ? d.asin : (matchesAsin(d, asin) ? asin : undefined);
      console.log(`Record ${i}`);
      console.log(`_id: ${safeString(d._id)}`);
      console.log(`productId: ${safeString(d.productId)}`);
      console.log(`asin: ${safeString(asinValue)}`);
      console.log(`title: ${safeString(d.title)}`);
      console.log(`name: ${safeString(d.name)}`);
      console.log(`retailer: ${safeString(d.retailer)}`);
      console.log(`price: ${safeString(d.price)}`);
      console.log(`priceStatus: ${safeString(d.priceStatus)}`);
      console.log(`inStock: ${safeString(d.inStock)}`);
      console.log(`category: ${safeString(d.category)}`);
      console.log(`isCollectible: ${safeString(d.isCollectible)}`);
      console.log(`msrp: ${safeString(hasField(d, 'msrp') ? d.msrp : (hasField(d, 'estimatedMSRP') ? d.estimatedMSRP : undefined))}`);
      console.log(`flipScore: ${safeString(d.flipScore)}`);
      console.log(`url: ${safeString(d.url)}`);
      console.log(`createdAt: ${safeString(d.createdAt)}`);
      console.log(`updatedAt: ${safeString(d.updatedAt)}`);
      i++;
    }
  }

  for (const asin of SEED_ASINS) {
    printDetailedRecords(asin, seedProductMap.get(asin) || []);
  }

  // ---------- PART 5 — PRICE SUMMARY ----------
  console.log('\n==============================');
  console.log('PART 5 — PRICE SUMMARY');
  const seedProducts = SEED_ASINS.flatMap(a => seedProductMap.get(a) || []);
  const uniqueSeedProducts = [];
  const seenIds = new Set();
  for (const d of seedProducts) {
    const k = String(d._id || JSON.stringify(d));
    if (!seenIds.has(k)) { seenIds.add(k); uniqueSeedProducts.push(d); }
  }
  const allPriceBuckets = countByBucket(allProducts, priceBucket);
  const amazonPriceBuckets = countByBucket(amazonProducts, priceBucket);
  const seedPriceBuckets = countByBucket(uniqueSeedProducts, priceBucket);
  console.log('All Products:');
  console.log(prettyCounts(allPriceBuckets, PRICE_ORDER));
  console.log('\nAmazon Products:');
  console.log(prettyCounts(amazonPriceBuckets, PRICE_ORDER));
  console.log('\nSeed ASIN Products:');
  console.log(prettyCounts(seedPriceBuckets, PRICE_ORDER));

  // ---------- PART 6 — IN-STOCK SUMMARY ----------
  console.log('\n==============================');
  console.log('PART 6 — IN-STOCK SUMMARY');
  const allStockBuckets = countByBucket(allProducts, stockBucket);
  const amazonStockBuckets = countByBucket(amazonProducts, stockBucket);
  const seedStockBuckets = countByBucket(uniqueSeedProducts, stockBucket);
  console.log('All Products (IN STOCK):');
  console.log(prettyCounts(allStockBuckets, IN_STOCK_ORDER));
  console.log('\nAmazon Products (IN STOCK):');
  console.log(prettyCounts(amazonStockBuckets, IN_STOCK_ORDER));
  console.log('\nSeed ASIN Products (IN STOCK):');
  console.log(prettyCounts(seedStockBuckets, IN_STOCK_ORDER));
  let istTrueCount = 0;
  try {
    const istTrueDocs = await Product.find({ inStock: true }).lean();
    istTrueCount = istTrueDocs.length;
  } catch (err) {
    console.log('QUERY FAILURE (Product.find({inStock:true})): ' + sanitizeError(err));
  }
  console.log('\nProduct.find({ inStock: true }) COUNT: ' + istTrueCount);

  // ---------- PART 7 — TRACKEDPRODUCT INSPECTION ----------
  console.log('\n==============================');
  console.log('PART 7 — TRACKEDPRODUCT INSPECTION');
  console.log('Schema identifier fields: url (unique). No "asin" field in schema; raw "asin"/"asinUrl"/"asin_url" fields are also searched if present.');
  console.log('Search strategy per ASIN: url regex-contains ASIN, exactly /dp/ASIN, plus raw asin / asinUrl / asin_url / productId equality.');

  const trackedByAsin = new Map();
  for (const asin of SEED_ASINS) {
    console.log(`\n---`);
    console.log(`## TRACKED PRODUCT: ${asin}`);
    let trackedDocs = [];
    try {
      trackedDocs = await TrackedProduct.find({
        $or: [
          { url: { $regex: asin, $options: 'i' } },
          { asin },
          { asinUrl: asin },
          { asin_url: asin },
          { productId: asin }
        ]
      }).sort({ updatedAt: -1 }).lean();
    } catch (err) {
      console.log('QUERY FAILURE (TrackedProduct find): ' + sanitizeError(err));
    }
    trackedByAsin.set(asin, trackedDocs);
    console.log(`COUNT: ${trackedDocs.length}`);
    let j = 1;
    for (const t of trackedDocs) {
      const tAsin = (typeof t.asin === 'string' && t.asin)
        ? t.asin
        : (Array.from(extractAsins(t))[0] || '<missing>');
      const tInStock = hasField(t, 'inStock') ? t.inStock : t.isAvailable;
      console.log(`Record ${j}`);
      console.log(`_id: ${safeString(t._id)}`);
      console.log(`asin/product identifier: ${safeString(tAsin)}`);
      console.log(`retailer: ${safeString(t.retailer)}`);
      console.log(`url: ${safeString(t.url)}`);
      console.log(`price: ${safeString(t.price)}`);
      console.log(`inStock: ${safeString(tInStock)}  (schema field is isAvailable; stored isAvailable=${safeString(t.isAvailable)})`);
      console.log(`createdAt: ${safeString(t.createdAt)}`);
      console.log(`updatedAt: ${safeString(t.updatedAt)}`);
      j++;
    }
  }

  // ---------- PART 8 — SIMULATE _toTrackedProductShape LOOKUP ----------
  console.log('\n==============================');
  console.log('PART 8 — SIMULATE _toTrackedProductShape LOOKUP');
  console.log('Implementation read from backend/src/services/MonitoringWorker.js lines 294-351:');
  console.log('  url     = product.url || ("https://www.amazon.com/dp/" + product.asin)');
  console.log('  asinUrl = "https://www.amazon.com/dp/" + product.asin');
  console.log('  existing = TrackedProduct.findOne({ retailer: "amazon",');
  console.log('                                 $or: [{ url }, { url: asinUrl }] }).lean();');
  console.log('Reproduced below with READ-ONLY queries. product.url = the ACTUAL url currently stored on a matching Product doc.');

  const reuseByAsin = new Map();
  for (const asin of SEED_ASINS) {
    const matchingProducts = seedProductMap.get(asin) || [];
    const storedUrls = [...new Set(matchingProducts.map(d => d.url).filter(u => typeof u === 'string' && u))];
    const candidateUrls = [...storedUrls, CANONICAL_URL_PREFIX + asin];
    const asinUrl = CANONICAL_URL_PREFIX + asin;
    const found = [];
    for (const candidate of [...new Set(candidateUrls)]) {
      let hit = null;
      try {
        hit = await TrackedProduct.findOne({
          retailer: 'amazon',
          $or: [{ url: candidate }, { url: asinUrl }]
        }).lean();
      } catch (err) {
        console.log('QUERY FAILURE (_toTrackedProductShape simulation): ' + sanitizeError(err));
      }
      if (hit) found.push(hit);
    }
    const deduped = [];
    const seenTracked = new Set();
    for (const h of found) {
      if (!seenTracked.has(String(h._id))) { seenTracked.add(String(h._id)); deduped.push(h); }
    }
    reuseByAsin.set(asin, deduped.map(h => ({ id: String(h._id), url: h.url })));
    if (deduped.length > 0) {
      const h = deduped[0];
      console.log(`${asin} | Lookup Finds Existing TrackedProduct? YES | Matching _id: ${h._id} | Matching URL: ${h.url}`);
    } else {
      console.log(`${asin} | Lookup Finds Existing TrackedProduct? NO | Matching _id: <none> | Matching URL: <none>`);
    }
    console.log(`NEXT MONITORING RUN WOULD REUSE EXISTING ID: ${deduped.length > 0 ? 'YES' : 'NO'}`);
  }

  // ---------- PART 9 — PRODUCT IDENTITY RECONCILIATION ----------
  console.log('\n==============================');
  console.log('PART 9 — PRODUCT IDENTITY RECONCILIATION');
  let anyMultipleProducts = false;
  for (const asin of SEED_ASINS) {
    const matchingProducts = seedProductMap.get(asin) || [];
    const productIds = matchingProducts.map(d => d.productId ? String(d.productId) : '<missing>');
    const productIdsSet = [...new Set(productIds)];
    const trackedIds = (trackedByAsin.get(asin) || []).map(t => String(t._id));
    const trackedIdsSet = [...new Set(trackedIds)];
    if (productIdsSet.length > 1 || matchingProducts.length > 1) anyMultipleProducts = true;
    console.log(`\nASIN: ${asin}`);
    console.log(`  Product IDs (productId field): [${productIds.join(', ')}]`);
    console.log(`  TrackedProduct IDs: [${trackedIdsSet.join(', ')}]`);
    const exactMatches = matchingProducts.filter(d =>
      d.productId && trackedIdsSet.includes(String(d.productId))
    ).length;
    console.log(`  Product.productId === TrackedProduct._id matches: ${exactMatches} of ${matchingProducts.length}`);
    console.log(`  Stable Relationship?: ${matchingProducts.length > 0 && exactMatches === matchingProducts.length ? 'YES' : 'NO'}`);
    if (matchingProducts.length > 1 || productIdsSet.length > 1) {
      console.log(`  ** MULTIPLE PRODUCT RECORDS / PRODUCT IDS FOR ASIN ${asin}: count=${matchingProducts.length} distinctProductIds=${productIdsSet.length} **`);
    }
  }
  if (anyMultipleProducts) {
    console.log('\nNOTE: At least one seed ASIN has multiple Product records or Product IDs.');
  } else {
    console.log('\nNOTE: No seed ASIN has multiple Product records or Product IDs.');
  }

  // ---------- PART 10 — FEATUREDPRODUCT CACHE ----------
  console.log('\n==============================');
  console.log('PART 10 — FEATUREDPRODUCT CACHE');
  let featuredAll = [];
  try {
    featuredAll = await FeaturedProduct.find({}).sort({ createdAt: -1 }).lean();
  } catch (err) {
    console.log('QUERY FAILURE (FeaturedProduct find): ' + sanitizeError(err));
  }
  const nowTs = Date.now();
  const featuredExpired = featuredAll.filter(f => !f.expiresAt || new Date(f.expiresAt).getTime() <= nowTs);
  const featuredActive = featuredAll.filter(f => f.expiresAt && new Date(f.expiresAt).getTime() > nowTs);
  console.log(`FEATURED TOTAL: ${featuredAll.length}`);
  console.log(`FEATURED EXPIRED: ${featuredExpired.length}`);
  console.log(`FEATURED ACTIVE: ${featuredActive.length}`);
  const maxCreated = featuredAll.reduce((m, f) => {
    const t = f.createdAt ? new Date(f.createdAt).getTime() : 0;
    return t > m.t ? { t, v: f.createdAt } : m;
  }, { t: 0, v: null }).v;
  const maxUpdated = featuredAll.reduce((m, f) => {
    const t = f.updatedAt ? new Date(f.updatedAt).getTime() : 0;
    return t > m.t ? { t, v: f.updatedAt } : m;
  }, { t: 0, v: null }).v;
  const maxExpires = featuredAll.reduce((m, f) => {
    const t = f.expiresAt ? new Date(f.expiresAt).getTime() : 0;
    return t > m.t ? { t, v: f.expiresAt } : m;
  }, { t: 0, v: null }).v;
  console.log(`MOST RECENT createdAt: ${safeString(maxCreated)}`);
  console.log(`MOST RECENT updatedAt: ${safeString(maxUpdated)}`);
  console.log(`MOST RECENT (max) expiresAt: ${safeString(maxExpires)}`);

  const allSectionValues = [...new Set(featuredAll.flatMap(f => Array.isArray(f.sections) ? f.sections : []))].sort();
  console.log(`DISTINCT SECTION VALUES IN CACHE: [${allSectionValues.join(', ')}]`);

  const referencedProductIds = [...new Set(featuredAll.map(f => f.productId ? String(f.productId) : '<none>'))];
  console.log(`REFERENCED PRODUCT ID COUNT: ${referencedProductIds.length} (first 20: ${referencedProductIds.slice(0, 20).join(', ')})`);

  console.log('\nUP TO 20 MOST RECENT FEATURED RECORDS (fields only, not full docs):');
  let fc = 1;
  for (const f of featuredAll.slice(0, 20)) {
    console.log(`Record ${fc}: _id=${safeString(f._id)} | productId=${safeString(f.productId)} | name=${safeString(f.name || f.title)} | price=${safeString(f.price)} | inStock=${safeString(f.inStock)} | sections=[${Array.isArray(f.sections) ? f.sections.join(',') : safeString(f.sections)}] | featuredScore=${safeString(f.featuredScore)} | badges=[${Array.isArray(f.badges) ? f.badges.join(',') : safeString(f.badges)}] | expiresAt=${safeString(f.expiresAt)} | createdAt=${safeString(f.createdAt)} | updatedAt=${safeString(f.updatedAt)}`);
    fc++;
  }

  const sectionDist = countByBucket(featuredAll.flatMap(f => Array.isArray(f.sections) ? f.sections : []), s => s);
  console.log('\nSECTION DISTRIBUTION:');
  const SECTION_KEYS = ['hot', 'biggest_discounts', 'trending', 'gaming', 'collectibles', 'toys', 'electronics', 'restocks', 'high_flip'];
  console.log('hot: ' + (sectionDist['hot'] || 0));
  console.log('biggest_discounts: ' + (sectionDist['biggest_discounts'] || 0));
  console.log('trending: ' + (sectionDist['trending'] || 0));
  console.log('gaming: ' + (sectionDist['gaming'] || 0));
  console.log('collectibles: ' + (sectionDist['collectibles'] || 0));
  console.log('toys: ' + (sectionDist['toys'] || 0));
  console.log('electronics: ' + (sectionDist['electronics'] || 0));
  console.log('restocks: ' + (sectionDist['restocks'] || 0));
  console.log('high_flip: ' + (sectionDist['high_flip'] || 0));
  const otherSectionKeys = allSectionValues.filter(s => !SECTION_KEYS.includes(s));
  if (otherSectionKeys.length > 0) {
    console.log('OTHER SECTION VALUES FOUND (actual): ' + otherSectionKeys.map(s => `${s}: ${sectionDist[s] || 0}`).join(', '));
  }

  // ---------- PART 11 — REPRODUCE FEATURED PRODUCT QUERY ----------
  console.log('\n==============================');
  console.log('PART 11 — REPRODUCE FEATURED PRODUCT QUERY');
  console.log('FeaturedDealsEngine.refreshFeaturedFeed() logical query:');
  console.log('  Product.find({ inStock: true }).sort({ updatedAt: -1 }).limit(500).lean()');
  let featuredSource = [];
  try {
    featuredSource = await Product.find({ inStock: true })
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
  } catch (err) {
    console.log('QUERY FAILURE (featured source query): ' + sanitizeError(err));
  }
  const fsTotal = featuredSource.length;
  const fsPrice = countByBucket(featuredSource, priceBucket);
  const fsMissingNull = (fsPrice['missing'] || 0) + (fsPrice['null'] || 0);
  const fsWithCategory = featuredSource.filter(d => hasField(d, 'category') && String(d.category || '').trim()).length;
  const fsCollectible = featuredSource.filter(d => hasField(d, 'isCollectible')).length;
  const fsCollectibleTrue = featuredSource.filter(d => hasField(d, 'isCollectible') && d.isCollectible === true).length;
  const fsFlipScore = featuredSource.filter(d => hasField(d, 'flipScore')).length;
  const fsMsrpAbovePrice = featuredSource.filter(d => {
    const msrp = hasField(d, 'msrp') ? d.msrp : d.estimatedMSRP;
    return typeof msrp === 'number' && Number.isFinite(msrp) &&
      typeof d.price === 'number' && Number.isFinite(d.price) && msrp > d.price;
  }).length;
  console.log(`FEATURED SOURCE QUERY RESULT: Product.find({inStock:true}) = ${fsTotal}`);
  console.log(`  valid price count: ${fsPrice['valid'] || 0}`);
  console.log(`  missing/null price count: ${fsMissingNull}`);
  console.log(`  products with category: ${fsWithCategory}`);
  console.log(`  products with collectible classification (field present): ${fsCollectible} (true: ${fsCollectibleTrue})`);
  console.log(`  products with flipScore: ${fsFlipScore}`);
  console.log(`  products with MSRP greater than price: ${fsMsrpAbovePrice}`);
  for (const asin of SEED_ASINS) {
    const inSource = fsTotal > 0 && featuredSource.filter(d => matchesAsin(d, asin)).length > 0;
    console.log(`SEED ASIN ${asin} included in inStock:true result: ${inSource ? 'YES' : 'NO'}`);
  }

  // ---------- PART 12 — REPRODUCE SIGNAL ENGINE PRICE VIEW ----------
  console.log('\n==============================');
  console.log('PART 12 — REPRODUCE SIGNAL ENGINE PRICE VIEW');
  console.log('signalEngine.js uses Product.find() then isValidProductPrice(price)');
  console.log('  (typeof number && Number.isFinite && > 0). Raw stored values shown below.');
  const seAllBuckets = countByBucket(allProducts, priceBucket);
  const seAmazonBuckets = countByBucket(amazonProducts, priceBucket);
  const seSeedBuckets = countByBucket(uniqueSeedProducts, priceBucket);
  console.log('SIGNAL ENGINE VIEW:');
  console.log('Total Products: ' + allProducts.length);
  console.log('Valid Price: ' + (seAllBuckets['valid'] || 0));
  console.log('Null Price: ' + (seAllBuckets['null'] || 0));
  console.log('Missing Price: ' + (seAllBuckets['missing'] || 0));
  console.log('Zero Price: ' + (seAllBuckets['zero'] || 0));
  console.log('Invalid Price: ' + (seAllBuckets['invalid'] || 0));
  console.log('Amazon:');
  console.log('Valid: ' + (seAmazonBuckets['valid'] || 0));
  console.log('Null: ' + (seAmazonBuckets['null'] || 0));
  console.log('Missing: ' + (seAmazonBuckets['missing'] || 0));
  console.log('Invalid: ' + (seAmazonBuckets['invalid'] || 0) + ` (zero: ${seAmazonBuckets['zero'] || 0})`);
  console.log('Seed ASINs:');
  console.log('Valid: ' + (seSeedBuckets['valid'] || 0));
  console.log('Null: ' + (seSeedBuckets['null'] || 0));
  console.log('Missing: ' + (seSeedBuckets['missing'] || 0));
  console.log('Invalid: ' + (seSeedBuckets['invalid'] || 0) + ` (zero: ${seSeedBuckets['zero'] || 0})`);

  // ---------- PART 13 — PRICE TRACE RECONCILIATION ----------
  console.log('\n==============================');
  console.log('PART 13 — PRICE TRACE RECONCILIATION');
  const LOG_KNOWN_PRICES = { B0829FT44S: 8.07 };
  for (const asin of SEED_ASINS) {
    const docs = sortNewestFirst(seedProductMap.get(asin) || []);
    const prices = docs.map(d => hasField(d, 'price') ? d.price : '<missing>');
    const newest = docs.length > 0 ? (hasField(docs[0], 'price') ? docs[0].price : '<missing>') : '<no products>';
    const oldest = docs.length > 0 ? (hasField(docs[docs.length - 1], 'price') ? docs[docs.length - 1].price : '<missing>') : '<no products>';
    console.log(`\nASIN: ${asin}`);
    console.log(`  Creators API observed price: NOT QUERIED BY THIS SCRIPT — no Amazon API request was made; this diagnostic is read-only against MongoDB.`);
    console.log(`  PREVIOUS LOG EVIDENCE: ${LOG_KNOWN_PRICES[asin] !== undefined ? LOG_KNOWN_PRICES[asin] : '<no prior log evidence in scope>'}`);
    console.log(`  PRODUCTION DATABASE FACT — Stored Product prices: [${prices.join(', ')}]`);
    console.log(`  PRODUCTION DATABASE FACT — Newest Product price: ${newest} (by updatedAt/createdAt/_id)`);
    console.log(`  PRODUCTION DATABASE FACT — Oldest Product price: ${oldest}`);
  }

  // ---------- PART 14 — DUPLICATE DETERMINATION ----------
  console.log('\n==============================');
  console.log('PART 14 — DUPLICATE DETERMINATION');
  let confirmedAny = false;
  let inconclusiveAny = false;
  for (const asin of SEED_ASINS) {
    const docs = seedProductMap.get(asin) || [];
    const distinctProductIds = [...new Set(docs.map(d => d.productId ? String(d.productId) : '<missing>'))];
    const duplicate = docs.length > 1 || distinctProductIds.length > 1;
    if (duplicate) confirmedAny = true;
    if (docs.length === 0) inconclusiveAny = true;
    console.log(`${asin} | Product Count: ${docs.length} | Duplicate? ${duplicate ? 'YES' : 'NO'} | Distinct Product IDs: [${distinctProductIds.join(', ')}]`);
  }
  console.log(`NOTE: TOTAL_PRODUCTS=${allProducts.length} — do NOT infer duplicates from a 45 total alone; per-ASIN identity evidence above is authoritative.`);
  let dupVerdict;
  if (confirmedAny) dupVerdict = 'CONFIRMED';
  else if (inconclusiveAny) dupVerdict = 'INCONCLUSIVE';
  else dupVerdict = 'DISPROVEN';
  console.log(`DUPLICATE THEORY: ${dupVerdict}`);

  // ---------- PART 15 — FEATURED ROOT CAUSE DETERMINATION ----------
  console.log('\n==============================');
  console.log('PART 15 — FEATURED ROOT CAUSE DETERMINATION');
  const allInStockTrue = allStockBuckets['true'] || 0;
  const amazonStockTrue = amazonStockBuckets['true'] || 0;
  const cacheTotal = featuredAll.length;
  const cacheActive = featuredActive.length;
  const cacheExpired = featuredExpired.length;
  let featuredRootCause = '';
  if (allInStockTrue === 0) {
    featuredRootCause = 'A (no Product documents have inStock:true)';
  } else if (amazonStockTrue === 0 && allInStockTrue > 0) {
    featuredRootCause = 'B (Amazon products have inStock:false/missing; other retailer products may be in stock)';
  } else if (cacheTotal === 0) {
    featuredRootCause = 'D (FeaturedProduct cache has no records at all — refresh has not run or was wiped)';
  } else if (cacheActive === 0) {
    featuredRootCause = 'F (FeaturedProduct cache is fully expired)';
  } else {
    const activeSectionCount = featuredActive.reduce((n, f) => n + (Array.isArray(f.sections) ? f.sections.filter(s => ['hot', 'trending', 'restocks'].includes(s)).length : 0), 0);
    if (activeSectionCount === 0) {
      featuredRootCause = 'E (active FeaturedProduct records exist but section values do not match the API section queries: hot/trending/restocks)';
    } else {
      featuredRootCause = 'C/G (products have inStock:true and cache is active, but determineSections produces no/insufficient sections for populated feeds — inspect SECTION DISTRIBUTION and cache records above)';
    }
  }
  console.log(`ALL_PRODUCTS_IN_STOCK_TRUE=${allInStockTrue}`);
  console.log(`AMAZON_IN_STOCK_TRUE=${amazonStockTrue}`);
  console.log(`FEATURED CACHE TOTAL=${cacheTotal} ACTIVE=${cacheActive} EXPIRED=${cacheExpired}`);
  console.log(`DETERMINED ROOT CAUSE: ${featuredRootCause}`);

  // ---------- PART 16 — FINAL MACHINE-READABLE SUMMARY ----------
  const seedCounts = {};
  const seedValid = {};
  const seedNull = {};
  const seedStockTrue = {};
  const seedStockFalse = {};
  for (const asin of SEED_ASINS) {
    const docs = seedProductMap.get(asin) || [];
    const buckets = countByBucket(docs, priceBucket);
    const stocks = countByBucket(docs, stockBucket);
    seedCounts[asin] = docs.length;
    seedValid[asin] = buckets['valid'] || 0;
    seedNull[asin] = buckets['null'] || 0;
    seedStockTrue[asin] = stocks['true'] || 0;
    seedStockFalse[asin] = stocks['false'] || 0;
  }
  const amazonValid = seAmazonBuckets['valid'] || 0;
  const priceRootCauses = [];
  if (amazonValid === 0 && amazonProducts.length > 0) priceRootCauses.push('NO VALID AMAZON PRICE IN DB');
  if ((seSeedBuckets['null'] || 0) + (seSeedBuckets['missing'] || 0) > 0) priceRootCauses.push('SEED PRICES NULL/MISSING');
  if (priceRootCauses.length === 0) priceRootCauses.push('PRICES PRESENT');
  let primaryPriceRootCause = priceRootCauses.join(' / ');

  console.log('\n==============================');
  console.log('PHASE 12.6.7 PRODUCTION RESULT');
  console.log('==============================');
  console.log(`DB_CONNECTION=SUCCESS`);
  console.log(`TOTAL_PRODUCTS=${allProducts.length}`);
  console.log(`TOTAL_AMAZON_PRODUCTS=${amazonProducts.length}`);
  for (const asin of SEED_ASINS) {
    console.log(`${asin}_PRODUCT_COUNT=${seedCounts[asin]}`);
  }
  console.log(`B0829FT44S_VALID_PRICE_COUNT=${seedValid['B0829FT44S']}`);
  console.log(`B0829FT44S_NULL_PRICE_COUNT=${seedNull['B0829FT44S']}`);
  console.log(`B0829FT44S_IN_STOCK_TRUE=${seedStockTrue['B0829FT44S']}`);
  console.log(`B0829FT44S_IN_STOCK_FALSE=${seedStockFalse['B0829FT44S']}`);
  console.log(`AMAZON_VALID_PRICE_COUNT=${amazonValid}`);
  console.log(`AMAZON_NULL_PRICE_COUNT=${seAmazonBuckets['null'] || 0}`);
  console.log(`AMAZON_MISSING_PRICE_COUNT=${seAmazonBuckets['missing'] || 0}`);
  console.log(`ALL_PRODUCTS_IN_STOCK_TRUE=${allInStockTrue}`);
  console.log(`ALL_PRODUCTS_IN_STOCK_FALSE=${allStockBuckets['false'] || 0}`);
  console.log(`ALL_PRODUCTS_IN_STOCK_MISSING=${allStockBuckets['null/missing'] || 0}`);
  console.log(`FEATURED_SOURCE_QUERY_COUNT=${fsTotal}`);
  console.log(`FEATURED_CACHE_TOTAL=${cacheTotal}`);
  console.log(`FEATURED_CACHE_ACTIVE=${cacheActive}`);
  console.log(`FEATURED_CACHE_EXPIRED=${cacheExpired}`);
  console.log(`DUPLICATES_CONFIRMED=${dupVerdict === 'CONFIRMED' ? 'YES' : (dupVerdict === 'DISPROVEN' ? 'NO' : 'INCONCLUSIVE')}`);
  console.log(`PRIMARY_PRICE_ROOT_CAUSE=${primaryPriceRootCause}`);
  console.log(`PRIMARY_FEATURED_ROOT_CAUSE=${featuredRootCause}`);
  console.log('==============================');

  console.log('\nINSTRUCTIONS (for operator): run from the repo root in Render Shell with:');
  console.log('  node scripts/phase-12-6-7-production-diagnostic.js');
  console.log('This script is strictly read-only and used the production process.env.MONGO_URI.');

  // ---------- PART 17 — EXIT CLEANLY ----------
  if (closeConnection) {
    try {
      await mongoose.disconnect();
    } catch (_) { /* best effort */ }
  }
  console.log(closeConnection
    ? '\nDiagnostic complete. Mongoose connection closed. Exiting 0.'
    : '\nDiagnostic complete. Shared server connection preserved (read-only).');
  return { ok: true };
}

// Standalone entry point — direct execution keeps its original behavior and
// exit codes (0 on success, 1 on any failure).
if (IS_MAIN) {
  runDiagnostic()
    .then((result) => process.exit(result && result.ok ? 0 : 1))
    .catch((err) => {
      console.log('FATAL UNHANDLED ERROR (read-only diagnostic): ' + sanitizeError(err));
      process.exit(1);
    });
}

// TEMPORARY export surface for the diagnostic HTTP route. Do not build
// permanent consumers against this module.
module.exports = {
  runDiagnostic,
  resetDiagnosticReport,
  stopDiagnosticReport,
  getDiagnosticReport
};