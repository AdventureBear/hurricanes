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
import { createWriteStream } from 'fs';

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
    
    // Fix: Convert pmin from Pascals to millibars if needed (legacy cache issue)
    // If pmin values are > 2000, they're likely in Pascals and need conversion
    const needsConversion = cached.gridPoints.some(p => p.pmin > 2000);
    if (needsConversion) {
      console.log('[PI Action] Converting cached pmin values from Pascals to millibars...');
      cached.gridPoints = cached.gridPoints.map(p => ({
        ...p,
        pmin: p.pmin > 2000 ? p.pmin / 100 : p.pmin
      }));
    }
    
    return cached;
  } catch {
    return null;
  }
}

/**
 * Writes PI results to cache
 * Uses streaming to avoid "Invalid string length" errors with large datasets
 */
async function writePICache(data: PIDataResponse): Promise<void> {
  await ensurePICacheDir();
  const cachePath = getPICachePath(data.sstDate, data.atmosphericDate);
  
  // Use streaming to write large JSON files without hitting string length limits
  const writeStream = createWriteStream(cachePath, { encoding: 'utf-8' });
  
  try {
    // Write JSON incrementally to avoid memory issues
    writeStream.write('{\n');
    writeStream.write(`  "sstDate": ${JSON.stringify(data.sstDate)},\n`);
    writeStream.write(`  "atmosphericDate": ${JSON.stringify(data.atmosphericDate)},\n`);
    writeStream.write(`  "bounds": ${JSON.stringify(data.bounds)},\n`);
    writeStream.write(`  "pointCount": ${data.pointCount},\n`);
    
    // Write metadata if present
    if (data.metadata) {
      writeStream.write(`  "metadata": ${JSON.stringify(data.metadata)},\n`);
    }
    
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
    
    console.log(`[PI Action] Cached PI results: ${cachePath} (${data.pointCount} points)`);
  } catch (error) {
    writeStream.destroy();
    throw error;
  }
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
    
    // Step 3: Fetch atmospheric data first to get the actual date
    // (We need the atmospheric date to check the cache correctly)
    console.log('[PI Action] Step 2: Fetching atmospheric data...');
    const atmosphericData = await getAtmosphericData(calculationBounds);
    console.log(`[PI Action] ✓ Atmospheric data: ${atmosphericData.pointCount} profiles from ${atmosphericData.date}`);
    
    // Step 4: Check cache using actual atmospheric date
    console.log('[PI Action] Step 3: Checking cache...');
    if (await isPICacheValid(sstData.date, atmosphericData.date)) {
      const cachedData = await readPICache(sstData.date, atmosphericData.date);
      if (cachedData) {
        console.log(`[PI Action] ✓ Cache hit: ${cachedData.pointCount} points`);
        console.log(`[PI Action]   SST date: ${cachedData.sstDate}, Atmospheric date: ${cachedData.atmosphericDate}`);
        console.log('[PI Action] ========================================');
        return cachedData;
      }
    }
    
    console.log('[PI Action] Cache miss, calculating PI for all points...');
    
    // Step 5: Calculate PI for each SST point
    console.log('[PI Action] Step 4: Calculating PI for all grid points...');
    const gridPoints: PIGridPoint[] = [];
    let successCount = 0;
    let errorCount = 0;
    const totalPoints = sstData.gridPoints.length;
    
    // Collect ALL calculated values for comprehensive analysis
    // ALL points are suspect - we need to validate physical realism
    interface CalculatedValue {
      lat: number;
      lon: number;
      sst: number;
      vmax: number;
      pmin: number;
      category: string;
      surfaceTemp: number;
      surfaceRH: number | undefined;
      surfacePressure: number;
      level500Temp: number;
      level500RH: number | undefined;
      level200Temp: number;
      theta_e_s: number;
      theta_e_env: number;
      delta_theta_e: number;
      v_max_squared: number;
      issues: string[]; // List of validation issues
    }
    const allCalculatedValues: CalculatedValue[] = [];
    const physicallyImpossible: CalculatedValue[] = [];
    
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
        // Skip points with invalid SST (filter them out instead of throwing)
        if (sstPoint.sst === null || sstPoint.sst === undefined || isNaN(sstPoint.sst) || sstPoint.sst < -2 || sstPoint.sst > 35) {
          errorCount++;
          continue; // Skip invalid SST points
        }
        
        const piResult = calculatePI(completeProfile);
        
        // Collect ALL calculated values and validate physical realism
        const issues: string[] = [];
        
        // Physical validation rules:
        // 1. Hurricanes require SST >= 26.5°C to form and sustain
        // 2. Cat 5 (>=137kt) requires very warm water (>=28°C typically)
        // 3. Cat 4 (>=113kt) requires warm water (>=27°C typically)
        // 4. Cat 3 (>=96kt) requires SST >= 26.5°C
        // 5. Realistic vmax for hurricanes: 34-195kt (record is ~195kt)
        // 6. Realistic pmin: 870-1013mb (lowest recorded ~870mb)
        
        if (piResult.vmax > 195) {
          issues.push(`vmax ${piResult.vmax.toFixed(1)}kt exceeds historical record (~195kt)`);
        }
        if (piResult.pmin < 870) {
          issues.push(`pmin ${piResult.pmin.toFixed(1)}mb below historical record (~870mb)`);
        }
        if (piResult.category === 'Cat5' && sstPoint.sst < 28) {
          issues.push(`Cat5 with SST ${sstPoint.sst.toFixed(1)}°C (requires >=28°C)`);
        }
        if (piResult.category === 'Cat4' && sstPoint.sst < 27) {
          issues.push(`Cat4 with SST ${sstPoint.sst.toFixed(1)}°C (requires >=27°C)`);
        }
        if ((piResult.category === 'Cat3' || piResult.category === 'Cat2' || piResult.category === 'Cat1') && sstPoint.sst < 26.5) {
          issues.push(`${piResult.category} with SST ${sstPoint.sst.toFixed(1)}°C (requires >=26.5°C)`);
        }
        if (piResult.vmax >= 64 && sstPoint.sst < 26.5) {
          // Tropical storm or higher requires warm water
          issues.push(`Tropical storm/hurricane (${piResult.vmax.toFixed(1)}kt) with SST ${sstPoint.sst.toFixed(1)}°C (requires >=26.5°C)`);
        }
        
        const calculated: CalculatedValue = {
          lat: sstPoint.lat,
          lon: sstPoint.lon,
          sst: sstPoint.sst,
          vmax: piResult.vmax,
          pmin: piResult.pmin,
          category: piResult.category,
          surfaceTemp: completeProfile.surface.temperature,
          surfaceRH: completeProfile.surface.relativeHumidity,
          surfacePressure: completeProfile.surface.pressure,
          level500Temp: completeProfile.level_500.temperature,
          level500RH: completeProfile.level_500.relativeHumidity,
          level200Temp: completeProfile.level_200.temperature,
          theta_e_s: piResult.intermediate?.theta_e_s_K || 0,
          theta_e_env: piResult.intermediate?.theta_e_env_K || 0,
          delta_theta_e: piResult.intermediate?.delta_theta_e_K || 0,
          v_max_squared: piResult.intermediate?.v_max_squared || 0,
          issues,
        };
        
        allCalculatedValues.push(calculated);
        if (issues.length > 0) {
          physicallyImpossible.push(calculated);
        }
        
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
    
    // Comprehensive analysis of ALL calculated values
    console.error(`[PI Action] ⚠️⚠️⚠️ COMPREHENSIVE CALCULATION ANALYSIS ⚠️⚠️⚠️`);
    console.error(`[PI Action] Total points calculated: ${allCalculatedValues.length}`);
    console.error(`[PI Action] Points with physical impossibilities: ${physicallyImpossible.length} (${((physicallyImpossible.length / allCalculatedValues.length) * 100).toFixed(1)}%)`);
    
    // Overall statistics
    if (allCalculatedValues.length > 0) {
      const vmaxValues = allCalculatedValues.map(v => v.vmax);
      const pminValues = allCalculatedValues.map(v => v.pmin);
      const sstValues = allCalculatedValues.map(v => v.sst);
      const categories = allCalculatedValues.map(v => v.category);
      
      console.error(`[PI Action] ========== OVERALL STATISTICS ==========`);
      console.error(`[PI Action] Vmax: min=${Math.min(...vmaxValues).toFixed(1)}kt, max=${Math.max(...vmaxValues).toFixed(1)}kt, avg=${(vmaxValues.reduce((a,b) => a+b, 0) / vmaxValues.length).toFixed(1)}kt`);
      console.error(`[PI Action] Pmin: min=${Math.min(...pminValues).toFixed(1)}mb, max=${Math.max(...pminValues).toFixed(1)}mb, avg=${(pminValues.reduce((a,b) => a+b, 0) / pminValues.length).toFixed(1)}mb`);
      console.error(`[PI Action] SST: min=${Math.min(...sstValues).toFixed(1)}°C, max=${Math.max(...sstValues).toFixed(1)}°C, avg=${(sstValues.reduce((a,b) => a+b, 0) / sstValues.length).toFixed(1)}°C`);
      console.error(`[PI Action] Categories: Cat5=${categories.filter(c => c === 'Cat5').length}, Cat4=${categories.filter(c => c === 'Cat4').length}, Cat3=${categories.filter(c => c === 'Cat3').length}, Cat2=${categories.filter(c => c === 'Cat2').length}, Cat1=${categories.filter(c => c === 'Cat1').length}, TS=${categories.filter(c => c === 'TS').length}, TD=${categories.filter(c => c === 'TD').length}`);
    }
    
    // Group by issue type
    const issuesByType: Record<string, CalculatedValue[]> = {};
    physicallyImpossible.forEach(v => {
      v.issues.forEach(issue => {
        if (!issuesByType[issue]) {
          issuesByType[issue] = [];
        }
        issuesByType[issue].push(v);
      });
    });
    
    console.error(`[PI Action] ========== ISSUES BY TYPE ==========`);
    Object.entries(issuesByType).forEach(([issue, values]) => {
      console.error(`[PI Action] "${issue}": ${values.length} occurrences`);
    });
    
    // Show ALL physically impossible values
    if (physicallyImpossible.length > 0) {
      console.error(`[PI Action] ========== ALL PHYSICALLY IMPOSSIBLE VALUES ==========`);
      physicallyImpossible.forEach((v, idx) => {
        console.error(`[PI Action] ${idx + 1}. ${v.lat.toFixed(2)}°N, ${v.lon.toFixed(2)}°W: ${v.category} (${v.vmax.toFixed(1)}kt, ${v.pmin.toFixed(1)}mb) with SST ${v.sst.toFixed(1)}°C`);
        v.issues.forEach(issue => {
          console.error(`[PI Action]    ⚠️ ${issue}`);
        });
        console.error(`[PI Action]    Surface: T=${v.surfaceTemp.toFixed(1)}°C, RH=${v.surfaceRH?.toFixed(1) || 'N/A'}%, P=${v.surfacePressure.toFixed(1)}mb`);
        console.error(`[PI Action]    500mb: T=${v.level500Temp.toFixed(1)}°C, RH=${v.level500RH?.toFixed(1) || 'N/A'}%`);
        console.error(`[PI Action]    200mb: T=${v.level200Temp.toFixed(1)}°C`);
        console.error(`[PI Action]    theta_e_s=${v.theta_e_s.toFixed(1)}K, theta_e_env=${v.theta_e_env.toFixed(1)}K, delta=${v.delta_theta_e.toFixed(1)}K`);
        console.error(`[PI Action]    v_max^2=${v.v_max_squared.toFixed(1)} (m/s)^2`);
      });
    }
    
    console.error(`[PI Action] ⚠️⚠️⚠️ END COMPREHENSIVE ANALYSIS ⚠️⚠️⚠️`);
    
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

