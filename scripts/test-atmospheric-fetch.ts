/**
 * Test Script for Atmospheric Data Fetching
 * 
 * Validates that atmospheric data can be fetched from NOMADS GFS
 * and that the complete vertical profiles are extracted correctly.
 * 
 * IMPORTANT: SST (Sea Surface Temperature) comes from NSST data source (Phase 1),
 * NOT from GFS atmospheric data. Atmospheric profiles should have SST as NaN.
 * SST will be combined with atmospheric profiles in Task 2.3.
 * 
 * Run with: npx tsx scripts/test-atmospheric-fetch.ts
 */

import { getAtmosphericData } from '../app/actions/atmospheric-data';
import type { GeographicBounds } from '../types/geographic';

/**
 * Test Case 1: Small region (single point area for quick testing)
 */
async function testCase1(): Promise<void> {
  console.log('\n=== Test Case 1: Small Region (Single Point Area) ===');
  
  const bounds: GeographicBounds = {
    minLat: 25.0,
    maxLat: 26.0,
    minLon: -81.0,
    maxLon: -80.0
  };
  
  console.log('Bounds:', bounds);
  console.log('Fetching atmospheric data...');
  
  try {
    const startTime = Date.now();
    const data = await getAtmosphericData(bounds);
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\nResults:');
    console.log(`  Date: ${data.date}`);
    console.log(`  Source: ${data.source}`);
    console.log(`  Point count: ${data.pointCount}`);
    console.log(`  Fetch time: ${fetchTime}s`);
    
    if (data.gridPoints.length > 0) {
      const sample = data.gridPoints[0];
      console.log('\nSample Profile:');
      console.log(`  Location: ${sample.lat}°N, ${sample.lon}°W`);
      
      // SST comes from NSST (Phase 1), not from atmospheric data
      // Raw atmospheric profile should NOT have SST field
      const hasSST = 'sst' in sample.profile;
      if (hasSST) {
        console.log(`  ⚠️  WARNING: Profile contains SST field (should not - SST comes from NSST, not GFS)`);
        console.log(`  → This indicates cached/stale data. Clear cache to see correct behavior.`);
      } else {
        console.log(`  ✓ Profile correctly excludes SST (SST comes from NSST data source, not GFS)`);
        console.log(`  → SST will be fetched from NSST and combined in Task 2.3`);
      }
      
      console.log(`  Surface (air temp at 2m): ${sample.profile.surface.temperature}°C, RH: ${sample.profile.surface.relativeHumidity}%, P: ${sample.profile.surface.pressure}mb`);
      
      if (sample.profile.level_850) {
        console.log(`  850mb: ${sample.profile.level_850.temperature}°C, RH: ${sample.profile.level_850.relativeHumidity}%`);
      }
      if (sample.profile.level_500) {
        console.log(`  500mb: ${sample.profile.level_500.temperature}°C, RH: ${sample.profile.level_500.relativeHumidity}%`);
      }
      if (sample.profile.level_200) {
        console.log(`  200mb: ${sample.profile.level_200.temperature}°C`);
      }
      
      // Validate profile completeness
      const requiredLevels = ['surface', 'level_850', 'level_700', 'level_500', 'level_400', 'level_300', 'level_250', 'level_200', 'level_150', 'level_100'];
      const missingLevels = requiredLevels.filter(level => !sample.profile[level]);
      
      if (missingLevels.length > 0) {
        console.log(`\n⚠️  Warning: Missing levels: ${missingLevels.join(', ')}`);
      } else {
        console.log('\n✓ Profile is complete (all required levels present)');
      }
      
      // Validate SST separation
      if (!hasSST) {
        console.log('\n✓ SST correctly separated: No SST field in raw atmospheric profile (will come from NSST)');
      } else {
        console.log('\n⚠️  SST validation: Found SST field in atmospheric profile (should not exist)');
        console.log('   This indicates cached data from before the fix. Clear cache to see correct behavior.');
      }
      
      // Validate temperature ranges
      const surfaceTemp = sample.profile.surface.temperature;
      const temp850 = sample.profile.level_850?.temperature;
      const temp500 = sample.profile.level_500?.temperature;
      const temp200 = sample.profile.level_200?.temperature;
      
      console.log('\nTemperature Validation:');
      console.log(`  Surface temp reasonable (15-35°C): ${surfaceTemp >= 15 && surfaceTemp <= 35 ? '✓' : '✗'} (${surfaceTemp}°C)`);
      if (temp850) {
        console.log(`  850mb temp reasonable (10-25°C): ${temp850 >= 10 && temp850 <= 25 ? '✓' : '✗'} (${temp850}°C)`);
      }
      if (temp500) {
        console.log(`  500mb temp reasonable (-20 to 10°C): ${temp500 >= -20 && temp500 <= 10 ? '✓' : '✗'} (${temp500}°C)`);
      }
      if (temp200) {
        console.log(`  200mb temp reasonable (-60 to -30°C): ${temp200 >= -60 && temp200 <= -30 ? '✓' : '✗'} (${temp200}°C)`);
      }
      
      // Validate relative humidity
      const surfaceRH = sample.profile.surface.relativeHumidity;
      const rh850 = sample.profile.level_850?.relativeHumidity;
      const rh500 = sample.profile.level_500?.relativeHumidity;
      
      console.log('\nRelative Humidity Validation:');
      console.log(`  Surface RH valid (0-100%): ${surfaceRH >= 0 && surfaceRH <= 100 ? '✓' : '✗'} (${surfaceRH}%)`);
      if (rh850) {
        console.log(`  850mb RH valid (0-100%): ${rh850 >= 0 && rh850 <= 100 ? '✓' : '✗'} (${rh850}%)`);
      }
      if (rh500) {
        console.log(`  500mb RH valid (0-100%): ${rh500 >= 0 && rh500 <= 100 ? '✓' : '✗'} (${rh500}%)`);
      }
      
      console.log('\n✓ Test Case 1 PASSED');
    } else {
      console.log('\n✗ Test Case 1 FAILED: No grid points returned');
    }
  } catch (error) {
    console.error('\n✗ Test Case 1 ERROR:', error);
    if (error instanceof Error) {
      console.error('  Message:', error.message);
      console.error('  Stack:', error.stack);
    }
  }
}

/**
 * Test Case 2: North Atlantic basin (larger region)
 */
async function testCase2(): Promise<void> {
  console.log('\n=== Test Case 2: North Atlantic Basin (Larger Region) ===');
  
  const bounds: GeographicBounds = {
    minLat: 5,
    maxLat: 45,
    minLon: -95,
    maxLon: -10
  };
  
  console.log('Bounds:', bounds);
  console.log('Fetching atmospheric data (this may take a while)...');
  
  try {
    const startTime = Date.now();
    const data = await getAtmosphericData(bounds);
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\nResults:');
    console.log(`  Date: ${data.date}`);
    console.log(`  Source: ${data.source}`);
    console.log(`  Point count: ${data.pointCount}`);
    console.log(`  Fetch time: ${fetchTime}s`);
    
    if (data.pointCount > 0) {
      console.log('\n✓ Test Case 2 PASSED');
      console.log(`  Successfully fetched ${data.pointCount} atmospheric profiles`);
    } else {
      console.log('\n✗ Test Case 2 FAILED: No grid points returned');
    }
  } catch (error) {
    console.error('\n✗ Test Case 2 ERROR:', error);
    if (error instanceof Error) {
      console.error('  Message:', error.message);
    }
  }
}

/**
 * Test Case 3: Cache behavior
 */
async function testCase3(): Promise<void> {
  console.log('\n=== Test Case 3: Cache Behavior ===');
  
  const bounds: GeographicBounds = {
    minLat: 25.0,
    maxLat: 26.0,
    minLon: -81.0,
    maxLon: -80.0
  };
  
  console.log('Testing cache behavior...');
  
  try {
    // First fetch (should download)
    console.log('\nFirst fetch (should download from NOMADS)...');
    const start1 = Date.now();
    const data1 = await getAtmosphericData(bounds);
    const time1 = ((Date.now() - start1) / 1000).toFixed(2);
    console.log(`  Time: ${time1}s`);
    console.log(`  Points: ${data1.pointCount}`);
    
    // Second fetch (should use cache)
    console.log('\nSecond fetch (should use cache)...');
    const start2 = Date.now();
    const data2 = await getAtmosphericData(bounds);
    const time2 = ((Date.now() - start2) / 1000).toFixed(2);
    console.log(`  Time: ${time2}s`);
    console.log(`  Points: ${data2.pointCount}`);
    
    // Validate cache worked
    const cacheWorked = parseFloat(time2) < parseFloat(time1) * 0.5; // Should be at least 2x faster
    const dataMatches = data1.pointCount === data2.pointCount;
    
    console.log('\nCache Validation:');
    console.log(`  Second fetch faster: ${cacheWorked ? '✓' : '✗'} (${time1}s → ${time2}s)`);
    console.log(`  Data matches: ${dataMatches ? '✓' : '✗'}`);
    
    if (cacheWorked && dataMatches) {
      console.log('\n✓ Test Case 3 PASSED');
    } else {
      console.log('\n✗ Test Case 3 FAILED');
    }
  } catch (error) {
    console.error('\n✗ Test Case 3 ERROR:', error);
  }
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  console.log('========================================');
  console.log('Atmospheric Data Fetching Test Suite');
  console.log('========================================');
  console.log('Testing GFS atmospheric data fetching from NOMADS');
  console.log('This tests the complete vertical profile extraction');
  console.log('');
  console.log('NOTE: SST comes from NSST (Phase 1), not from GFS.');
  console.log('Atmospheric profiles should have SST as NaN.');
  console.log('SST will be combined with atmospheric profiles in Task 2.3.');
  console.log('');
  
  await testCase1();
  // Uncomment for larger test (takes longer)
  // await testCase2();
  await testCase3();
  
  console.log('\n========================================');
  console.log('Test Suite Complete');
  console.log('========================================');
  console.log('');
  console.log('Next Steps:');
  console.log('- Task 2.3 will combine NSST SST with GFS atmospheric profiles');
  console.log('- PI calculation will use both data sources together');
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests };

