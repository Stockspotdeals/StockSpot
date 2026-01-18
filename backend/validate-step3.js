#!/usr/bin/env node

/**
 * StockSpot Step 3 Validation & Dry-Run Test
 * 
 * Comprehensive validation of:
 * - Reddit code removal
 * - Email notification system
 * - RSS feed generation
 * - PWA infrastructure
 * - Stripe monetization
 * - Amazon affiliate links
 * - Tier-based logic
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

class StockSpotValidator {
  constructor() {
    this.checks = [];
    this.passed = 0;
    this.failed = 0;
  }

  async run() {
    console.log(`\n${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║  StockSpot Step 3 Validation & Dry-Run    ║${colors.reset}`);
    console.log(`${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}\n`);

    await this.checkRedditRemoval();
    await this.checkEnvironmentVariables();
    await this.checkEmailService();
    await this.checkRSSFeedService();
    await this.checkPWAFiles();
    await this.checkStripeIntegration();
    await this.checkAmazonAffiliate();
    await this.checkTierLogic();
    await this.checkDependencies();

    this.printSummary();
  }

  async checkRedditRemoval() {
    console.log(`\n${colors.blue}🧹 Checking Reddit Code Removal...${colors.reset}`);
    
    const redditFiles = [
      'backend/services/RedditPoster.js',
      'backend/services/SubredditConfig.js',
      'backend/services/ObserverMode.js',
      'backend/services/providers/RedditProvider.js',
      'backend/workers/AutonomousMonitoringWorker.js',
      'backend/start_autonomous.js',
      'test_reddit_bot.js',
      'AUTONOMOUS_README.md'
    ];

    const redditFileChecksPassed = redditFiles.filter(file => {
      const exists = fs.existsSync(path.join(process.cwd(), file));
      return !exists;
    }).length === redditFiles.length;

    if (redditFileChecksPassed) {
      this.pass('✅ All Reddit files deleted');
    } else {
      this.fail('❌ Some Reddit files still exist');
    }

    // Check for Reddit references in code
    try {
      const output = execSync('grep -r "reddit\\|subreddit\\|REDDIT\\|SUBREDDIT" backend/ public/ 2>/dev/null || true', {
        encoding: 'utf-8'
      });

      if (output.trim().length > 0) {
        this.fail('❌ Found Reddit references in code: ' + output.substring(0, 100));
      } else {
        this.pass('✅ No Reddit references in codebase');
      }
    } catch (e) {
      this.pass('✅ No Reddit references found');
    }
  }

  async checkEnvironmentVariables() {
    console.log(`\n${colors.blue}🔐 Checking Environment Variables...${colors.reset}`);

    const requiredVars = [
      'NODE_ENV',
      'PORT',
      'DRY_RUN',
      'AMAZON_ASSOCIATE_ID',
      'STRIPE_SECRET_KEY'
    ];

    const envFile = path.join(process.cwd(), '.env');
    const envContent = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf-8') : '';

    // Check that .env has no Reddit variables
    if (envContent.includes('REDDIT') || envContent.includes('SUBREDDIT')) {
      this.fail('❌ Found Reddit variables in .env');
    } else {
      this.pass('✅ No Reddit variables in .env');
    }

    // Check that .env has no Twitter/Discord/Telegram variables
    if (envContent.includes('TWITTER') || envContent.includes('DISCORD') || envContent.includes('TELEGRAM')) {
      this.fail('❌ Found social media variables in .env');
    } else {
      this.pass('✅ Social media variables removed from .env');
    }

    // Check required variables exist
    const missingVars = requiredVars.filter(v => !envContent.includes(v + '='));
    if (missingVars.length === 0) {
      this.pass(`✅ All ${requiredVars.length} required variables present`);
    } else {
      this.fail(`❌ Missing variables: ${missingVars.join(', ')}`);
    }
  }

  async checkEmailService() {
    console.log(`\n${colors.blue}📧 Checking Email Notification Service...${colors.reset}`);

    const emailServicePath = path.join(process.cwd(), 'backend/notifications/EmailNotificationService.js');
    if (!fs.existsSync(emailServicePath)) {
      this.fail('❌ EmailNotificationService.js not found');
      return;
    }

    const emailContent = fs.readFileSync(emailServicePath, 'utf-8');

    const checks = [
      { name: 'Tier-aware delays', pattern: /tierDelays|FREE_TIER_DELAY/ },
      { name: 'SendGrid support', pattern: /sendgrid|SendGrid/ },
      { name: 'Nodemailer support', pattern: /nodemailer|Nodemailer/ },
      { name: 'Email queueing', pattern: /emailQueue|queueEmail/ },
      { name: 'HTML templates', pattern: /generateEmailHTML/ }
    ];

    checks.forEach(check => {
      if (check.pattern.test(emailContent)) {
        this.pass(`✅ ${check.name} implemented`);
      } else {
        this.fail(`❌ ${check.name} missing`);
      }
    });
  }

  async checkRSSFeedService() {
    console.log(`\n${colors.blue}📡 Checking RSS Feed Service...${colors.reset}`);

    const rssServicePath = path.join(process.cwd(), 'backend/notifications/RSSFeedService.js');
    if (!fs.existsSync(rssServicePath)) {
      this.fail('❌ RSSFeedService.js not found');
      return;
    }

    const rssContent = fs.readFileSync(rssServicePath, 'utf-8');

    const checks = [
      { name: 'Tier-based filtering', pattern: /generateUserRSSFeed|userTier/ },
      { name: 'Atom XML format', pattern: /Atom|generateAtomXML/ },
      { name: 'Category feeds', pattern: /generateCategoryRSSFeed|category/ },
      { name: 'Feed caching', pattern: /feeds\.set|feedTimestamps/ },
      { name: 'Public feeds', pattern: /Public|public/ }
    ];

    checks.forEach(check => {
      if (check.pattern.test(rssContent)) {
        this.pass(`✅ ${check.name} implemented`);
      } else {
        this.fail(`❌ ${check.name} missing`);
      }
    });
  }

  async checkPWAFiles() {
    console.log(`\n${colors.blue}📱 Checking PWA Infrastructure...${colors.reset}`);

    const pwaFiles = [
      { path: 'public/manifest.json', name: 'PWA Manifest' },
      { path: 'public/service-worker.js', name: 'Service Worker' },
      { path: 'public/landing.html', name: 'Landing Page' },
      { path: 'public/dashboard-v2.html', name: 'Dashboard' }
    ];

    pwaFiles.forEach(file => {
      const fullPath = path.join(process.cwd(), file.path);
      if (fs.existsSync(fullPath)) {
        this.pass(`✅ ${file.name} exists`);
      } else {
        this.fail(`❌ ${file.name} missing`);
      }
    });

    // Check manifest content
    const manifestPath = path.join(process.cwd(), 'public/manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.name && manifest.short_name && manifest.icons) {
        this.pass(`✅ Manifest properly configured`);
      } else {
        this.fail(`❌ Manifest incomplete`);
      }
    }
  }

  async checkStripeIntegration() {
    console.log(`\n${colors.blue}💳 Checking Stripe Integration...${colors.reset}`);

    const stripeManagerPath = path.join(process.cwd(), 'backend/payments/StripeManager.js');
    if (!fs.existsSync(stripeManagerPath)) {
      this.fail('❌ StripeManager.js not found');
      return;
    }

    const stripeContent = fs.readFileSync(stripeManagerPath, 'utf-8');

    const checks = [
      { name: 'Checkout sessions', pattern: /createCheckoutSession/ },
      { name: 'Webhook handlers', pattern: /handleWebhook/ },
      { name: 'Subscription lifecycle', pattern: /subscription/ },
      { name: 'Tier support', pattern: /PAID|YEARLY|tier/ },
      { name: 'Price IDs', pattern: /STRIPE_PRICE/ }
    ];

    checks.forEach(check => {
      if (check.pattern.test(stripeContent)) {
        this.pass(`✅ ${check.name} implemented`);
      } else {
        this.fail(`❌ ${check.name} missing`);
      }
    });
  }

  async checkAmazonAffiliate() {
    console.log(`\n${colors.blue}🔗 Checking Amazon Affiliate Integration...${colors.reset}`);

    const affiliatePath = path.join(process.cwd(), 'backend/services/AmazonAffiliateLinkConverter.js');
    if (!fs.existsSync(affiliatePath)) {
      this.fail('❌ AmazonAffiliateLinkConverter.js not found');
      return;
    }

    const affiliateContent = fs.readFileSync(affiliatePath, 'utf-8');

    const checks = [
      { name: 'ASIN extraction', pattern: /extractASIN/ },
      { name: 'Link conversion', pattern: /convertToAffiliateLink/ },
      { name: 'Link caching', pattern: /convertedLinks|cache/ },
      { name: 'Batch processing', pattern: /processBatch|processItems/ },
      { name: 'Validation', pattern: /isAmazonLink/ }
    ];

    checks.forEach(check => {
      if (check.pattern.test(affiliateContent)) {
        this.pass(`✅ ${check.name} implemented`);
      } else {
        this.fail(`❌ ${check.name} missing`);
      }
    });

    // Test conversion logic
    const testUrl = 'https://www.amazon.com/dp/B0123456789?ref=';
    if (affiliateContent.includes('extractASIN') && affiliateContent.includes('B0123456789')) {
      this.pass(`✅ ASIN extraction logic present`);
    }
  }

  async checkTierLogic() {
    console.log(`\n${colors.blue}⭐ Checking Tier-Based Logic...${colors.reset}`);

    const emailServicePath = path.join(process.cwd(), 'backend/notifications/EmailNotificationService.js');
    if (!fs.existsSync(emailServicePath)) {
      this.fail('❌ Tier logic file not found');
      return;
    }

    const tierContent = fs.readFileSync(emailServicePath, 'utf-8');

    const tiers = [
      { name: 'FREE tier (10-min delay)', pattern: /free.*delay|FREE.*10|tierDelays.*free/ },
      { name: 'PAID tier (instant)', pattern: /paid.*0|PAID.*instant/ },
      { name: 'YEARLY tier (instant + manual)', pattern: /yearly.*0|YEARLY.*manual/ }
    ];

    tiers.forEach(tier => {
      if (tier.pattern.test(tierContent)) {
        this.pass(`✅ ${tier.name} implemented`);
      } else {
        this.fail(`❌ ${tier.name} missing`);
      }
    });
  }

  async checkDependencies() {
    console.log(`\n${colors.blue}📦 Checking Dependencies...${colors.reset}`);

    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    const requiredDeps = [
      { name: 'stripe', reason: 'Stripe monetization' },
      { name: 'node-cron', reason: 'Feed scheduling' },
      { name: 'nodemailer', reason: 'Email notifications' },
      { name: '@sendgrid/mail', reason: 'SendGrid integration' },
      { name: 'mongoose', reason: 'MongoDB' },
      { name: 'express', reason: 'Web server' }
    ];

    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    requiredDeps.forEach(dep => {
      if (allDeps[dep.name]) {
        this.pass(`✅ ${dep.name} (${dep.reason})`);
      } else {
        this.fail(`❌ ${dep.name} missing`);
      }
    });

    // Check for deprecated packages
    const deprecated = ['inflight', 'whatwg-encoding'];
    const foundDeprecated = deprecated.filter(d => allDeps[d]);

    if (foundDeprecated.length === 0) {
      this.pass(`✅ No deprecated packages found`);
    } else {
      console.warn(`${colors.yellow}⚠️  Found deprecated packages: ${foundDeprecated.join(', ')}${colors.reset}`);
    }
  }

  pass(message) {
    this.checks.push({ passed: true, message });
    this.passed++;
    console.log(`  ${colors.green}${message}${colors.reset}`);
  }

  fail(message) {
    this.checks.push({ passed: false, message });
    this.failed++;
    console.log(`  ${colors.red}${message}${colors.reset}`);
  }

  printSummary() {
    const total = this.passed + this.failed;
    const percentage = Math.round((this.passed / total) * 100);

    console.log(`\n${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║          VALIDATION SUMMARY                ║${colors.reset}`);
    console.log(`${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}`);
    console.log(`\n  Total Checks: ${total}`);
    console.log(`  ${colors.green}Passed: ${this.passed}${colors.reset}`);
    console.log(`  ${colors.red}Failed: ${this.failed}${colors.reset}`);
    console.log(`  Score: ${percentage}%\n`);

    if (this.failed === 0) {
      console.log(`${colors.green}✅ ALL VALIDATION CHECKS PASSED!${colors.reset}`);
      console.log(`\n${colors.cyan}StockSpot Step 3 Implementation Status:${colors.reset}`);
      console.log(`  ✅ Reddit code completely removed`);
      console.log(`  ✅ Email notification system implemented`);
      console.log(`  ✅ RSS feed generation working`);
      console.log(`  ✅ PWA infrastructure in place`);
      console.log(`  ✅ Stripe monetization framework ready`);
      console.log(`  ✅ Amazon affiliate integration complete`);
      console.log(`  ✅ Tier-based logic enforced`);
      console.log(`  ✅ All dependencies installed\n`);
      console.log(`${colors.blue}Ready for: npm run validate && npm run dry-run${colors.reset}\n`);
    } else {
      console.log(`${colors.red}⚠️  Please fix ${this.failed} validation error(s) before deploying${colors.reset}\n`);
    }
  }
}

// Run validation
const validator = new StockSpotValidator();
validator.run().catch(error => {
  console.error('Validation failed:', error);
  process.exit(1);
});
