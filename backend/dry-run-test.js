/**
 * Dry-Run Test CLI
 * Comprehensive testing without credentials
 */

const DryRunValidator = require('./tests/DryRunValidator');

async function main() {
  console.log('\n🧪 Starting StockSpot Dry-Run Tests\n');

  try {
    const results = await DryRunValidator.validateAll();

    // Write results to JSON
    const fs = require('fs');
    const reportPath = './dry-run-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`📄 Full report written to: ${reportPath}\n`);

    // Exit with appropriate code
    process.exit(results.failed === 0 ? 0 : 1);
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    process.exit(1);
  }
}

main();
