import fs from 'fs/promises';
import path from 'path';
import type { SSTDataResponse, CachedSSTData } from '../types/sst';
import { getSSTCacheDir, getCachePrefix } from './cache-config';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Gets the cache directory (production or test based on TEST_MODE)
 */
function getCACHE_DIR(): string {
  return getSSTCacheDir();
}

/**
 * Ensures the cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(getCACHE_DIR(), { recursive: true });
  } catch (error) {
    console.error('[Cache] Error creating cache directory:', error);
    throw error;
  }
}

/**
 * Generates cache filename from date
 * Format: [test-]sst-YYYY-MM-DD.json
 */
function getCacheFilename(date: Date = new Date()): string {
  const prefix = getCachePrefix();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${prefix}sst-${year}-${month}-${day}.json`;
}

/**
 * Gets the full path for today's cache file
 */
function getCacheFilePath(date: Date = new Date()): string {
  return path.join(getCACHE_DIR(), getCacheFilename(date));
}

/**
 * Gets the latest available NSST data date from NOMADS
 * Returns the date string (YYYY-MM-DD) or null if unable to determine
 * NOTE: This is a lightweight check, not a full data fetch
 * 
 * DEPRECATED: This function is no longer used since NSST date detection
 * is handled in nsst-url-builder.ts. Kept for reference only.
 */
async function getLatestAvailableDataDate(): Promise<string | null> {
  // NSST date detection is now handled in nsst-url-builder.ts
  // This function is deprecated and should not be called
  console.log('[Cache] getLatestAvailableDataDate() is deprecated - NSST date detection handled elsewhere');
  return null;
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
      const filePath = path.join(getCACHE_DIR(), file);
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
    // Use lastChecked if it exists, otherwise use timestamp (for old cache files)
    // If neither exists, set it to now to avoid always checking
    const lastChecked = latestCache.lastChecked ?? latestCache.timestamp ?? now;
    const timeSinceLastCheck = now - lastChecked;
    
    console.log(`[Cache] Found cached data from: ${cachedDate}`);
    console.log(`[Cache] Last checked: ${new Date(lastChecked).toISOString()} (${Math.round(timeSinceLastCheck / (60 * 60 * 1000))} hours ago)`);
    
    // If we checked recently (within CHECK_INTERVAL_MS), don't check again
    if (timeSinceLastCheck < CHECK_INTERVAL_MS) {
      console.log(`[Cache] Using cache - checked ${Math.round(timeSinceLastCheck / (60 * 60 * 1000))} hours ago, skipping NOAA check`);
      
      // Update lastChecked if it wasn't set (for old cache files)
      if (!latestCache.lastChecked) {
        latestCache.lastChecked = now;
        const cachePath = path.join(getCACHE_DIR(), latestCache.filename);
        await fs.writeFile(cachePath, JSON.stringify(latestCache, null, 2), 'utf-8');
      }
      
      return true;
    }
    
    // For NSST, date checking is handled in nsst-fetcher.ts
    // We just check if cache is less than 24 hours old
    console.log(`[Cache] Last check was ${Math.round(timeSinceLastCheck / (60 * 60 * 1000))} hours ago`);
    console.log(`[Cache] NSST date checking handled by nsst-fetcher.ts - using cache age validation only`);
    
    // Update lastChecked timestamp
    latestCache.lastChecked = now;
    // Write back the updated timestamp
    const cachePath = path.join(getCACHE_DIR(), latestCache.filename);
    await fs.writeFile(cachePath, JSON.stringify(latestCache, null, 2), 'utf-8');
    
    // For NSST, cache is valid if it's less than 24 hours old
    const cacheAge = now - latestCache.timestamp;
    const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (cacheAge >= maxCacheAge) {
      console.log(`[Cache] Cache is ${Math.round(cacheAge / (60 * 60 * 1000))} hours old, invalidating`);
      return false;
    }
    
    console.log(`[Cache] Cache is valid (${Math.round(cacheAge / (60 * 60 * 1000))} hours old)`);
    return true;
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
      const filePath = path.join(getCACHE_DIR(), file);
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
    const files = await fs.readdir(getCACHE_DIR());
    const prefix = getCachePrefix();
    return files.filter(f => f.startsWith(`${prefix}sst-`) && f.endsWith('.json'));
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
      await fs.unlink(path.join(getCACHE_DIR(), file));
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
      const filePath = path.join(getCACHE_DIR(), file);
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

