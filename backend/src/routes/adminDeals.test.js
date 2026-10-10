const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { generateAccessToken } = require('../utils/tokenUtils');

jest.mock('../models/AuthUser', () => ({
  AuthUserModel: {
    findById: jest.fn()
  }
}));

jest.mock('../services/ManualDealService', () => {
  const MVP_CATEGORIES = Object.freeze([
    'drops', 'food', 'home', 'auto', 'pet', 'toys', 'collectibles', 'electronics'
  ]);

  return {
    MVP_CATEGORIES,
    publishManualDeal: jest.fn()
  };
});

const { AuthUserModel } = require('../models/AuthUser');
const { publishManualDeal, MVP_CATEGORIES } = require('../services/ManualDealService');
const adminDealsRouter = require('./adminDeals');

describe('POST /api/admin/deals', () => {
  let app;
  let adminToken;
  let nonAdminToken;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/admin/deals', adminDealsRouter);

    adminToken = generateAccessToken({ userId: 'admin-user-id' });
    nonAdminToken = generateAccessToken({ userId: 'regular-user-id' });
  });

  beforeEach(() => {
    jest.clearAllMocks();

    AuthUserModel.findById.mockImplementation((id) => {
      if (id === 'admin-user-id') {
        return Promise.resolve({
          _id: 'admin-user-id',
          email: 'admin@stockspot.com',
          status: 'active',
          plan: 'admin'
        });
      }
      if (id === 'regular-user-id') {
        return Promise.resolve({
          _id: 'regular-user-id',
          email: 'user@stockspot.com',
          status: 'active',
          plan: 'free'
        });
      }
      return Promise.resolve(null);
    });
  });

  describe('Authentication & Authorization', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .post('/api/admin/deals')
        .send({ dealUrl: 'https://example.com/item', category: 'electronics' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_TOKEN');
    });

    it('returns 401 when token is invalid', async () => {
      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', 'Bearer invalid-token-string')
        .send({ dealUrl: 'https://example.com/item', category: 'electronics' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('returns 403 when user is not an admin', async () => {
      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .send({ dealUrl: 'https://example.com/item', category: 'electronics' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ADMIN_REQUIRED');
      expect(publishManualDeal).not.toHaveBeenCalled();
    });

    it('returns 401 when user account is inactive', async () => {
      AuthUserModel.findById.mockResolvedValueOnce({
        _id: 'inactive-admin',
        status: 'suspended',
        plan: 'admin'
      });

      const inactiveToken = generateAccessToken({ userId: 'inactive-admin' });
      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', `Bearer ${inactiveToken}`)
        .send({ dealUrl: 'https://example.com/item', category: 'electronics' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('USER_INACTIVE');
    });
  });

  describe('Input Validation', () => {
    it('returns 400 when dealUrl is missing', async () => {
      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category: 'electronics' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dealUrl is required/i);
    });

    it('returns 400 when dealUrl is empty or whitespace', async () => {
      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dealUrl: '   ', category: 'electronics' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dealUrl is required/i);
    });

    it('returns 400 when dealUrl is not a valid URL', async () => {
      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dealUrl: 'not-a-valid-url', category: 'electronics' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dealUrl must be a valid URL/i);
    });

    it('returns 400 when category is missing', async () => {
      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dealUrl: 'https://example.com/deal' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/category is required/i);
    });

    it('returns 400 when category is invalid', async () => {
      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dealUrl: 'https://example.com/deal', category: 'pokemon_tcg' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid category/i);
    });

    it('returns 400 when promoCode is not a string', async () => {
      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dealUrl: 'https://example.com/deal',
          category: 'electronics',
          promoCode: 12345
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/promoCode must be a string/i);
    });
  });

  describe('Successful Deal Creation', () => {
    it('successfully publishes a deal with dealUrl, category, and promoCode', async () => {
      const mockResult = {
        deal: {
          _id: 'deal-abc',
          name: 'https://example.com/deals/tv',
          url: 'https://example.com/deals/tv',
          category: 'electronics',
          promoCode: 'DEAL50',
          inStock: true,
          sourceType: 'manual',
          isAdminCurated: true,
          postedAt: new Date().toISOString()
        },
        retired: {
          archivedCount: 0,
          archivedIds: [],
          maxActive: 20
        }
      };

      publishManualDeal.mockResolvedValueOnce(mockResult);

      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dealUrl: 'https://example.com/deals/tv',
          category: 'electronics',
          promoCode: 'DEAL50'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.deal).toEqual(mockResult.deal);
      expect(res.body.retired).toEqual(mockResult.retired);
      expect(publishManualDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          dealUrl: 'https://example.com/deals/tv',
          category: 'electronics',
          promoCode: 'DEAL50'
        })
      );
    });

    it('accepts all 8 valid MVP categories', async () => {
      const mockResult = {
        deal: { _id: 'mock-deal' },
        retired: { archivedCount: 0, archivedIds: [], maxActive: 20 }
      };

      for (const cat of MVP_CATEGORIES) {
        publishManualDeal.mockResolvedValueOnce(mockResult);

        const res = await request(app)
          .post('/api/admin/deals')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            dealUrl: `https://example.com/${cat}`,
            category: cat
          });

        expect(res.status).toBe(201);
      }

      expect(publishManualDeal).toHaveBeenCalledTimes(MVP_CATEGORIES.length);
    });

    it('returns retired deal metadata when the category exceeds 20 active deals', async () => {
      const mockResult = {
        deal: {
          _id: 'deal-21',
          url: 'https://example.com/deals/21',
          category: 'electronics'
        },
        retired: {
          archivedCount: 1,
          archivedIds: ['deal-1'],
          maxActive: 20,
          retiredAt: new Date().toISOString()
        }
      };

      publishManualDeal.mockResolvedValueOnce(mockResult);

      const res = await request(app)
        .post('/api/admin/deals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dealUrl: 'https://example.com/deals/21',
          category: 'electronics'
        });

      expect(res.status).toBe(201);
      expect(res.body.retired.archivedCount).toBe(1);
      expect(res.body.retired.archivedIds).toEqual(['deal-1']);
    });
  });
});
