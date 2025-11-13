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
import { getNSSTGRIB2CacheDir, getGRIB2Prefix } from './cache-config';

/**
 * Ensures the GRIB2 cache directory exists
 */
async function ensureGRIB2CacheDir(): Promise<void> {
  try {
    await fs.mkdir(getNSSTGRIB2CacheDir(), { recursive: true });
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
  const prefix = getGRIB2Prefix();
  return path.join(getNSSTGRIB2CacheDir(), `${prefix}nsst.${dateStr}.grb2`);
}

/**
 * Checks if a cached GRIB2 file exists
 * 
 * Note: We check for file existence, not age, because:
 * - GRIB2 files can be reused even if older than 24 hours
 * - The JSON cache has its own TTL validation
 * - If GRIB2 exists, we can parse it to generate/refresh JSON cache
 */
async function isGRIB2CacheValid(date: Date): Promise<boolean> {
  try {
    const filePath = getCachedGRIB2Path(date);
    await fs.access(filePath);
    return true; // File exists, can be used
  } catch {
    return false; // File doesn't exist
  }
}

/**
 * Fetches NSST data for specified geographic bounds
 * @param bounds - Geographic bounds to fetch data for
 * @returns SST data response with grid points
 */
/**
 * Finds any existing cached GRIB2 file (regardless of date)
 * Returns the date of the cached file if found
 */
async function findCachedGRIB2File(): Promise<Date | null> {
  try {
    await ensureGRIB2CacheDir();
    const files = await fs.readdir(getNSSTGRIB2CacheDir());
    const prefix = getGRIB2Prefix();
    const gribFiles = files.filter(f => f.startsWith(`${prefix}nsst.`) && f.endsWith('.grb2'));
    
    if (gribFiles.length === 0) {
      return null;
    }
    
    // Get the most recent file by modification time
    let latestFile: string | null = null;
    let latestTime = 0;
    
    for (const file of gribFiles) {
      const filePath = path.join(getNSSTGRIB2CacheDir(), file);
      const stats = await fs.stat(filePath);
      if (stats.mtimeMs > latestTime) {
        latestTime = stats.mtimeMs;
        latestFile = file;
      }
    }
    
    if (!latestFile) {
      return null;
    }
    
    // Extract date from filename: [test-]nsst.YYYYMMDD.grb2
    const dateMatch = latestFile.match(/(?:test-)?nsst\.(\d{8})\.grb2/);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      return new Date(year, month, day);
    }
    
    return null;
  } catch {
    return null;
  }
}

export async function fetchNSSTData(bounds: GeographicBounds): Promise<SSTDataResponse> {
  console.log('[NSST] ========================================');
  console.log('[NSST] Starting NSST data fetch from NOMADS...');
  console.log(`[NSST] Bounds: ${bounds.minLat}°N-${bounds.maxLat}°N, ${bounds.minLon}°-${bounds.maxLon}°`);
  const startTime = Date.now();
  
  await ensureGRIB2CacheDir();
  let dataDate: Date | null = null;
  let gribFilePath: string;
  
  // Step 1: Check if we have any cached GRIB2 file first
  console.log('[NSST] Step 1: Checking for existing GRIB2 cache...');
  const cachedDate = await findCachedGRIB2File();
  if (cachedDate) {
    const cachedGribPath = getCachedGRIB2Path(cachedDate);
    if (await isGRIB2CacheValid(cachedDate)) {
      console.log(`[NSST] ✓ Found cached GRIB2 file: ${formatDateString(cachedDate)}`);
      dataDate = cachedDate;
      gribFilePath = cachedGribPath;
    }
  }
  
  // Step 2: If no cached GRIB2, try to find latest available NSST date from NOMADS
  if (!dataDate) {
    console.log('[NSST] Step 2: No cached GRIB2 found, checking NOMADS for latest available date...');
    // Check further back (up to 30 days) since NSST data may have longer lag
    dataDate = await findLatestAvailableNSSTDate(30);
    if (!dataDate) {
      throw new Error('No NSST data available in the last 30 days and no cached GRIB2 files found');
    }
    
    const dateStr = formatDateString(dataDate);
    console.log(`[NSST] ✓ Found latest NSST data on NOMADS: ${dateStr}`);
    
    // Step 3: Check if we have cached GRIB2 file for this date
    console.log('[NSST] Step 3: Checking GRIB2 cache for this date...');
    const cachedGribPath = getCachedGRIB2Path(dataDate);
    
    if (await isGRIB2CacheValid(dataDate)) {
      console.log(`[NSST] ✓ Using cached GRIB2 file: ${cachedGribPath}`);
      gribFilePath = cachedGribPath;
    } else {
      // Step 4: Download GRIB2 subset (only SST variable)
      console.log('[NSST] Step 4: Downloading GRIB2 subset from NOMADS...');
    
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
  }
  
  const dateStr = formatDateString(dataDate);
  
  // Step 5: Parse GRIB2 file with Python script
  console.log('[NSST] Step 5: Parsing GRIB2 file with Python...');
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

