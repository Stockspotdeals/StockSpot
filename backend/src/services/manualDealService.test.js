const Product = require('../models/Product');

jest.mock('../models/Product', () => {
  const MVP_CATEGORIES = Object.freeze([
    'drops', 'food', 'home', 'auto', 'pet', 'toys', 'collectibles', 'electronics'
  ]);
  const PRODUCT_SOURCE_TYPES = Object.freeze({ AUTO: 'auto', MANUAL: 'manual' });

  return {
    MVP_CATEGORIES,
    PRODUCT_SOURCE_TYPES,
    find: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn()
  };
});

const {
  MVP_CATEGORIES,
  PRODUCT_SOURCE_TYPES,
  MAX_ACTIVE_MANUAL_DEALS_PER_CATEGORY,
  assertValidCategory,
  getActiveManualDeals,
  countActiveManualDeals,
  retireExcessManualDeals,
  publishManualDeal
} = require('./ManualDealService');

describe('ManualDealService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('MVP Constants & Category Validation', () => {
    it('defines exactly the 8 MVP categories', () => {
      expect(MVP_CATEGORIES).toEqual([
        'drops', 'food', 'home', 'auto', 'pet', 'toys', 'collectibles', 'electronics'
      ]);
    });

    it('enforces maximum 20 active deals per category', () => {
      expect(MAX_ACTIVE_MANUAL_DEALS_PER_CATEGORY).toBe(20);
    });

    it('assertValidCategory allows all 8 valid categories', () => {
      MVP_CATEGORIES.forEach((cat) => {
        expect(() => assertValidCategory(cat)).not.toThrow();
      });
    });

    it('assertValidCategory throws for invalid or legacy categories', () => {
      expect(() => assertValidCategory('pokemon_tcg')).toThrow(/Invalid MVP category/);
      expect(() => assertValidCategory('fashion')).toThrow(/Invalid MVP category/);
      expect(() => assertValidCategory('')).toThrow(/Invalid MVP category/);
      expect(() => assertValidCategory(null)).toThrow(/Invalid MVP category/);
    });
  });

  describe('publishManualDeal', () => {
    it('creates a manual deal with dealUrl, category, and promoCode', async () => {
      const mockCreated = {
        _id: 'deal-1',
        name: 'https://example.com/deal-1',
        title: 'https://example.com/deal-1',
        url: 'https://example.com/deal-1',
        category: 'electronics',
        promoCode: 'SAVE20',
        sourceType: 'manual',
        isAdminCurated: true,
        inStock: true
      };

      Product.create.mockResolvedValue(mockCreated);
      // Simulate 1 active deal in category
      Product.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: 'deal-1', postedAt: new Date() }])
      });

      const result = await publishManualDeal({
        dealUrl: 'https://example.com/deal-1',
        category: 'electronics',
        promoCode: 'SAVE20'
      });

      expect(Product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/deal-1',
          name: 'https://example.com/deal-1',
          category: 'electronics',
          promoCode: 'SAVE20',
          sourceType: 'manual',
          isAdminCurated: true,
          inStock: true
        })
      );
      expect(result.deal).toEqual(mockCreated);
      expect(result.retired.archivedCount).toBe(0);
    });

    it('throws error when dealUrl is missing', async () => {
      await expect(
        publishManualDeal({ category: 'electronics' })
      ).rejects.toThrow(/dealUrl \(or url\) is required/);
    });

    it('throws error when category is invalid', async () => {
      await expect(
        publishManualDeal({ dealUrl: 'https://example.com', category: 'invalid' })
      ).rejects.toThrow(/Invalid MVP category/);
    });

    it('sets promoCode to undefined when empty or whitespace', async () => {
      Product.create.mockResolvedValue({ _id: 'deal-2' });
      Product.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });

      await publishManualDeal({
        dealUrl: 'https://example.com/item',
        category: 'drops',
        promoCode: '   '
      });

      expect(Product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          promoCode: undefined
        })
      );
    });
  });

  describe('retireExcessManualDeals (20-deal cap)', () => {
    it('does not archive when active deals are <= 20', async () => {
      const activeDeals = Array.from({ length: 20 }, (_, i) => ({
        _id: `id-${i}`,
        postedAt: new Date(Date.now() + i * 1000)
      }));

      Product.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(activeDeals)
      });

      const retired = await retireExcessManualDeals('electronics');

      expect(retired.archivedCount).toBe(0);
      expect(retired.archivedIds).toEqual([]);
      expect(Product.updateMany).not.toHaveBeenCalled();
    });

    it('archives the oldest deal when active deals reach 21', async () => {
      const activeDeals = Array.from({ length: 21 }, (_, i) => ({
        _id: `deal-${i + 1}`,
        postedAt: new Date(1000000000 + i * 1000)
      }));

      Product.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(activeDeals)
      });
      Product.updateMany.mockResolvedValue({ modifiedCount: 1 });

      const retired = await retireExcessManualDeals('electronics', 20);

      // deal-1 is the oldest and should be in the excess slice
      expect(Product.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['deal-1'] } },
        expect.objectContaining({
          $set: expect.objectContaining({ archivedAt: expect.any(Date) })
        })
      );
      expect(retired.archivedCount).toBe(1);
      expect(retired.archivedIds).toEqual(['deal-1']);
    });

    it('scopes retirement strictly to the requested category and manual deals', async () => {
      Product.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });

      await retireExcessManualDeals('home');

      expect(Product.find).toHaveBeenCalledWith({
        sourceType: 'manual',
        isAdminCurated: true,
        category: 'home',
        archivedAt: null
      });
    });
  });
});
