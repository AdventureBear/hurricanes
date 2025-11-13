/**
 * Test Runner Index
 * 
 * Central test runner for all test scripts in the project.
 * Comment/uncomment tests you want to run.
 * 
 * Usage:
 *   npx tsx scripts/test-runner.ts
 * 
 * Or run individual tests:
 *   npx tsx scripts/test-pi-calculation.ts
 *   npx tsx scripts/test-atmospheric-fetch.ts
 *   npx tsx scripts/test-noaa-fetch.ts
 */

// IMPORTANT: Set TEST_MODE before importing any modules that use it
// This ensures cache-config.ts and other modules read the correct value
if (process.env.TEST_MODE !== 'false') {
  process.env.TEST_MODE = 'true';
}

// Import test functions (after setting TEST_MODE)
import { runTests as runPITests } from './test-pi-calculation';
import { runTests as runAtmosphericTests } from './test-atmospheric-fetch';
import { runTests as runSSTTests } from './test-sst-fetch';
import { pass, fail, info, warn } from './test-colors';

/**
 * Test Configuration
 * 
 * Comment out tests you don't want to run.
 * Uncomment tests you want to run.
 */
const TEST_CONFIG = {
  // Phase 1: SST Data Fetching Tests (NSST from NOMADS)
  sstFetch: true,
  
  // Phase 2.1: PI Calculation Library Tests
  piCalculation: true,
  
  // Phase 2.2: Atmospheric Data Fetching Tests
  atmosphericFetch: true,
  
  // Phase 1: NOAA Data Fetching Tests (legacy - deprecated)
  noaaFetch: false, // Commented out - using NSST now
};

/**
 * Main test runner
 * 
 * IMPORTANT: Tests automatically use TEST_MODE=true to fetch 1° x 1° test regions
 * This allows proper validation of data sources without requiring global data fetches
 * TEST_MODE is set at the top of this file before any imports
 */
async function runAllTests(): Promise<void> {
  // TEST_MODE is already set at module load time (before imports)
  if (process.env.TEST_MODE === 'true') {
    console.log(info('ℹ️  TEST_MODE=true: Tests will use 1° x 1° test regions for validation'));
    console.log('   This allows proper testing without requiring global data fetches\n');
  } else {
    console.log(warn('⚠️  TEST_MODE=false: Tests will use production (global) bounds'));
    console.log('   This may require large buffers and take longer\n');
  }
  
  console.log('========================================');
  console.log('Test Runner - Hurricane MPI Maps');
  console.log('========================================');
  console.log('');
  console.log('Running configured tests...');
  console.log('');
  
  const results: Array<{ name: string; passed: boolean; error?: Error }> = [];
  
  // Run Phase 1 SST Fetch Tests
  if (TEST_CONFIG.sstFetch) {
    console.log('----------------------------------------');
    console.log('Running: Phase 1 SST Data Fetch Tests');
    console.log('----------------------------------------');
    try {
      const sstResult = await runSSTTests();
      results.push({ name: 'Phase 1 SST Fetch', passed: sstResult });
    } catch (error) {
      console.error(fail('Phase 1 SST Fetch Tests FAILED:'), error);
      results.push({ 
        name: 'Phase 1 SST Fetch', 
        passed: false, 
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
    console.log('');
  }
  
  // Run PI Calculation Tests
  if (TEST_CONFIG.piCalculation) {
    console.log('----------------------------------------');
    console.log('Running: PI Calculation Tests');
    console.log('----------------------------------------');
    try {
      // PI tests don't return boolean yet, but they throw on failure
      await runPITests();
      results.push({ name: 'PI Calculation', passed: true });
    } catch (error) {
      console.error(fail('PI Calculation Tests FAILED:'), error);
      results.push({ 
        name: 'PI Calculation', 
        passed: false, 
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
    console.log('');
  }
  
  // Run Atmospheric Fetch Tests
  if (TEST_CONFIG.atmosphericFetch) {
    console.log('----------------------------------------');
    console.log('Running: Atmospheric Data Fetch Tests');
    console.log('----------------------------------------');
    try {
      // Atmospheric tests don't return boolean yet, but they throw on failure
      await runAtmosphericTests();
      results.push({ name: 'Atmospheric Fetch', passed: true });
    } catch (error) {
      console.error(fail('Atmospheric Fetch Tests FAILED:'), error);
      results.push({ 
        name: 'Atmospheric Fetch', 
        passed: false, 
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
    console.log('');
  }
  
  // Run NOAA Fetch Tests (legacy)
  if (TEST_CONFIG.noaaFetch) {
    console.log('----------------------------------------');
    console.log('Running: NOAA Fetch Tests (Legacy)');
    console.log('----------------------------------------');
    console.log('⚠️  Note: NOAA OISST tests are legacy - we now use NSST');
    // Note: test-noaa-fetch.ts doesn't export a runTests function
    // If needed, we can add it or run it directly
    results.push({ name: 'NOAA Fetch (Legacy)', passed: false, error: new Error('Not implemented in test runner') });
    console.log('');
  }
  
  // Summary
  console.log('========================================');
  console.log('Test Summary');
  console.log('========================================');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach(result => {
    if (result.passed) {
      console.log(pass(`✓ PASSED: ${result.name}`));
    } else {
      console.log(fail(`✗ FAILED: ${result.name}`));
      if (result.error) {
        console.log(`  Error: ${result.error.message}`);
      }
    }
  });
  
  console.log('');
  if (failed === 0) {
    console.log(pass(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`));
  } else {
    console.log(fail(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`));
  }
  console.log('========================================');
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export { runAllTests, TEST_CONFIG };

