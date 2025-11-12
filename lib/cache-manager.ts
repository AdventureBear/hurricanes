import fs from 'fs/promises';
import path from 'path';
import type { SSTDataResponse, CachedSSTData } from '../types/sst';

const CACHE_DIR = path.join(process.cwd(), 'data', 'cache', 'sst');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Ensures the cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('[Cache] Error creating cache directory:', error);
    throw error;
  }
}

/**
 * Generates cache filename from date
 * Format: sst-YYYY-MM-DD.json
 */
function getCacheFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `sst-${year}-${month}-${day}.json`;
}

/**
 * Gets the full path for today's cache file
 */
function getCacheFilePath(date: Date = new Date()): string {
  return path.join(CACHE_DIR, getCacheFilename(date));
}

/**
 * Gets the latest available data date from NOAA (without fetching full data)
 * Returns the date string (YYYY-MM-DD) or null if unable to determine
 */
async function getLatestAvailableDataDate(): Promise<string | null> {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const previousYear = currentYear - 1;
    
    // Try current year first
    let dataYear = currentYear;
    let metadataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${dataYear}.nc.ascii?time`;
    
    let metadataResponse = await fetch(metadataUrl);
    
    // If current year fails, try previous year
    if (!metadataResponse.ok) {
      dataYear = previousYear;
      metadataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${dataYear}.nc.ascii?time`;
      metadataResponse = await fetch(metadataUrl);
    }
    
    if (!metadataResponse.ok) {
      console.log('[Cache] Could not fetch metadata to determine latest date');
      return null;
    }
    
    const metadataText = await metadataResponse.text();
    
    // Parse the time dimension size
    const timeSizeMatch = metadataText.match(/time\[time\s*=\s*(\d+)\]/);
    const timeSize = timeSizeMatch ? parseInt(timeSizeMatch[1]) : 0;
    const maxTimeIndex = timeSize > 0 ? timeSize - 1 : 0;
    
    // Use latest available date (accounting for 2-day lag)
    const timeIndex = Math.max(0, maxTimeIndex - 2);
    
    // Fetch the actual time value
    const timeValueUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${dataYear}.nc.ascii?time[${timeIndex}:1:${timeIndex}]`;
    const timeValueResponse = await fetch(timeValueUrl);
    const timeValueText = await timeValueResponse.text();
    
    // Extract time value - OISST uses days since 1800-01-01 00:00:00 UTC
    const timeValueMatch = timeValueText.match(/time\[1\]\s+([\d.]+)/);
    const daysSince1800 = timeValueMatch ? parseFloat(timeValueMatch[1]) : null;
    
    if (daysSince1800 !== null && !isNaN(daysSince1800)) {
      const baseDate = new Date(Date.UTC(1800, 0, 1, 0, 0, 0, 0));
      const millisecondsSince1800 = daysSince1800 * 24 * 60 * 60 * 1000;
      const dataDate = new Date(baseDate.getTime() + millisecondsSince1800);
      return dataDate.toISOString().split('T')[0];
    }
    
    return null;
  } catch (error) {
    console.error('[Cache] Error fetching latest data date:', error);
    return null;
  }
}

/**
 * Minimum time between checking NOAA for newer data (6 hours)
 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Checks if cache exists and is valid
 * Only checks NOAA if it's been more than CHECK_INTERVAL_MS since last check
 */
export async function isCacheValid(date: Date = new Date()): Promise<boolean> {
  try {
    // Find the most recent cache file (by data date)
    const files = await listCachedFiles();
    let latestCache: CachedSSTData | null = null;
    
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const cached: CachedSSTData = JSON.parse(fileContent);
        
        if (!latestCache || cached.data.date > latestCache.data.date) {
          latestCache = cached;
        }
      } catch (e) {
        // Skip invalid cache files
        continue;
      }
    }
    
    if (!latestCache) {
      console.log('[Cache] No cache files found');
      return false;
    }
    
    const cachedDate = latestCache.data.date;
    const now = Date.now();
    const lastChecked = latestCache.lastChecked || latestCache.timestamp || 0;
    const timeSinceLastCheck = now - lastChecked;
    
    console.log(`[Cache] Found cached data from: ${cachedDate}`);
    console.log(`[Cache] Last checked: ${new Date(lastChecked).toISOString()} (${Math.round(timeSinceLastCheck / (60 * 60 * 1000))} hours ago)`);
    
    // If we checked recently (within CHECK_INTERVAL_MS), don't check again
    if (timeSinceLastCheck < CHECK_INTERVAL_MS) {
      console.log(`[Cache] Using cache - checked recently, skipping NOAA check`);
      return true;
    }
    
    // Only check NOAA if it's been a while since last check
    console.log(`[Cache] Last check was ${Math.round(timeSinceLastCheck / (60 * 60 * 1000))} hours ago, checking NOAA for newer data...`);
    const latestAvailableDate = await getLatestAvailableDataDate();
    
    // Update lastChecked timestamp
    latestCache.lastChecked = now;
    // Write back the updated timestamp
    const cachePath = path.join(CACHE_DIR, latestCache.filename);
    await fs.writeFile(cachePath, JSON.stringify(latestCache, null, 2), 'utf-8');
    
    if (!latestAvailableDate) {
      // If we can't determine latest date, assume cache is still valid
      console.log(`[Cache] Unable to verify latest date, using cache`);
      return true;
    }
    
    // Compare cached date to latest available date
    const isValid = cachedDate >= latestAvailableDate;
    
    if (isValid) {
      console.log(`[Cache] Valid cache: cached date (${cachedDate}) >= latest available (${latestAvailableDate})`);
    } else {
      console.log(`[Cache] Cache is outdated: cached date (${cachedDate}) < latest available (${latestAvailableDate})`);
    }
    
    return isValid;
  } catch (error) {
    // File doesn't exist or other error
    console.log('[Cache] No valid cache found:', error);
    return false;
  }
}

/**
 * Reads SST data from cache
 * Finds the most recent cache file (not necessarily today's)
 */
export async function readCache(date: Date = new Date()): Promise<SSTDataResponse | null> {
  try {
    // Find the most recent cache file (by data date)
    const files = await listCachedFiles();
    let latestCache: CachedSSTData | null = null;
    
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const cached: CachedSSTData = JSON.parse(fileContent);
        
        if (!latestCache || cached.data.date > latestCache.data.date) {
          latestCache = cached;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!latestCache) {
      return null;
    }
    
    console.log(`[Cache] Successfully read cache: ${latestCache.data.pointCount} points from ${latestCache.data.date}`);
    return latestCache.data;
  } catch (error) {
    console.error('[Cache] Error reading cache:', error);
    return null;
  }
}

/**
 * Writes SST data to cache
 * Uses the data date (from NOAA) for the filename, not today's date
 */
export async function writeCache(data: SSTDataResponse, date: Date = new Date()): Promise<void> {
  try {
    await ensureCacheDir();
    
    // Use the data date from NOAA for the filename
    // Parse the date string (YYYY-MM-DD) to create a Date object
    const dataDate = new Date(data.date + 'T00:00:00Z');
    
    const now = Date.now();
    const cached: CachedSSTData = {
      data,
      timestamp: now, // When the cache was written
      lastChecked: now, // When we last checked NOAA (initially same as timestamp)
      filename: getCacheFilename(dataDate),
      dataDate: data.date // Store the actual data date from NOAA
    };
    
    const cachePath = getCacheFilePath(dataDate);
    await fs.writeFile(cachePath, JSON.stringify(cached, null, 2), 'utf-8');
    
    console.log(`[Cache] Successfully wrote cache: ${getCacheFilename(dataDate)} with data from ${data.date} (${data.pointCount} points)`);
  } catch (error) {
    console.error('[Cache] Error writing cache:', error);
    throw error;
  }
}

/**
 * Lists all cached SST files
 */
export async function listCachedFiles(): Promise<string[]> {
  try {
    await ensureCacheDir();
    const files = await fs.readdir(CACHE_DIR);
    return files.filter(f => f.startsWith('sst-') && f.endsWith('.json'));
  } catch (error) {
    console.error('[Cache] Error listing cached files:', error);
    return [];
  }
}

/**
 * Clears all cached files
 */
export async function clearCache(): Promise<number> {
  try {
    const files = await listCachedFiles();
    let deleted = 0;
    
    for (const file of files) {
      await fs.unlink(path.join(CACHE_DIR, file));
      deleted++;
    }
    
    console.log(`[Cache] Cleared ${deleted} cached file(s)`);
    return deleted;
  } catch (error) {
    console.error('[Cache] Error clearing cache:', error);
    return 0;
  }
}

/**
 * Clears old cache files (older than 30 days)
 */
export async function clearOldCache(maxAgeDays: number = 30): Promise<number> {
  try {
    const files = await listCachedFiles();
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
    let deleted = 0;
    
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      const stats = await fs.stat(filePath);
      const age = Date.now() - stats.mtimeMs;
      
      if (age > maxAge) {
        await fs.unlink(filePath);
        deleted++;
        console.log(`[Cache] Deleted old cache file: ${file}`);
      }
    }
    
    console.log(`[Cache] Cleared ${deleted} old cached file(s)`);
    return deleted;
  } catch (error) {
    console.error('[Cache] Error clearing old cache:', error);
    return 0;
  }
}

