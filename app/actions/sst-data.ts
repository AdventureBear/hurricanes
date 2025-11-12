'use server';

/**
 * Server Action: Get SST Data
 * Fetches Sea Surface Temperature data from NOMADS NSST (GRIB2)
 * Uses caching to avoid repeated downloads
 */

import { fetchNSSTData } from '@/lib/nsst-fetcher';
import { isCacheValid, readCache, writeCache } from '@/lib/cache-manager';
import type { SSTDataResponse } from '@/types/sst';

/**
 * Gets SST data for all basins (global coverage)
 * Uses cache if available and valid, otherwise fetches from NOMADS NSST
 * 
 * @returns SST data response with grid points
 */
export async function getSSTData(): Promise<SSTDataResponse> {
  try {
    console.log('[SST Action] ========================================');
    console.log('[SST Action] Server Action: getSSTData() called');
    console.log('[SST Action] Data source: NOAA NOMADS NSST (GRIB2)');
    
    // Global bounds covering all hurricane basins
    const globalBounds = {
      minLat: -40,
      maxLat: 60,
      minLon: -180,
      maxLon: 180
    };
    
    // Check cache first
    console.log('[SST Action] Checking cache...');
    if (await isCacheValid()) {
      console.log('[SST Action] ✓ Cache valid, reading from cache...');
      const cachedData = await readCache();
      
      if (cachedData) {
        console.log(`[SST Action] ✓ Returning cached data: ${cachedData.pointCount} points from ${cachedData.date}`);
        console.log(`[SST Action]   Source: ${cachedData.source}`);
        console.log('[SST Action] ========================================');
        return cachedData;
      }
    }
    
    // Cache miss or invalid - fetch fresh NSST data
    console.log('[SST Action] Cache miss or invalid, fetching fresh NSST data...');
    const data = await fetchNSSTData(globalBounds);
    
    // Cache the result
    console.log('[SST Action] Caching fetched data...');
    await writeCache(data);
    console.log(`[SST Action] ✓ Cached ${data.pointCount} points from ${data.date}`);
    console.log('[SST Action] ========================================');
    
    return data;
  } catch (error) {
    console.error('[SST Action] Error:', error);
    throw new Error(`Failed to fetch SST data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

