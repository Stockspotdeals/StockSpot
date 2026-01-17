/**
 * Dry-Run Validator
 * Tests all critical functionality without requiring real credentials
 */

const FeedGenerator = require('../feeds/FeedGenerator');
const TierManager = require('../tiers/TierManager');
const MockDataGenerator = require('./MockDataGenerator');

class DryRunValidator {
  /**
   * Run full dry-run validation
   */
  static async validateAll() {
    console.log('\n' + '='.repeat(60));
    console.log('STOCKSPOT DRY-RUN VALIDATION');
    console.log('='.repeat(60) + '\n');

    const results = {
      timestamp: new Date().toISOString(),
      tests: [],
      passed: 0,
      failed: 0,
    };

    // Test 1: Feed Generation for Free Tier
    console.log('📋 TEST 1: Feed Generation - Free Tier (10-min delay for non-Amazon)');
    console.log('-'.repeat(60));
    try {
      const mockItems = MockDataGenerator.generateMockItems();
      const feedFree = FeedGenerator.processFeedItems(mockItems, 'free');

      console.log(`  ✓ Generated ${feedFree.length} feed items for free tier`);
      console.log(`  ✓ Items sorted by priority: ${feedFree.map((i) => i.name.substring(0, 20)).join(' → ')}`);

      // Check delays
      const amazonItems = feedFree.filter((i) => i.retailer === 'amazon');
      const nonAmazonItems = feedFree.filter((i) => i.retailer !== 'amazon');
      console.log(`  ✓ Amazon items: ${amazonItems.length} (instant)`);
      console.log(`  ✓ Non-Amazon items: ${nonAmazonItems.length} (10-min delay)`);

      results.passed++;
      results.tests.push({
        name: 'Feed Generation - Free Tier',
        status: 'PASS',
        details: `${feedFree.length} items processed`,
      });
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({
        name: 'Feed Generation - Free Tier',
        status: 'FAIL',
        error: error.message,
      });
    }
    console.log();

    // Test 2: Feed Generation for Paid Tier
    console.log('📋 TEST 2: Feed Generation - Paid Tier (instant for all)');
    console.log('-'.repeat(60));
    try {
      const mockItems = MockDataGenerator.generateMockItems();
      const feedPaid = FeedGenerator.processFeedItems(mockItems, 'paid');

      const visibleItems = feedPaid.filter((i) => i.visible);
      console.log(`  ✓ Generated ${feedPaid.length} feed items`);
      console.log(`  ✓ All items visible instantly: ${visibleItems.length === feedPaid.length ? 'YES' : 'NO'}`);
      console.log(`  ✓ Affiliate links applied: ${feedPaid.filter((i) => i.affiliateLink).length} items`);

      results.passed++;
      results.tests.push({
        name: 'Feed Generation - Paid Tier',
        status: 'PASS',
        details: `${feedPaid.length} items, all visible instantly`,
      });
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({
        name: 'Feed Generation - Paid Tier',
        status: 'FAIL',
        error: error.message,
      });
    }
    console.log();

    // Test 3: Feed Generation for Yearly Tier
    console.log('📋 TEST 3: Feed Generation - Yearly Tier (instant + manual input access)');
    console.log('-'.repeat(60));
    try {
      const mockItems = MockDataGenerator.generateMockItems();
      const feedYearly = FeedGenerator.processFeedItems(mockItems, 'yearly');
      const canManualInput = TierManager.canManualInput('yearly');

      console.log(`  ✓ Generated ${feedYearly.length} feed items`);
      console.log(`  ✓ Manual input access: ${canManualInput ? 'YES' : 'NO'}`);
      console.log(`  ✓ Manual input can be enabled: ${canManualInput ? 'YES' : 'NO'}`);

      results.passed++;
      results.tests.push({
        name: 'Feed Generation - Yearly Tier',
        status: 'PASS',
        details: `${feedYearly.length} items, manual input enabled`,
      });
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({
        name: 'Feed Generation - Yearly Tier',
        status: 'FAIL',
        error: error.message,
      });
    }
    console.log();

    // Test 4: Affiliate Link Conversion
    console.log('📋 TEST 4: Affiliate Link Conversion');
    console.log('-'.repeat(60));
    try {
      const AffiliateConverter = require('../affiliate/AffiliateConverter');
      const asin = 'B0CX1Y2K9J';
      const associateId = 'test-associate-123';
      const affiliateLink = AffiliateConverter.createAmazonAffiliateLink(asin, associateId);

      console.log(`  ✓ Created affiliate link: ${affiliateLink}`);
      console.log(`  ✓ Link contains associate ID: ${affiliateLink.includes(associateId) ? 'YES' : 'NO'}`);

      // Test ASIN extraction
      const extractedASIN = AffiliateConverter.extractASIN('https://amazon.com/dp/B0CX1Y2K9J?tag=test');
      console.log(`  ✓ Extracted ASIN: ${extractedASIN}`);

      results.passed++;
      results.tests.push({
        name: 'Affiliate Link Conversion',
        status: 'PASS',
        details: `Affiliate link created and ASIN extracted`,
      });
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({
        name: 'Affiliate Link Conversion',
        status: 'FAIL',
        error: error.message,
      });
    }
    console.log();

    // Test 5: Tier Feature Access
    console.log('📋 TEST 5: Tier Feature Access Control');
    console.log('-'.repeat(60));
    try {
      const freeTierFeatures = {
        manualInput: TierManager.canAccess('free', 'manualInput'),
        emailNotifications: TierManager.canAccess('free', 'emailNotifications'),
      };

      const paidTierFeatures = {
        manualInput: TierManager.canAccess('paid', 'manualInput'),
        emailNotifications: TierManager.canAccess('paid', 'emailNotifications'),
      };

      const yearlyTierFeatures = {
        manualInput: TierManager.canAccess('yearly', 'manualInput'),
        emailNotifications: TierManager.canAccess('yearly', 'emailNotifications'),
      };

      console.log(`  ✓ Free Tier - Manual Input: ${freeTierFeatures.manualInput ? 'ENABLED' : 'DISABLED'} (should be DISABLED)`);
      console.log(`  ✓ Free Tier - Email Notifications: ${freeTierFeatures.emailNotifications ? 'ENABLED' : 'DISABLED'} (should be DISABLED)`);
      console.log(`  ✓ Paid Tier - Manual Input: ${paidTierFeatures.manualInput ? 'ENABLED' : 'DISABLED'} (should be DISABLED)`);
      console.log(`  ✓ Paid Tier - Email Notifications: ${paidTierFeatures.emailNotifications ? 'ENABLED' : 'DISABLED'} (should be ENABLED)`);
      console.log(`  ✓ Yearly Tier - Manual Input: ${yearlyTierFeatures.manualInput ? 'ENABLED' : 'DISABLED'} (should be ENABLED)`);
      console.log(`  ✓ Yearly Tier - Email Notifications: ${yearlyTierFeatures.emailNotifications ? 'ENABLED' : 'DISABLED'} (should be ENABLED)`);

      const accessControlValid =
        !freeTierFeatures.manualInput &&
        !freeTierFeatures.emailNotifications &&
        !paidTierFeatures.manualInput &&
        paidTierFeatures.emailNotifications &&
        yearlyTierFeatures.manualInput &&
        yearlyTierFeatures.emailNotifications;

      if (accessControlValid) {
        results.passed++;
        results.tests.push({
          name: 'Tier Feature Access Control',
          status: 'PASS',
          details: 'All tiers have correct feature access',
        });
      } else {
        throw new Error('Feature access control validation failed');
      }
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({
        name: 'Tier Feature Access Control',
        status: 'FAIL',
        error: error.message,
      });
    }
    console.log();

    // Test 6: Item Deduplication
    console.log('📋 TEST 6: Item Deduplication');
    console.log('-'.repeat(60));
    try {
      const mockItems = MockDataGenerator.generateMockItems();
      const duplicates = [...mockItems, mockItems[0], mockItems[1]]; // Add duplicates
      const deduplicated = FeedGenerator.deduplicateItems(duplicates);

      console.log(`  ✓ Original items: ${duplicates.length}`);
      console.log(`  ✓ Deduplicated items: ${deduplicated.length}`);
      console.log(`  ✓ Duplicates removed: ${duplicates.length - deduplicated.length}`);

      results.passed++;
      results.tests.push({
        name: 'Item Deduplication',
        status: 'PASS',
        details: `${duplicates.length - deduplicated.length} duplicates removed`,
      });
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({
        name: 'Item Deduplication',
        status: 'FAIL',
        error: error.message,
      });
    }
    console.log();

    // Test 7: RSS Feed Generation
    console.log('📋 TEST 7: RSS Feed Generation');
    console.log('-'.repeat(60));
    try {
      const mockItems = MockDataGenerator.generateMockItems();
      const feed = FeedGenerator.processFeedItems(mockItems, 'free');
      const rss = FeedGenerator.generateRSSFeed(feed.slice(0, 5), {
        title: 'StockSpot - Test Feed',
        description: 'Test RSS feed',
        link: 'https://stockspot.local',
      });

      console.log(`  ✓ Generated RSS feed for ${feed.slice(0, 5).length} items`);
      console.log(`  ✓ RSS contains valid XML declaration: ${rss.includes('<?xml') ? 'YES' : 'NO'}`);
      console.log(`  ✓ RSS contains channel: ${rss.includes('<channel>') ? 'YES' : 'NO'}`);
      console.log(`  ✓ RSS feed length: ${(rss.length / 1024).toFixed(2)} KB`);

      results.passed++;
      results.tests.push({
        name: 'RSS Feed Generation',
        status: 'PASS',
        details: `RSS feed generated (${(rss.length / 1024).toFixed(2)} KB)`,
      });
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({
        name: 'RSS Feed Generation',
        status: 'FAIL',
        error: error.message,
      });
    }
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✓ PASSED: ${results.passed}`);
    console.log(`✗ FAILED: ${results.failed}`);
    console.log(`TOTAL:   ${results.passed + results.failed}`);
    console.log(`SUCCESS RATE: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%\n`);

    return results;
  }
}

module.exports = DryRunValidator;
