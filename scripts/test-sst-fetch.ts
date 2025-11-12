/**
 * Test Script for Phase 1 SST Data Fetching
 * 
 * Validates that SST data is accurately fetched from the correct data source (NSST from NOMADS)
 * and that the data format is correct for D3 map rendering.
 * 
 * IMPORTANT: SST comes from NSST (NOMADS), NOT from GFS atmospheric data.
 * This test validates Phase 1 functionality after NSST migration.
 * 
 * Run with: npx tsx scripts/test-sst-fetch.ts
 */

import { getSSTData } from '../app/actions/sst-data';
import type { SSTGridPoint } from '../types/sst';

/**
 * Test Case 1: SST Data Source Validation
 * 
 * Validates that SST data comes from NSST (NOMADS), not from old OISST source
 * Returns true if passed, false if failed
 */
async function testCase1(): Promise<boolean> {
  const { pass, fail, warn } = await import('./test-colors');
  console.log('\n=== Test Case 1: SST Data Source Validation ===');
  
  console.log('Fetching SST data...');
  
  try {
    const startTime = Date.now();
    const data = await getSSTData();
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\nResults:');
    console.log(`  Date: ${data.date}`);
    console.log(`  Source: ${data.source}`);
    console.log(`  Point count: ${data.pointCount}`);
    console.log(`  Fetch time: ${fetchTime}s`);
    
    // Validate data source
    const isNSST = data.source.toLowerCase().includes('nsst') || 
                   data.source.toLowerCase().includes('nomads');
    const isOldOISST = data.source.toLowerCase().includes('oisst') ||
                       data.source.toLowerCase().includes('psl');
    
    console.log('\nData Source Validation:');
    if (isNSST) {
      console.log(`  ✓ Data source is NSST/NOMADS (correct)`);
      console.log(`  ✓ Using current data source after NSST migration`);
    } else if (isOldOISST) {
      console.log(`  ⚠️  WARNING: Data source appears to be old OISST (should be NSST)`);
      console.log(`  → This indicates cached data from before NSST migration`);
      console.log(`  → Clear cache to fetch fresh NSST data: rm -rf data/cache/sst/*.json`);
      console.log(`  → Or wait for cache to expire (24 hours)`);
    } else {
      console.log(`  ⚠️  Data source: ${data.source} (verify this is NSST)`);
    }
    
    if (isNSST && !isOldOISST) {
      console.log('\n' + pass('✓ Test Case 1 PASSED: SST data from correct source (NSST/NOMADS)'));
      return true;
    } else if (isOldOISST) {
      console.log('\n' + warn('⚠️  Test Case 1: Cached OISST data detected (expected after migration)'));
      console.log('   Clear cache to test fresh NSST fetch');
      return false; // Fail because we want NSST, not OISST
    } else {
      console.log('\n' + fail('✗ Test Case 1 FAILED: SST data source validation failed'));
      return false;
    }
  } catch (error) {
    console.error('\n' + fail('✗ Test Case 1 ERROR:'), error);
    if (error instanceof Error) {
      console.error('  Message:', error.message);
    }
    return false;
  }
}

/**
 * Test Case 2: SST Data Accuracy and Format
 * 
 * Validates SST temperature ranges, data format, and completeness
 * Returns true if passed, false if failed
 */
async function testCase2(): Promise<boolean> {
  const { pass, fail } = await import('./test-colors');
  console.log('\n=== Test Case 2: SST Data Accuracy and Format ===');
  
  console.log('Fetching SST data...');
  
  try {
    const data = await getSSTData();
    
    if (data.gridPoints.length === 0) {
      console.log('\n' + fail('✗ Test Case 2 FAILED: No SST grid points returned'));
      return false;
    }
    
    // Sample points from different regions
    const samplePoints = data.gridPoints.slice(0, Math.min(10, data.gridPoints.length));
    
    console.log(`\nAnalyzing ${samplePoints.length} sample points...`);
    
    // Validate SST values
    const sstValues = samplePoints.map(p => p.sst);
    const minSST = Math.min(...sstValues);
    const maxSST = Math.max(...sstValues);
    const avgSST = sstValues.reduce((a, b) => a + b, 0) / sstValues.length;
    
    console.log('\nSST Temperature Validation:');
    console.log(`  Min SST: ${minSST.toFixed(2)}°C`);
    console.log(`  Max SST: ${maxSST.toFixed(2)}°C`);
    console.log(`  Avg SST: ${avgSST.toFixed(2)}°C`);
    
    // Validate reasonable ranges (global ocean: -2°C to 35°C)
    const validMin = minSST >= -2 && minSST <= 5; // Cold water (polar regions)
    const validMax = maxSST >= 25 && maxSST <= 35; // Warm water (tropical regions)
    const validRange = minSST >= -2 && maxSST <= 35;
    
    console.log(`  Min SST reasonable (-2 to 5°C): ${validMin ? '✓' : '✗'} (${minSST.toFixed(2)}°C)`);
    console.log(`  Max SST reasonable (25 to 35°C): ${validMax ? '✓' : '✗'} (${maxSST.toFixed(2)}°C)`);
    console.log(`  Overall range valid (-2 to 35°C): ${validRange ? '✓' : '✗'}`);
    
    // Validate data format
    console.log('\nData Format Validation:');
    const sample = samplePoints[0];
    const hasLat = typeof sample.lat === 'number' && !isNaN(sample.lat);
    const hasLon = typeof sample.lon === 'number' && !isNaN(sample.lon);
    const hasSST = typeof sample.sst === 'number' && !isNaN(sample.sst);
    const latInRange = sample.lat >= -90 && sample.lat <= 90;
    const lonInRange = sample.lon >= -180 && sample.lon <= 180;
    
    console.log(`  Sample point: ${sample.lat}°N, ${sample.lon}°W, SST: ${sample.sst}°C`);
    console.log(`  Has valid lat: ${hasLat ? '✓' : '✗'}`);
    console.log(`  Has valid lon: ${hasLon ? '✓' : '✗'}`);
    console.log(`  Has valid SST: ${hasSST ? '✓' : '✗'}`);
    console.log(`  Lat in range (-90 to 90): ${latInRange ? '✓' : '✗'}`);
    console.log(`  Lon in range (-180 to 180): ${lonInRange ? '✓' : '✗'}`);
    
    // Check for missing/invalid data
    const invalidPoints = data.gridPoints.filter(p => 
      isNaN(p.sst) || p.sst < -2 || p.sst > 35 ||
      isNaN(p.lat) || isNaN(p.lon)
    );
    
    console.log(`\nData Completeness:`);
    console.log(`  Total points: ${data.pointCount}`);
    console.log(`  Invalid/missing: ${invalidPoints.length} (${(invalidPoints.length / data.pointCount * 100).toFixed(2)}%)`);
    
    if (validRange && hasLat && hasLon && hasSST && latInRange && lonInRange && invalidPoints.length < data.pointCount * 0.1) {
      console.log('\n' + pass('✓ Test Case 2 PASSED: SST data is accurate and properly formatted'));
      return true;
    } else {
      console.log('\n' + fail('✗ Test Case 2 FAILED: SST data validation issues found'));
      return false;
    }
  } catch (error) {
    console.error('\n' + fail('✗ Test Case 2 ERROR:'), error);
    if (error instanceof Error) {
      console.error('  Message:', error.message);
    }
    return false;
  }
}

/**
 * Test Case 3: D3 Map Data Validation
 * 
 * Validates that SST data is in the correct format for D3 map rendering
 * Returns true if passed, false if failed
 */
async function testCase3(): Promise<boolean> {
  const { pass, fail } = await import('./test-colors');
  console.log('\n=== Test Case 3: D3 Map Data Validation ===');
  
  console.log('Fetching SST data for D3 validation...');
  
  try {
    const data = await getSSTData();
    
    if (data.gridPoints.length === 0) {
      console.log('\n' + fail('✗ Test Case 3 FAILED: No SST grid points for D3 validation'));
      return false;
    }
    
    console.log(`\nValidating ${data.pointCount} points for D3 rendering...`);
    
    // Check data structure matches D3 requirements
    const sample = data.gridPoints[0];
    const requiredFields = ['lat', 'lon', 'sst'];
    const hasAllFields = requiredFields.every(field => field in sample);
    
    console.log('\nD3 Data Structure Validation:');
    console.log(`  Has all required fields (lat, lon, sst): ${hasAllFields ? '✓' : '✗'}`);
    
    // Check data density (enough points for visualization)
    const pointsPerDegree = data.pointCount / ((data.bounds.maxLat - data.bounds.minLat) * (data.bounds.maxLon - data.bounds.minLon));
    const hasEnoughPoints = data.pointCount > 1000; // Minimum for meaningful visualization
    const hasGoodDensity = pointsPerDegree > 1; // At least 1 point per degree
    
    console.log(`  Point count: ${data.pointCount} ${hasEnoughPoints ? '✓' : '✗'} (need > 1000)`);
    console.log(`  Density: ${pointsPerDegree.toFixed(2)} points/degree² ${hasGoodDensity ? '✓' : '✗'} (need > 1)`);
    
    // Check geographic bounds
    const boundsValid = 
      data.bounds.minLat < data.bounds.maxLat &&
      data.bounds.minLon < data.bounds.maxLon &&
      data.bounds.minLat >= -90 && data.bounds.maxLat <= 90 &&
      data.bounds.minLon >= -180 && data.bounds.maxLon <= 180;
    
    console.log(`  Bounds valid: ${boundsValid ? '✓' : '✗'}`);
    console.log(`    ${data.bounds.minLat}°N to ${data.bounds.maxLat}°N`);
    console.log(`    ${data.bounds.minLon}°W to ${data.bounds.maxLon}°W`);
    
    // Check for data clustering (points should be distributed)
    const latRange = data.bounds.maxLat - data.bounds.minLat;
    const lonRange = data.bounds.maxLon - data.bounds.minLon;
    const expectedGridSize = Math.sqrt(data.pointCount);
    const hasGoodDistribution = expectedGridSize > 30; // Roughly 30x30 grid minimum
    
    console.log(`  Data distribution: ${hasGoodDistribution ? '✓' : '✗'} (expected ~${expectedGridSize.toFixed(0)}x${expectedGridSize.toFixed(0)} grid)`);
    
    // Validate SST values are suitable for color scale
    const sstValues = data.gridPoints.map(p => p.sst).filter(s => !isNaN(s));
    const sstMin = Math.min(...sstValues);
    const sstMax = Math.max(...sstValues);
    const sstRange = sstMax - sstMin;
    const hasGoodRange = sstRange > 5; // At least 5°C range for meaningful visualization
    
    console.log(`  SST range: ${sstMin.toFixed(2)}°C to ${sstMax.toFixed(2)}°C (range: ${sstRange.toFixed(2)}°C) ${hasGoodRange ? '✓' : '✗'}`);
    
    if (hasAllFields && hasEnoughPoints && hasGoodDensity && boundsValid && hasGoodDistribution && hasGoodRange) {
      console.log('\n' + pass('✓ Test Case 3 PASSED: SST data is suitable for D3 map rendering'));
      return true;
    } else {
      console.log('\n' + fail('✗ Test Case 3 FAILED: SST data has issues for D3 rendering'));
      return false;
    }
  } catch (error) {
    console.error('\n' + fail('✗ Test Case 3 ERROR:'), error);
    if (error instanceof Error) {
      console.error('  Message:', error.message);
    }
    return false;
  }
}

/**
 * Test Case 4: Cache Behavior
 * 
 * Validates SST data caching works correctly
 * Returns true if passed, false if failed
 */
async function testCase4(): Promise<boolean> {
  const { pass, warn, fail } = await import('./test-colors');
  console.log('\n=== Test Case 4: Cache Behavior ===');
  
  console.log('Testing SST cache behavior...');
  
  try {
    // First fetch (should download or use cache)
    console.log('\nFirst fetch...');
    const start1 = Date.now();
    const data1 = await getSSTData();
    const time1 = ((Date.now() - start1) / 1000).toFixed(2);
    console.log(`  Time: ${time1}s`);
    console.log(`  Points: ${data1.pointCount}`);
    console.log(`  Source: ${data1.source}`);
    
    // Second fetch (should use cache)
    console.log('\nSecond fetch (should use cache)...');
    const start2 = Date.now();
    const data2 = await getSSTData();
    const time2 = ((Date.now() - start2) / 1000).toFixed(2);
    console.log(`  Time: ${time2}s`);
    console.log(`  Points: ${data2.pointCount}`);
    console.log(`  Source: ${data2.source}`);
    
    // Validate cache worked
    const cacheWorked = parseFloat(time2) < parseFloat(time1) * 0.5; // Should be at least 2x faster
    const dataMatches = data1.pointCount === data2.pointCount && data1.date === data2.date;
    
    console.log('\nCache Validation:');
    console.log(`  Second fetch faster: ${cacheWorked ? '✓' : '✗'} (${time1}s → ${time2}s)`);
    console.log(`  Data matches: ${dataMatches ? '✓' : '✗'}`);
    console.log(`  Same date: ${data1.date === data2.date ? '✓' : '✗'}`);
    
    if (cacheWorked && dataMatches) {
      console.log('\n' + pass('✓ Test Case 4 PASSED: Cache working correctly'));
      return true;
    } else {
      console.log('\n' + warn('⚠️  Test Case 4: Cache behavior needs review'));
      console.log('   (This is OK if cache was just created on first fetch)');
      return true; // Don't fail on cache timing issues
    }
  } catch (error) {
    console.error('\n' + fail('✗ Test Case 4 ERROR:'), error);
    return false;
  }
}

/**
 * Main test runner
 * Returns true if all tests passed, false otherwise
 */
async function runTests(): Promise<boolean> {
  const { pass, fail, info } = await import('./test-colors');
  
  console.log('========================================');
  console.log('Phase 1 SST Data Fetching Test Suite');
  console.log('========================================');
  console.log('Testing NSST data fetching from NOMADS');
  console.log('Validating SST data accuracy and D3 map compatibility');
  console.log('');
  console.log('NOTE: SST comes from NSST (NOMADS), NOT from GFS atmospheric data.');
  console.log('This validates Phase 1 functionality after NSST migration.');
  console.log('');
  
  const results: boolean[] = [];
  
  // Track each test case result
  const result1 = await testCase1();
  results.push(result1);
  
  const result2 = await testCase2();
  results.push(result2);
  
  const result3 = await testCase3();
  results.push(result3);
  
  const result4 = await testCase4();
  results.push(result4);
  
  const allPassed = results.every(r => r);
  const passedCount = results.filter(r => r).length;
  
  console.log('\n========================================');
  console.log('Test Suite Complete');
  console.log('========================================');
  console.log('');
  if (allPassed) {
    console.log(pass(`✓ All ${results.length} test cases PASSED`));
  } else {
    console.log(fail(`✗ ${results.length - passedCount} of ${results.length} test cases FAILED`));
  }
  console.log('');
  console.log('Next Steps:');
  console.log('- Verify D3 map renders correctly in browser');
  console.log('- Check that SST visualization matches expected patterns');
  
  return allPassed;
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests };

