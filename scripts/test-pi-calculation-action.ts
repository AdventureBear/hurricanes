/**
 * Test Script for PI Calculation Server Action
 * 
 * Tests the combined PI calculation that merges SST and atmospheric data.
 * 
 * Run with: npx tsx scripts/test-pi-calculation-action.ts
 */

import { calculatePIData } from '../app/actions/calculate-pi';
import type { GeographicBounds } from '../types/geographic';
import { pass, fail, info } from './test-colors';

/**
 * Test Case 1: Small Region (Single Point Area)
 * Tests PI calculation for a small region to verify the integration works.
 */
async function testCase1(): Promise<void> {
  console.log('\n=== Test Case 1: Small Region (Single Point Area) ===');
  
  const bounds: GeographicBounds = {
    minLat: 25.0,
    maxLat: 26.0,
    minLon: -81.0,
    maxLon: -80.0,
  };
  
  console.log(`Bounds: ${bounds.minLat}°N-${bounds.maxLat}°N, ${bounds.minLon}°-${bounds.maxLon}°`);
  console.log('Calculating PI...');
  
  try {
    const startTime = Date.now();
    const data = await calculatePIData(bounds);
    const calculationTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\nResults:');
    console.log(`  SST date: ${data.sstDate}`);
    console.log(`  Atmospheric date: ${data.atmosphericDate}`);
    console.log(`  Point count: ${data.pointCount}`);
    console.log(`  Calculation time: ${calculationTime}s`);
    
    if (data.metadata) {
      console.log(`  Success: ${data.metadata.successCount}`);
      console.log(`  Errors: ${data.metadata.errorCount}`);
      if (data.metadata.avgCalculationTime) {
        console.log(`  Avg time per point: ${data.metadata.avgCalculationTime.toFixed(2)}ms`);
      }
    }
    
    if (data.gridPoints.length > 0) {
      const sample = data.gridPoints[0];
      console.log('\nSample PI Result:');
      console.log(`  Location: ${sample.lat}°N, ${sample.lon}°W`);
      console.log(`  SST: ${sample.sst}°C`);
      console.log(`  Vmax: ${sample.vmax} kt`);
      console.log(`  Pmin: ${sample.pmin} mb`);
      console.log(`  Category: ${sample.category}`);
      
      // Validate results
      const vmaxValid = sample.vmax >= 0 && sample.vmax <= 300;
      const pminValid = sample.pmin >= 850 && sample.pmin <= 1020;
      const categoryValid = ['TD', 'TS', 'Cat1', 'Cat2', 'Cat3', 'Cat4', 'Cat5'].includes(sample.category);
      
      console.log('\nValidation:');
      console.log(`  Vmax in valid range (0-300 kt): ${vmaxValid ? '✓' : '✗'} (${sample.vmax} kt)`);
      console.log(`  Pmin in valid range (850-1020 mb): ${pminValid ? '✓' : '✗'} (${sample.pmin} mb)`);
      console.log(`  Category valid: ${categoryValid ? '✓' : '✗'} (${sample.category})`);
      
      if (vmaxValid && pminValid && categoryValid) {
        console.log('\n' + pass('✓ Test Case 1 PASSED'));
      } else {
        console.log('\n' + fail('✗ Test Case 1 FAILED: Validation issues'));
      }
    } else {
      console.log('\n' + fail('✗ Test Case 1 FAILED: No PI results returned'));
    }
  } catch (error) {
    console.error('\n' + fail('✗ Test Case 1 ERROR:'), error);
    if (error instanceof Error) {
      console.error('  Message:', error.message);
    }
  }
}

/**
 * Test Case 2: Cache Behavior
 * Tests that PI calculation results are cached correctly.
 */
async function testCase2(): Promise<void> {
  console.log('\n=== Test Case 2: Cache Behavior ===');
  
  const bounds: GeographicBounds = {
    minLat: 25.0,
    maxLat: 26.0,
    minLon: -81.0,
    maxLon: -80.0,
  };
  
  console.log('Testing PI cache behavior...');
  
  try {
    // First calculation (should calculate and cache)
    console.log('\nFirst calculation (should calculate and cache)...');
    const start1 = Date.now();
    const data1 = await calculatePIData(bounds);
    const time1 = ((Date.now() - start1) / 1000).toFixed(2);
    console.log(`  Time: ${time1}s`);
    console.log(`  Points: ${data1.pointCount}`);
    
    // Second calculation (should use cache)
    console.log('\nSecond calculation (should use cache)...');
    const start2 = Date.now();
    const data2 = await calculatePIData(bounds);
    const time2 = ((Date.now() - start2) / 1000).toFixed(2);
    console.log(`  Time: ${time2}s`);
    console.log(`  Points: ${data2.pointCount}`);
    
    // Validate cache worked
    const bothFromCache = parseFloat(time1) < 0.1 && parseFloat(time2) < 0.1;
    const cacheWorked = bothFromCache || parseFloat(time2) < parseFloat(time1) * 0.5;
    const dataMatches = data1.pointCount === data2.pointCount && 
                        data1.sstDate === data2.sstDate &&
                        data1.atmosphericDate === data2.atmosphericDate;
    
    console.log('\nCache Validation:');
    if (bothFromCache) {
      console.log(`  Both calculations from cache: ✓ (${time1}s → ${time2}s)`);
    } else {
      console.log(`  Second calculation faster: ${cacheWorked ? '✓' : '✗'} (${time1}s → ${time2}s)`);
    }
    console.log(`  Data matches: ${dataMatches ? '✓' : '✗'}`);
    console.log(`  Same dates: ${data1.sstDate === data2.sstDate && data1.atmosphericDate === data2.atmosphericDate ? '✓' : '✗'}`);
    
    if (cacheWorked && dataMatches) {
      console.log('\n' + pass('✓ Test Case 2 PASSED: Cache working correctly'));
    } else {
      console.log('\n' + fail('✗ Test Case 2 FAILED: Cache behavior issue'));
    }
  } catch (error) {
    console.error('\n' + fail('✗ Test Case 2 ERROR:'), error);
    if (error instanceof Error) {
      console.error('  Message:', error.message);
    }
  }
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  console.log('========================================');
  console.log('PI Calculation Server Action Test Suite');
  console.log('========================================');
  console.log('Testing combined PI calculation (SST + Atmospheric)');
  console.log('');
  
  await testCase1();
  await testCase2();
  
  console.log('\n========================================');
  console.log('Test Suite Complete');
  console.log('========================================');
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests };

