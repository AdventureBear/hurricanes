/**
 * Compare NSST and OISST data for the same date
 * This script fetches data from both sources and compares values
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

interface SSTPoint {
  lat: number;
  lon: number;
  sst: number;
}

interface SSTData {
  date: string;
  source: string;
  gridPoints: SSTPoint[];
  pointCount: number;
}

// Date to compare: 2025-11-11 (available in both sources)
const COMPARE_DATE = '2025-11-11';

async function loadNSSTData(): Promise<SSTData | null> {
  const cachePath = path.join(process.cwd(), 'data/cache/sst', `sst-${COMPARE_DATE}.json`);
  
  if (!existsSync(cachePath)) {
    console.log('❌ No cached NSST data found');
    console.log('   Run the app to fetch NSST data first, or fetch manually');
    return null;
  }
  
  const content = await readFile(cachePath, 'utf-8');
  const data = JSON.parse(content);
  return data.data || data;
}

async function fetchOISSTData(): Promise<SSTData | null> {
  // OISST from PSL OPeNDAP
  // URL format: https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.YEAR.nc.ascii
  const year = COMPARE_DATE.split('-')[0];
  const url = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${year}.nc.ascii`;
  
  console.log(`\nFetching OISST from: ${url}`);
  console.log(`Date: ${COMPARE_DATE}`);
  
  // For North Atlantic basin: 5°N-50°N, -100°W-0°
  const bounds = {
    minLat: 5,
    maxLat: 50,
    minLon: -100,
    maxLon: 0
  };
  
  // OPeNDAP query format
  // We need to extract the date index and query the data
  // This is complex - let's use a simpler approach: fetch via curl and parse
  
  try {
    // Use curl to fetch OPeNDAP ASCII data
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // OPeNDAP query for specific date and bounds
    // Format: sst[time_index][lat_start:lat_end][lon_start:lon_end]
    // We'll need to calculate indices based on the grid
    
    // For now, let's fetch a small sample to test
    const testUrl = `${url}?sst[0:0][160:200][720:1080]`; // Approximate indices for our bounds
    
    console.log('⚠️  OPeNDAP parsing is complex - using alternative approach');
    console.log('   We can fetch OISST via NCEI THREDDS instead');
    
    return null;
  } catch (error) {
    console.error('Error fetching OISST:', error);
    return null;
  }
}

async function fetchOISSTFromNCEI(): Promise<SSTData | null> {
  // Try NCEI THREDDS instead - might be easier
  const dateStr = COMPARE_DATE.replace(/-/g, '');
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  
  // NCEI THREDDS URL
  const url = `https://www.ncei.noaa.gov/thredds/dodsC/OisstBase/NetCDF/V2.1/AVHRR/${year}${month}/sst.day.mean.${dateStr}.nc`;
  
  console.log(`\nTrying NCEI THREDDS: ${url}`);
  
  // This would require NetCDF parsing or OPeNDAP client
  // For now, let's create a comparison script that uses Python to fetch OISST
  
  return null;
}

function compareData(nsst: SSTData, oisst: SSTData | null) {
  console.log('\n' + '='.repeat(60));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(60));
  
  console.log(`\nNSST Data:`);
  console.log(`  Date: ${nsst.date}`);
  console.log(`  Source: ${nsst.source}`);
  console.log(`  Points: ${nsst.pointCount}`);
  
  if (!oisst) {
    console.log('\n❌ OISST data not available for comparison');
    console.log('   Need to implement OISST fetching');
    return;
  }
  
  console.log(`\nOISST Data:`);
  console.log(`  Date: ${oisst.date}`);
  console.log(`  Source: ${oisst.source}`);
  console.log(`  Points: ${oisst.pointCount}`);
  
  // Find matching grid points and compare values
  const nsstMap = new Map<string, number>();
  nsst.gridPoints.forEach(p => {
    const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
    nsstMap.set(key, p.sst);
  });
  
  let matches = 0;
  let totalDiff = 0;
  let maxDiff = 0;
  let minDiff = Infinity;
  
  oisst.gridPoints.forEach(p => {
    const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
    const nsstValue = nsstMap.get(key);
    
    if (nsstValue !== undefined) {
      matches++;
      const diff = Math.abs(nsstValue - p.sst);
      totalDiff += diff;
      maxDiff = Math.max(maxDiff, diff);
      minDiff = Math.min(minDiff, diff);
    }
  });
  
  console.log(`\nComparison:`);
  console.log(`  Matching grid points: ${matches}`);
  if (matches > 0) {
    const avgDiff = totalDiff / matches;
    console.log(`  Average difference: ${avgDiff.toFixed(2)}°C`);
    console.log(`  Max difference: ${maxDiff.toFixed(2)}°C`);
    console.log(`  Min difference: ${minDiff.toFixed(2)}°C`);
  }
  
  // Coverage comparison
  const nsstLats = new Set(nsst.gridPoints.map(p => p.lat.toFixed(2)));
  const oisstLats = new Set(oisst.gridPoints.map(p => p.lat.toFixed(2)));
  const nsstLons = new Set(nsst.gridPoints.map(p => p.lon.toFixed(2)));
  const oisstLons = new Set(oisst.gridPoints.map(p => p.lon.toFixed(2)));
  
  console.log(`\nCoverage:`);
  console.log(`  NSST lat range: ${Math.min(...Array.from(nsstLats).map(Number))} to ${Math.max(...Array.from(nsstLats).map(Number))}`);
  console.log(`  OISST lat range: ${Math.min(...Array.from(oisstLats).map(Number))} to ${Math.max(...Array.from(oisstLats).map(Number))}`);
  console.log(`  NSST lon range: ${Math.min(...Array.from(nsstLons).map(Number))} to ${Math.max(...Array.from(nsstLons).map(Number))}`);
  console.log(`  OISST lon range: ${Math.min(...Array.from(oisstLons).map(Number))} to ${Math.max(...Array.from(oisstLons).map(Number))}`);
}

async function main() {
  console.log('NSST vs OISST Comparison');
  console.log('='.repeat(60));
  console.log(`Date: ${COMPARE_DATE}`);
  
  const nsst = await loadNSSTData();
  if (!nsst) {
    console.log('\n❌ Cannot proceed without NSST data');
    process.exit(1);
  }
  
  // Try to fetch OISST - for now, we'll create a Python script to do this
  console.log('\n⚠️  OISST fetching requires NetCDF/OPeNDAP parsing');
  console.log('   Creating Python script to fetch and compare...');
  
  // Create Python script for OISST fetching
  compareData(nsst, null);
}

main().catch(console.error);

