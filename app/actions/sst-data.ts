'use server';

/**
 * Server Action: Get SST Data
 * Fetches Sea Surface Temperature data from NOMADS NSST (GRIB2)
 * Uses caching to avoid repeated downloads
 */

import { fetchNSSTData } from '@/lib/nsst-fetcher';
import { isCacheValid, readCache, writeCache } from '@/lib/cache-manager';
import { TEST_BOUNDS, PRODUCTION_BOUNDS, TEST_MODE } from '@/lib/cache-config';
import type { SSTDataResponse } from '@/types/sst';

/**
 * Gets SST data for all basins (global coverage) or test region (1° x 1°)
 * Uses cache if available and valid, otherwise fetches from NOMADS NSST
 * 
 * Test mode: Set TEST_MODE=true environment variable to use 1° x 1° test bounds
 * Production mode: Uses full global coverage (-40°N to 60°N, -180° to 180°)
 * 
 * @returns SST data response with grid points
 */
export async function getSSTData(): Promise<SSTDataResponse> {
  try {
    console.log('[SST Action] ========================================');
    console.log('[SST Action] Server Action: getSSTData() called');
    console.log(`[SST Action] Mode: ${TEST_MODE ? 'TEST (1° x 1° bounds)' : 'PRODUCTION (global coverage)'}`);
    console.log('[SST Action] Data source: NOAA NOMADS NSST (GRIB2)');
    
    // Use test bounds if in test mode, otherwise use production bounds
    const bounds = TEST_MODE ? TEST_BOUNDS : PRODUCTION_BOUNDS;
    
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
    const data = await fetchNSSTData(bounds);
    
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

