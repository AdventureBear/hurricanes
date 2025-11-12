/**
 * NSST Fetcher
 * Fetches Near-surface Sea Surface Temperature data from NOMADS
 * Uses GRIB2 format with selective extraction for efficiency
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { SSTDataResponse } from '@/types/sst';
import type { GeographicBounds } from '@/types/geographic';
import { buildNSSTGrib2Url, buildNSSTIndexUrl, findLatestAvailableNSSTDate, formatDateString } from './nsst-url-builder';
import { fetchAndParseGRIB2Index } from './grib2-index-parser';
import { fetchGRIB2Subset } from './grib2-subset-fetch';
import { parseNSSTGRIB2 } from './nsst-grib2-parser';

const GRIB2_CACHE_DIR = path.join(process.cwd(), 'data', 'cache', 'grib2', 'nsst');

/**
 * Ensures the GRIB2 cache directory exists
 */
async function ensureGRIB2CacheDir(): Promise<void> {
  try {
    await fs.mkdir(GRIB2_CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('[NSST] Error creating GRIB2 cache directory:', error);
    throw error;
  }
}

/**
 * Gets the cached GRIB2 file path for a given date
 */
function getCachedGRIB2Path(date: Date): string {
  const dateStr = formatDateString(date);
  return path.join(GRIB2_CACHE_DIR, `nsst.${dateStr}.grb2`);
}

/**
 * Checks if a cached GRIB2 file exists and is recent (within 24 hours)
 */
async function isGRIB2CacheValid(date: Date): Promise<boolean> {
  try {
    const filePath = getCachedGRIB2Path(date);
    const stats = await fs.stat(filePath);
    const age = Date.now() - stats.mtimeMs;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    return age < maxAge;
  } catch {
    return false;
  }
}

/**
 * Fetches NSST data for specified geographic bounds
 * @param bounds - Geographic bounds to fetch data for
 * @returns SST data response with grid points
 */
export async function fetchNSSTData(bounds: GeographicBounds): Promise<SSTDataResponse> {
  console.log('[NSST] ========================================');
  console.log('[NSST] Starting NSST data fetch from NOMADS...');
  console.log(`[NSST] Bounds: ${bounds.minLat}°N-${bounds.maxLat}°N, ${bounds.minLon}°-${bounds.maxLon}°`);
  const startTime = Date.now();
  
  // Step 1: Find latest available NSST date
  console.log('[NSST] Step 1: Finding latest available NSST date...');
  const dataDate = await findLatestAvailableNSSTDate(5);
  if (!dataDate) {
    throw new Error('No NSST data available in the last 5 days');
  }
  
  const dateStr = formatDateString(dataDate);
  console.log(`[NSST] ✓ Found latest NSST data: ${dateStr}`);
  
  // Step 2: Check if we have cached GRIB2 file
  console.log('[NSST] Step 2: Checking GRIB2 cache...');
  await ensureGRIB2CacheDir();
  const cachedGribPath = getCachedGRIB2Path(dataDate);
  let gribFilePath: string;
  
  if (await isGRIB2CacheValid(dataDate)) {
    console.log(`[NSST] ✓ Using cached GRIB2 file: ${cachedGribPath}`);
    gribFilePath = cachedGribPath;
  } else {
    // Step 3: Download GRIB2 subset (only SST variable)
    console.log('[NSST] Step 3: Downloading GRIB2 subset from NOMADS...');
    
    const gribUrl = buildNSSTGrib2Url(dataDate);
    const indexUrl = buildNSSTIndexUrl(dataDate);
    
    console.log(`[NSST]   GRIB2 URL: ${gribUrl}`);
    console.log(`[NSST]   Index URL: ${indexUrl}`);
    
    // Try to find SST variable (try multiple possible names)
    console.log('[NSST]   Searching for SST variable in index...');
    let messages = await fetchAndParseGRIB2Index(indexUrl, 'nsstf', 'surface');
    if (messages.length === 0) {
      console.log('[NSST]   Trying "nsst" variable...');
      messages = await fetchAndParseGRIB2Index(indexUrl, 'nsst', 'surface');
    }
    if (messages.length === 0) {
      console.log('[NSST]   Trying "tmp:surface" variable...');
      messages = await fetchAndParseGRIB2Index(indexUrl, 'tmp', 'surface');
    }
    if (messages.length === 0) {
      console.log('[NSST]   Warning: No specific SST variable found, using first message...');
      // Last resort: get first message
      messages = await fetchAndParseGRIB2Index(indexUrl, '', '');
      if (messages.length > 0) {
        console.warn(`[NSST]   Using first available message as SST: ${messages[0].variable}:${messages[0].level}`);
      }
    }
    
    if (messages.length === 0) {
      throw new Error('No SST variable found in NSST GRIB2 file');
    }
    
    console.log(`[NSST] ✓ Found ${messages.length} SST message(s), downloading subset...`);
    
    // Download subset
    const gribBuffer = await fetchGRIB2Subset(gribUrl, messages);
    const sizeMB = (gribBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log(`[NSST] ✓ Downloaded ${sizeMB} MB GRIB2 subset`);
    
    // Save to cache
    await fs.writeFile(cachedGribPath, Buffer.from(gribBuffer));
    console.log(`[NSST] ✓ Saved GRIB2 subset to cache: ${cachedGribPath}`);
    
    gribFilePath = cachedGribPath;
  }
  
  // Step 4: Parse GRIB2 file with Python script
  console.log('[NSST] Step 4: Parsing GRIB2 file with Python...');
  console.log(`[NSST]   Calling: python3 scripts/extract-nsst-sst.py "${gribFilePath}"`);
  const gridPoints = await parseNSSTGRIB2(gribFilePath, bounds);
  
  const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[NSST] ========================================`);
  console.log(`[NSST] ✓ Successfully fetched ${gridPoints.length} SST points in ${fetchTime}s`);
  console.log(`[NSST]   Data source: NOAA NOMADS NSST`);
  console.log(`[NSST]   Data date: ${dateStr}`);
  console.log(`[NSST] ========================================`);
  
  // Step 5: Return in same format as OISST
  return {
    date: dataDate.toISOString().split('T')[0],
    gridPoints: gridPoints,
    bounds: bounds,
    source: 'NOAA NOMADS NSST',
    pointCount: gridPoints.length
  };
}

