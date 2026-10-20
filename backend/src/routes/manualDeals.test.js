const express = require('express');
const request = require('supertest');

jest.mock('../services/ManualDealService', () => ({
  MVP_CATEGORIES: Object.freeze([
    'drops', 'food', 'home', 'auto', 'pet', 'toys', 'collectibles', 'electronics'
  ]),
  getActiveManualDeals: jest.fn()
}));

const { getActiveManualDeals } = require('../services/ManualDealService');
const manualDealsRouter = require('./manualDeals');

describe('GET /api/deals', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/deals', manualDealsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns active manual deals without requiring auth', async () => {
    const deals = [{ _id: 'd1', name: 'TV', category: 'electronics', promoCode: 'SAVE10' }];
    getActiveManualDeals.mockResolvedValue(deals);

    const res = await request(app).get('/api/deals');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.deals).toEqual(deals);
    expect(getActiveManualDeals).toHaveBeenCalledWith({ category: undefined, limit: 24, skip: 0 });
  });

  it('rejects an invalid category with 400 and does not query', async () => {
    const res = await request(app).get('/api/deals?category=nope');

    expect(res.status).toBe(400);
    expect(getActiveManualDeals).not.toHaveBeenCalled();
  });

  it('normalizes category case and clamps limit', async () => {
    getActiveManualDeals.mockResolvedValue([]);

    const res = await request(app).get('/api/deals?category=Electronics&limit=999');

    expect(res.status).toBe(200);
    expect(getActiveManualDeals).toHaveBeenCalledWith({ category: 'electronics', limit: 50, skip: 0 });
  });

  it('returns an empty list when there are no active deals', async () => {
    getActiveManualDeals.mockResolvedValue([]);

    const res = await request(app).get('/api/deals');

    expect(res.status).toBe(200);
    expect(res.body.deals).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it('returns 500 when the service throws', async () => {
    getActiveManualDeals.mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/deals');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to load deals');
  });
});