/**
 * Atmospheric Data Fetcher
 * Fetches complete vertical atmospheric profiles from NOMADS GFS
 * Uses GRIB2 format with selective extraction for efficiency
 * 
 * Note: SST data should come from NSST (separate data source).
 * This fetcher provides the atmospheric profile to be combined with SST.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { AtmosphericDataResponse } from '@/types/atmospheric';
import type { GeographicBounds } from '@/types/geographic';
import { 
  buildGFSGrib2Url, 
  buildGFSIndexUrl, 
  findLatestAvailableGFSDate,
  formatDateString 
} from './gfs-url-builder';
import { fetchAndParseGRIB2Index } from './grib2-index-parser';
import { fetchGRIB2Subset } from './grib2-subset-fetch';
import { parseAtmosphericGRIB2 } from './atmospheric-grib2-parser';

const GRIB2_CACHE_DIR = path.join(process.cwd(), 'data', 'cache', 'grib2', 'gfs');

/**
 * Ensures the GFS GRIB2 cache directory exists
 */
async function ensureGFSGRIB2CacheDir(): Promise<void> {
  try {
    await fs.mkdir(GRIB2_CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('[Atmospheric] Error creating GFS GRIB2 cache directory:', error);
    throw error;
  }
}

/**
 * Gets the cached GFS GRIB2 file path for a given date and forecast hour
 */
function getCachedGFSGRIB2Path(date: Date, forecastHour: string = '000'): string {
  const dateStr = formatDateString(date);
  return path.join(GRIB2_CACHE_DIR, `gfs.${dateStr}.f${forecastHour}.grb2`);
}

/**
 * Checks if a cached GFS GRIB2 file exists and is recent (within 6 hours)
 */
async function isGFSGRIB2CacheValid(date: Date, forecastHour: string = '000'): Promise<boolean> {
  try {
    const filePath = getCachedGFSGRIB2Path(date, forecastHour);
    const stats = await fs.stat(filePath);
    const age = Date.now() - stats.mtimeMs;
    const maxAge = 6 * 60 * 60 * 1000; // 6 hours (matching atmospheric data TTL)
    
    return age < maxAge;
  } catch {
    return false;
  }
}

/**
 * Fetches complete atmospheric profiles for specified geographic bounds
 * 
 * @param bounds - Geographic bounds to fetch data for
 * @returns Atmospheric data response with complete vertical profiles
 */
export async function fetchAtmosphericData(bounds: GeographicBounds): Promise<AtmosphericDataResponse> {
  console.log('[Atmospheric] ========================================');
  console.log('[Atmospheric] Starting atmospheric data fetch from NOMADS GFS...');
  console.log(`[Atmospheric] Bounds: ${bounds.minLat}°N-${bounds.maxLat}°N, ${bounds.minLon}°-${bounds.maxLon}°`);
  const startTime = Date.now();
  
  // Step 1: Find latest available GFS date
  console.log('[Atmospheric] Step 1: Finding latest available GFS date...');
  const dataDate = await findLatestAvailableGFSDate(3);
  if (!dataDate) {
    throw new Error('No GFS data available in the last 3 days');
  }
  
  const dateStr = formatDateString(dataDate);
  const runCycle = '00'; // Use 00Z run
  const resolution = '0p25'; // 0.25 degree resolution
  const forecastHour = '000'; // Analysis (0-hour forecast)
  
  console.log(`[Atmospheric] ✓ Found latest GFS data: ${dateStr}, run: ${runCycle}Z, forecast: f${forecastHour}`);
  
  // Step 2: Check if we have cached GRIB2 file
  console.log('[Atmospheric] Step 2: Checking GFS GRIB2 cache...');
  await ensureGFSGRIB2CacheDir();
  const cachedGribPath = getCachedGFSGRIB2Path(dataDate, forecastHour);
  let gribFilePath: string;
  
  if (await isGFSGRIB2CacheValid(dataDate, forecastHour)) {
    console.log(`[Atmospheric] ✓ Using cached GFS GRIB2 file: ${cachedGribPath}`);
    gribFilePath = cachedGribPath;
  } else {
    // Step 3: Download GRIB2 subset (multiple variables needed)
    console.log('[Atmospheric] Step 3: Downloading GFS GRIB2 subset from NOMADS...');
    
    const gribUrl = buildGFSGrib2Url(dataDate, runCycle, resolution, forecastHour);
    const indexUrl = buildGFSIndexUrl(dataDate, runCycle, resolution, forecastHour);
    
    console.log(`[Atmospheric]   GRIB2 URL: ${gribUrl}`);
    console.log(`[Atmospheric]   Index URL: ${indexUrl}`);
    
    // Find all required variables
    // We need: TMP (temperature) and RH (relative humidity) at multiple levels
    console.log('[Atmospheric]   Searching for required atmospheric variables...');
    
    // Get all TMP messages (temperature at all levels)
    const tmpMessages = await fetchAndParseGRIB2Index(indexUrl, 'TMP', '');
    console.log(`[Atmospheric]   Found ${tmpMessages.length} temperature messages`);
    
    // Get all RH messages (relative humidity at all levels)
    const rhMessages = await fetchAndParseGRIB2Index(indexUrl, 'RH', '');
    console.log(`[Atmospheric]   Found ${rhMessages.length} relative humidity messages`);
    
    // Get surface pressure
    let pressMessages = await fetchAndParseGRIB2Index(indexUrl, 'PRES', 'surface');
    if (pressMessages.length === 0) {
      // Try PRMSL (mean sea level pressure)
      pressMessages = await fetchAndParseGRIB2Index(indexUrl, 'PRMSL', '');
      console.log(`[Atmospheric]   Found ${pressMessages.length} pressure messages (PRMSL)`);
    } else {
      console.log(`[Atmospheric]   Found ${pressMessages.length} pressure messages (PRES)`);
    }
    
    // Combine all messages we need
    const allMessages = [...tmpMessages, ...rhMessages, ...pressMessages];
    
    if (allMessages.length === 0) {
      throw new Error('No atmospheric variables found in GFS GRIB2 file');
    }
    
    console.log(`[Atmospheric] ✓ Found ${allMessages.length} total messages, downloading subset...`);
    
    // Download subset
    const gribBuffer = await fetchGRIB2Subset(gribUrl, allMessages);
    const sizeMB = (gribBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log(`[Atmospheric] ✓ Downloaded ${sizeMB} MB GFS GRIB2 subset`);
    
    // Save to cache
    await fs.writeFile(cachedGribPath, Buffer.from(gribBuffer));
    console.log(`[Atmospheric] ✓ Saved GFS GRIB2 subset to cache: ${cachedGribPath}`);
    
    gribFilePath = cachedGribPath;
  }
  
  // Step 4: Parse GRIB2 file with Python script
  console.log('[Atmospheric] Step 4: Parsing GFS GRIB2 file with Python...');
  console.log(`[Atmospheric]   Calling: python3 scripts/extract-atmospheric-data.py "${gribFilePath}"`);
  const gridPoints = await parseAtmosphericGRIB2(gribFilePath, bounds);
  
  const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[Atmospheric] ========================================`);
  console.log(`[Atmospheric] ✓ Successfully fetched ${gridPoints.length} atmospheric profiles in ${fetchTime}s`);
  console.log(`[Atmospheric]   Data source: NOAA NOMADS GFS`);
  console.log(`[Atmospheric]   Data date: ${dateStr}`);
  console.log(`[Atmospheric] ========================================`);
  
  // Step 5: Return in AtmosphericDataResponse format
  return {
    date: dataDate.toISOString().split('T')[0],
    gridPoints: gridPoints,
    bounds: bounds,
    source: 'NOAA NOMADS GFS',
    pointCount: gridPoints.length
  };
}

