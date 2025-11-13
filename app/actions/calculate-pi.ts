'use server';

/**
 * PI Calculation Server Action
 * 
 * Combines NSST SST data with GFS atmospheric profiles and calculates
 * Maximum Potential Intensity (MPI) for all grid points using Emanuel's formula.
 * 
 * Uses Server Actions pattern (not API routes) for consistency with other data fetching.
 */

import { getSSTData } from './sst-data';
import { getAtmosphericData } from './atmospheric-data';
import { calculatePI } from '@/lib/potential-intensity';
import type { PIDataResponse, PIGridPoint } from '@/types/pi';
import type { AtmosphericProfile, RawAtmosphericProfile } from '@/types/atmospheric';
import type { SSTGridPoint } from '@/types/sst';
import type { GeographicBounds } from '@/types/geographic';
import { getPICacheDir, getCachePrefix } from '@/lib/cache-config';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Ensures the PI cache directory exists
 */
async function ensurePICacheDir(): Promise<void> {
  try {
    await fs.mkdir(getPICacheDir(), { recursive: true });
  } catch (error) {
    console.error('[PI Action] Error creating cache directory:', error);
    throw error;
  }
}

/**
 * Gets the cache file path for PI results
 * Cache key: [test-]pi-{sst-date}-{atmospheric-date}.json
 */
function getPICachePath(sstDate: string, atmosphericDate: string): string {
  const prefix = getCachePrefix();
  return path.join(getPICacheDir(), `${prefix}pi-${sstDate}-${atmosphericDate}.json`);
}

/**
 * Checks if PI cache exists and is valid
 * Cache is valid as long as SST and atmospheric data dates match
 */
async function isPICacheValid(sstDate: string, atmosphericDate: string): Promise<boolean> {
  try {
    const cachePath = getPICachePath(sstDate, atmosphericDate);
    await fs.access(cachePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads PI results from cache
 */
async function readPICache(sstDate: string, atmosphericDate: string): Promise<PIDataResponse | null> {
  try {
    const cachePath = getPICachePath(sstDate, atmosphericDate);
    const fileContent = await fs.readFile(cachePath, 'utf-8');
    const cached: PIDataResponse = JSON.parse(fileContent);
    return cached;
  } catch {
    return null;
  }
}

/**
 * Writes PI results to cache
 */
async function writePICache(data: PIDataResponse): Promise<void> {
  await ensurePICacheDir();
  const cachePath = getPICachePath(data.sstDate, data.atmosphericDate);
  await fs.writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[PI Action] Cached PI results: ${cachePath}`);
}

/**
 * Finds the closest atmospheric profile to a given SST point
 * Uses simple Euclidean distance in lat/lon space
 */
function findClosestAtmosphericProfile(
  sstPoint: SSTGridPoint,
  atmosphericProfiles: Array<{ lat: number; lon: number; profile: RawAtmosphericProfile }>
): { lat: number; lon: number; profile: RawAtmosphericProfile } | null {
  if (atmosphericProfiles.length === 0) {
    return null;
  }

  let closest = atmosphericProfiles[0];
  let minDistance = Math.sqrt(
    Math.pow(sstPoint.lat - closest.lat, 2) + Math.pow(sstPoint.lon - closest.lon, 2)
  );

  for (const atmProfile of atmosphericProfiles) {
    const distance = Math.sqrt(
      Math.pow(sstPoint.lat - atmProfile.lat, 2) + Math.pow(sstPoint.lon - atmProfile.lon, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closest = atmProfile;
    }
  }

  return closest;
}

/**
 * Combines SST with atmospheric profile to create complete profile for PI calculation
 */
function combineSSTWithAtmospheric(
  sstPoint: SSTGridPoint,
  rawProfile: RawAtmosphericProfile
): AtmosphericProfile {
  return {
    ...rawProfile,
    sst: sstPoint.sst,
  };
}

/**
 * Calculates PI for all grid points
 * 
 * Fetches SST and atmospheric data, combines them, and calculates PI for each point.
 * Results are cached to avoid recalculation.
 * 
 * @param bounds - Optional geographic bounds (defaults to global)
 * @returns PI calculation results for all grid points
 */
export async function calculatePIData(bounds?: GeographicBounds): Promise<PIDataResponse> {
  try {
    console.log('[PI Action] ========================================');
    console.log('[PI Action] Server Action: calculatePIData() called');
    
    const startTime = Date.now();
    
    // Step 1: Fetch SST data
    console.log('[PI Action] Step 1: Fetching SST data...');
    const sstData = await getSSTData();
    console.log(`[PI Action] ✓ SST data: ${sstData.pointCount} points from ${sstData.date}`);
    
    // Step 2: Determine bounds (use SST bounds if not provided)
    const calculationBounds = bounds || {
      minLat: sstData.bounds.minLat,
      maxLat: sstData.bounds.maxLat,
      minLon: sstData.bounds.minLon,
      maxLon: sstData.bounds.maxLon,
    };
    
    // Step 3: Check cache
    console.log('[PI Action] Step 2: Checking cache...');
    const today = new Date().toISOString().split('T')[0]; // Use today for atmospheric date (simplified)
    if (await isPICacheValid(sstData.date, today)) {
      const cachedData = await readPICache(sstData.date, today);
      if (cachedData) {
        console.log(`[PI Action] ✓ Cache hit: ${cachedData.pointCount} points`);
        console.log(`[PI Action]   SST date: ${cachedData.sstDate}, Atmospheric date: ${cachedData.atmosphericDate}`);
        console.log('[PI Action] ========================================');
        return cachedData;
      }
    }
    
    console.log('[PI Action] Cache miss, calculating PI for all points...');
    
    // Step 4: Fetch atmospheric data for the same bounds
    console.log('[PI Action] Step 3: Fetching atmospheric data...');
    const atmosphericData = await getAtmosphericData(calculationBounds);
    console.log(`[PI Action] ✓ Atmospheric data: ${atmosphericData.pointCount} profiles from ${atmosphericData.date}`);
    
    // Step 5: Calculate PI for each SST point
    console.log('[PI Action] Step 4: Calculating PI for all grid points...');
    const gridPoints: PIGridPoint[] = [];
    let successCount = 0;
    let errorCount = 0;
    const totalPoints = sstData.gridPoints.length;
    
    // Filter SST points to bounds if provided
    const sstPointsInBounds = bounds
      ? sstData.gridPoints.filter(
          (p) =>
            p.lat >= bounds.minLat &&
            p.lat <= bounds.maxLat &&
            p.lon >= bounds.minLon &&
            p.lon <= bounds.maxLon
        )
      : sstData.gridPoints;
    
    for (let i = 0; i < sstPointsInBounds.length; i++) {
      const sstPoint = sstPointsInBounds[i];
      
      // Log progress every 10%
      if (i % Math.max(1, Math.floor(totalPoints / 10)) === 0) {
        const progress = ((i / totalPoints) * 100).toFixed(1);
        console.log(`[PI Action]   Progress: ${progress}% (${i}/${totalPoints})`);
      }
      
      // Find closest atmospheric profile
      const closestAtm = findClosestAtmosphericProfile(sstPoint, atmosphericData.gridPoints);
      
      if (!closestAtm) {
        console.warn(`[PI Action]   Warning: No atmospheric profile found for point ${sstPoint.lat}°N, ${sstPoint.lon}°W`);
        errorCount++;
        continue;
      }
      
      // Combine SST with atmospheric profile
      const completeProfile = combineSSTWithAtmospheric(sstPoint, closestAtm.profile);
      
      // Calculate PI
      try {
        const piResult = calculatePI(completeProfile);
        
        // Create PI grid point
        const piPoint: PIGridPoint = {
          lat: sstPoint.lat,
          lon: sstPoint.lon,
          sst: sstPoint.sst,
          vmax: piResult.vmax,
          pmin: piResult.pmin,
          category: piResult.category,
        };
        
        gridPoints.push(piPoint);
        successCount++;
      } catch (error) {
        console.warn(`[PI Action]   Error calculating PI for point ${sstPoint.lat}°N, ${sstPoint.lon}°W:`, error);
        errorCount++;
      }
    }
    
    const calculationTime = Date.now() - startTime;
    const avgTime = calculationTime / totalPoints;
    
    console.log(`[PI Action] ✓ Calculation complete: ${successCount} successful, ${errorCount} errors`);
    console.log(`[PI Action]   Total time: ${(calculationTime / 1000).toFixed(2)}s`);
    console.log(`[PI Action]   Average time per point: ${avgTime.toFixed(2)}ms`);
    
    // Step 6: Create response
    const response: PIDataResponse = {
      sstDate: sstData.date,
      atmosphericDate: atmosphericData.date,
      gridPoints,
      bounds: calculationBounds,
      pointCount: gridPoints.length,
      metadata: {
        successCount,
        errorCount,
        avgCalculationTime: avgTime,
      },
    };
    
    // Step 7: Cache results
    console.log('[PI Action] Step 5: Caching results...');
    await writePICache(response);
    console.log('[PI Action] ✓ Results cached');
    console.log('[PI Action] ========================================');
    
    return response;
  } catch (error) {
    console.error('[PI Action] Error:', error);
    throw new Error(`Failed to calculate PI: ${error instanceof Error ? error.message : String(error)}`);
  }
}

