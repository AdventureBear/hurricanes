/**
 * Atmospheric Data Server Action
 * 
 * Fetches complete vertical atmospheric profiles from NOMADS GFS
 * for use in Emanuel's Maximum Potential Intensity calculations.
 * 
 * Uses Server Actions pattern (not API routes) for consistency with NSST implementation.
 */

'use server';

import { fetchAtmosphericData } from '@/lib/atmospheric-fetcher';
import { isCacheValid, readCache, writeCache } from '@/lib/cache-manager';
import type { AtmosphericDataResponse } from '@/types/atmospheric';
import type { GeographicBounds } from '@/types/geographic';
import { getAtmosphericCacheDir, getCachePrefix } from '@/lib/cache-config';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';

/**
 * Ensures the atmospheric cache directory exists
 */
async function ensureAtmosphericCacheDir(): Promise<void> {
  try {
    await fs.mkdir(getAtmosphericCacheDir(), { recursive: true });
  } catch (error) {
    console.error('[Atmospheric Action] Error creating cache directory:', error);
    throw error;
  }
}

/**
 * Gets the cache file path for atmospheric data
 */
function getAtmosphericCachePath(date: string): string {
  const prefix = getCachePrefix();
  return path.join(getAtmosphericCacheDir(), `${prefix}atmospheric-${date}.json`);
}

/**
 * Checks if atmospheric cache is valid (6-hour minimum TTL)
 */
async function isAtmosphericCacheValid(date: string): Promise<boolean> {
  try {
    const cachePath = getAtmosphericCachePath(date);
    const stats = await fs.stat(cachePath);
    const age = Date.now() - stats.mtimeMs;
    const maxAge = 6 * 60 * 60 * 1000; // 6 hours
    
    // If fetched within last 20 minutes, use cache without checking
    const recentThreshold = 20 * 60 * 1000; // 20 minutes
    if (age < recentThreshold) {
      console.log(`[Atmospheric Action] Cache is very recent (${Math.round(age / 60000)} min), using without check`);
      return true;
    }
    
    // If less than 6 hours old, use cache
    if (age < maxAge) {
      console.log(`[Atmospheric Action] Cache is valid (${Math.round(age / (60 * 60 * 1000))} hours old)`);
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Reads atmospheric data from cache
 */
async function readAtmosphericCache(date: string): Promise<AtmosphericDataResponse | null> {
  try {
    const cachePath = getAtmosphericCachePath(date);
    const fileContent = await fs.readFile(cachePath, 'utf-8');
    const cached: AtmosphericDataResponse = JSON.parse(fileContent);
    return cached;
  } catch {
    return null;
  }
}

/**
 * Writes atmospheric data to cache
 * Uses streaming to avoid "Invalid string length" errors with large datasets
 */
async function writeAtmosphericCache(data: AtmosphericDataResponse): Promise<void> {
  await ensureAtmosphericCacheDir();
  const cachePath = getAtmosphericCachePath(data.date);
  
  // Use streaming to write large JSON files without hitting string length limits
  const writeStream = createWriteStream(cachePath, { encoding: 'utf-8' });
  
  try {
    // Write JSON incrementally to avoid memory issues
    writeStream.write('{\n');
    writeStream.write(`  "date": ${JSON.stringify(data.date)},\n`);
    writeStream.write(`  "source": ${JSON.stringify(data.source)},\n`);
    writeStream.write(`  "bounds": ${JSON.stringify(data.bounds)},\n`);
    writeStream.write(`  "pointCount": ${data.pointCount},\n`);
    writeStream.write(`  "gridPoints": [\n`);
    
    // Write grid points one by one
    for (let i = 0; i < data.gridPoints.length; i++) {
      const point = data.gridPoints[i];
      const isLast = i === data.gridPoints.length - 1;
      writeStream.write(`    ${JSON.stringify(point)}${isLast ? '' : ','}\n`);
    }
    
    writeStream.write('  ]\n');
    writeStream.write('}\n');
    
    // Close the stream
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });
    
    console.log(`[Atmospheric Action] Cached atmospheric data: ${cachePath} (${data.pointCount} points)`);
  } catch (error) {
    writeStream.destroy();
    throw error;
  }
}

/**
 * Gets complete atmospheric profiles for specified bounds
 * 
 * Uses cache if available and valid (6-hour minimum TTL, respects 20-minute recent fetch).
 * 
 * @param bounds - Geographic bounds to fetch data for
 * @returns Atmospheric data response with complete vertical profiles
 */
export async function getAtmosphericData(bounds: GeographicBounds): Promise<AtmosphericDataResponse> {
  try {
    console.log('[Atmospheric Action] ========================================');
    console.log('[Atmospheric Action] Server Action: getAtmosphericData() called');
    console.log('[Atmospheric Action] Data source: NOAA NOMADS GFS (GRIB2)');
    console.log(`[Atmospheric Action] Bounds: ${bounds.minLat}°N-${bounds.maxLat}°N, ${bounds.minLon}°-${bounds.maxLon}°`);
    
    // For now, use today's date for cache key
    // In the future, we should match the actual GFS data date
    const today = new Date().toISOString().split('T')[0];
    
    // Check cache first
    console.log('[Atmospheric Action] Checking cache...');
    if (await isAtmosphericCacheValid(today)) {
      console.log('[Atmospheric Action] ✓ Cache valid, reading from cache...');
      const cachedData = await readAtmosphericCache(today);
      
      if (cachedData) {
        console.log(`[Atmospheric Action] ✓ Returning cached data: ${cachedData.pointCount} profiles from ${cachedData.date}`);
        console.log(`[Atmospheric Action]   Source: ${cachedData.source}`);
        console.log('[Atmospheric Action] ========================================');
        return cachedData;
      }
    }
    
    // Cache miss or invalid - fetch fresh GFS data
    console.log('[Atmospheric Action] Cache miss or invalid, fetching fresh GFS atmospheric data...');
    const data = await fetchAtmosphericData(bounds);
    
    // Cache the result
    console.log('[Atmospheric Action] Caching fetched data...');
    await writeAtmosphericCache(data);
    console.log(`[Atmospheric Action] ✓ Cached ${data.pointCount} profiles from ${data.date}`);
    console.log('[Atmospheric Action] ========================================');
    
    return data;
  } catch (error) {
    console.error('[Atmospheric Action] Error:', error);
    throw new Error(`Failed to fetch atmospheric data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

