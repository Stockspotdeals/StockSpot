/**
 * Focused tests for AmazonConnector post-ingestion fixes:
 *  - category normalization (never '', always a valid TrackedProduct enum value)
 *  - price extraction from the actual Creators API offersV2 response structure
 *  - missing-price diagnostic
 */
const { AmazonConnector } = require('./AmazonConnector');

// Instantiate without a real network client — extraction logic is pure.
function makeConnector() {
  return new AmazonConnector({ client: {}, affiliateEngine: { associateId: 'test-20' } });
}

describe('AmazonConnector category normalization', () => {
  it('never returns an empty category for any input', () => {
    const connector = makeConnector();
    expect(connector._extractCategory(null, '', '')).toBe('other');
    expect(connector._extractCategory({}, 'Generic Product', 'https://www.amazon.com/dp/B000000000')).toBe('other');
    expect(connector._extractCategory({ browseNodeInfo: null }, 'Generic Product', 'https://www.amazon.com/dp/B000000000')).toBe('other');
  });

  it('maps Amazon browse-node metadata to a valid TrackedProduct enum value', () => {
    const connector = makeConnector();
    const category = connector._extractCategory(
      {
        browseNodeInfo: {
          browseNodes: [{ DisplayName: 'Electronics' }]
        }
      },
      'Echo Show 8 Smart Display',
      'https://www.amazon.com/dp/B0XXXX'
    );
    expect(category).toBe('electronics');
    expect(['pokemon_tcg', 'one_piece_tcg', 'sports_cards', 'gaming', 'electronics', 'collectibles', 'toys', 'other']).toContain(category);
  });

  it('uses Amazon browse-node metadata + title through CategoryDetector keywords', () => {
    const connector = makeConnector();
    const category = connector._extractCategory(
      {
        browseNodeInfo: {
          browseNodes: [{ DisplayName: 'Toys & Games' }]
        }
      },
      'Pokemon TCG Elite Trainer Box',
      'https://www.amazon.com/dp/B0YYYY'
    );
    expect(category).toBe('pokemon_tcg');
  });

  it('falls back to other when no category metadata exists and the title is unknown', () => {
    const connector = makeConnector();
    const category = connector._extractCategory(
      { browseNodeInfo: null },
      'Random Widget',
      'https://www.amazon.com/dp/B0ZZZZ'
    );
    expect(category).toBe('other');
  });

  it('returns a valid enum value for a Pokemon title with no Amazon metadata', () => {
    const connector = makeConnector();
    const category = connector._extractCategory(
      { browseNodeInfo: null },
      'Pokemon Scarlet & Violet Booster Box',
      'https://www.amazon.com/dp/B0AAAA'
    );
    expect(category).toBe('pokemon_tcg');
  });

  it('returns the safe fallback even when a producer passes an empty product category', () => {
    // Simulates AmazonConnector output with empty category reaching MonitoringWorker logic.
    const connector = makeConnector();
    const item = {
      asin: 'B09EXAMPLE',
      title: 'Mystery Item',
      category: connector._extractCategory({ browseNodeInfo: null }, 'Mystery Item', 'https://www.amazon.com/dp/B09EXAMPLE')
    };
    expect(item.category).toBeTruthy();
    expect(item.category).not.toBe('');
    expect(['pokemon_tcg', 'one_piece_tcg', 'sports_cards', 'gaming', 'electronics', 'collectibles', 'toys', 'other']).toContain(item.category);
  });
});

describe('AmazonConnector price extraction (actual Creators API structure)', () => {
  it('extracts a price from offersV2.listings[0].price.Amount', () => {
    const connector = makeConnector();
    const item = {
      asin: 'B0123456789',
      offersV2: {
        listings: [
          { price: { Amount: 39.99, DisplayAmount: '$39.99' } }
        ]
      }
    };
    expect(connector._extractPrice(item)).toBe(39.99);
  });

  it('extracts a price from offersV2.listings[].price.DisplayAmount (string currency)', () => {
    const connector = makeConnector();
    const item = {
      offersV2: {
        listings: [
          { price: { DisplayAmount: '$19.99' } },
          { price: { DisplayAmount: '$24.99' } }
        ]
      }
    };
    expect(connector._extractPrice(item)).toBe(19.99);
  });

  it('finds a price in a later listing when the first listing has none', () => {
    const connector = makeConnector();
    const item = {
      offersV2: {
        listings: [
          { price: null },
          { price: { DisplayAmount: '$25.49' } }
        ]
      }
    };
    expect(connector._extractPrice(item)).toBe(25.49);
  });

  it('extracts a price from offersV2.summaries when present', () => {
    const connector = makeConnector();
    const item = {
      offersV2: {
        summaries: [
          { price: { Amount: 49.99 } }
        ]
      }
    };
    expect(connector._extractPrice(item)).toBe(49.99);
  });

  it('extracts a PA-API-like fallback price (Offers.Listings)', () => {
    const connector = makeConnector();
    const item = {
      Offers: {
        Listings: [
          { Price: { Amount: 89.99 } }
        ]
      }
    };
    expect(connector._extractPrice(item)).toBe(89.99);
  });

  it('returns null and explains when offersV2 is absent (Amazon returned no offer data)', () => {
    const connector = makeConnector();
    const item = { offersV2: null };
    expect(connector._extractPrice(item)).toBeNull();
    expect(connector._priceUnavailableReason(item)).toContain('offersV2 is absent');
  });

  it('returns null and explains when offersV2.listings exist but have no price', () => {
    const connector = makeConnector();
    const item = {
      offersV2: {
        listings: [
          { availability: 'In Stock' },
          { availability: 'In Stock' }
        ]
      }
    };
    expect(connector._extractPrice(item)).toBeNull();
    expect(connector._priceUnavailableReason(item)).toContain('only 0 listing(s) include a price');
  });

  it('returns null for an item with no offers data at all', () => {
    const connector = makeConnector();
    expect(connector._extractPrice({})).toBeNull();
  });
});

describe('AmazonConnector normalization flags missing prices', () => {
  it('flags missing_price in item.issues when no current price exists', () => {
    const connector = makeConnector();
    const raw = {
      asin: 'B0MISSING',
      itemInfo: { title: { displayValue: 'Test Product' } },
      detailPageURL: 'https://www.amazon.com/dp/B0MISSING',
      offersV2: null,
      images: { primary: { large: { url: 'https://img.test/1.jpg' } } }
    };
    const [normalized] = connector._normalizeItems([raw]);
    expect(normalized.price).toBeNull();
    expect(normalized.issues).toContain('missing_price');
    // Product remains usable for monitoring even without a price.
    expect(normalized.asin).toBe('B0MISSING');
    expect(normalized.retailer).toBe('amazon');
  });

  it('does NOT flag missing_price when a valid price exists', () => {
    const connector = makeConnector();
    const raw = {
      asin: 'B0EXAMPLEOK',
      itemInfo: { title: { displayValue: 'Test Product' } },
      detailPageURL: 'https://www.amazon.com/dp/B0EXAMPLEOK',
      offersV2: { listings: [{ price: { Amount: 12.34 } }] },
      images: { primary: { large: { url: 'https://img.test/2.jpg' } } }
    };
    const [normalized] = connector._normalizeItems([raw]);
    expect(normalized.price).toBe(12.34);
    // `issues` is only attached when non-empty; treat undefined as no issues.
    expect(normalized.issues || []).not.toContain('missing_price');
  });
});
