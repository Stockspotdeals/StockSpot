/**
 * Phase 12.6.8 regression — manual-deal publishing error:
 *   "Cannot read properties of undefined (reading 'includes')"
 *
 * Root cause: backend/src/models/Product.js (at the time deployed) exported
 * only the mongoose model — no MVP_CATEGORIES / PRODUCT_SOURCE_TYPES — while
 * ManualDealService destructured them off the model and both this service and
 * POST /api/admin/deals called `MVP_CATEGORIES.includes(...)`, producing a
 * TypeError (HTTP 500) on every publish.
 *
 * These tests pin the fallback behavior: even when the Product model does not
 * export the canonical constants, the service resolves them and publishing
 * works — with the exact same 8 categories and source-type values.
 */

// Canonical expectations (must match the Product model's definitions exactly).
const EXPECTED_CATEGORIES = ['drops', 'food', 'home', 'auto', 'pet', 'toys', 'collectibles', 'electronics'];

/** Builds a constant-less Product mock shaped like the deployed (pre-fix) model. */
function constantLessProductMock() {
  const mock = jest.fn();
  mock.create = jest.fn();
  mock.find = jest.fn();
  mock.countDocuments = jest.fn();
  mock.updateMany = jest.fn();
  // No MVP_CATEGORIES / PRODUCT_SOURCE_TYPES attached — this is the bug shape.
  return mock;
}

/** Makes mock.find() return the chain used by retireExcessManualDeals. */
function primeEmptyActiveDeals(productMock) {
  productMock.find.mockReturnValue({
    sort: () => ({ select: () => ({ lean: async () => [] }) })
  });
}

describe('Phase 12.6.8 regression: Product model without MVP constant exports', () => {
  let ProductMock;
  let service;

  beforeEach(() => {
    jest.resetModules();
    ProductMock = constantLessProductMock();
    jest.doMock('../models/Product', () => ProductMock);
    service = require('./ManualDealService');
  });

  afterEach(() => {
    jest.dontMock('../models/Product');
    jest.resetModules();
  });

  it('resolves the canonical MVP categories instead of undefined', () => {
    expect(service.MVP_CATEGORIES).toEqual(EXPECTED_CATEGORIES);
  });

  it('resolves the canonical product source types instead of undefined', () => {
    expect(service.PRODUCT_SOURCE_TYPES).toEqual({ AUTO: 'auto', MANUAL: 'manual' });
    expect(service.PRODUCT_SOURCE_TYPES.MANUAL).toBe('manual');
  });

  it('assertValidCategory accepts all 8 valid categories without a TypeError', () => {
    EXPECTED_CATEGORIES.forEach((cat) => {
      expect(() => service.assertValidCategory(cat)).not.toThrow();
    });
  });

  it('assertValidCategory throws a clean validation error for invalid or missing categories', () => {
    expect(() => service.assertValidCategory('bogus')).toThrow(/Invalid MVP category/);
    expect(() => service.assertValidCategory(undefined)).toThrow(/Invalid MVP category/);
    // Must be a plain validation Error, never the TypeError from the bug.
    expect(() => service.assertValidCategory('bogus')).not.toThrow(TypeError);
    expect(() => service.assertValidCategory(undefined)).not.toThrow(TypeError);
  });

  it('publishManualDeal completes the full publish path without a TypeError', async () => {
    const createdDeal = { _id: 'deal-1', url: 'https://example.com/deal', category: 'electronics' };
    ProductMock.create.mockResolvedValue(createdDeal);
    primeEmptyActiveDeals(ProductMock);

    const result = await service.publishManualDeal({
      dealUrl: 'https://example.com/deal',
      category: 'electronics',
      promoCode: 'SAVE10'
    });

    expect(ProductMock.create).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/deal',
      category: 'electronics',
      promoCode: 'SAVE10',
      sourceType: 'manual',
      isAdminCurated: true
    }));
    expect(result.deal).toEqual(createdDeal);
    expect(result.retired).toEqual(expect.objectContaining({ archivedCount: 0 }));
  });
});

describe('Product model exports are preferred when present', () => {
  afterEach(() => {
    jest.dontMock('../models/Product');
    jest.resetModules();
  });

  it('uses the real Product model constants when the model exports them', () => {
    jest.resetModules();
    const Product = require('../models/Product'); // real model (current tree shape)
    const freshService = require('./ManualDealService');

    if (Array.isArray(Product.MVP_CATEGORIES)) {
      expect(freshService.MVP_CATEGORIES).toBe(Product.MVP_CATEGORIES);
      expect(freshService.MVP_CATEGORIES).toEqual(EXPECTED_CATEGORIES);
      if (Product.PRODUCT_SOURCE_TYPES && Product.PRODUCT_SOURCE_TYPES.MANUAL) {
        expect(freshService.PRODUCT_SOURCE_TYPES).toBe(Product.PRODUCT_SOURCE_TYPES);
      }
    } else {
      // Older model without exports — fallback must still be canonical.
      expect(freshService.MVP_CATEGORIES).toEqual(EXPECTED_CATEGORIES);
    }
    EXPECTED_CATEGORIES.forEach((cat) => {
      expect(() => freshService.assertValidCategory(cat)).not.toThrow();
    });
  });
});
