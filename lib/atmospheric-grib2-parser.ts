/**
 * Atmospheric GRIB2 Parser
 * 
 * Parses GFS atmospheric data from GRIB2 files using Python script
 * Extracts complete vertical profiles required for Emanuel's PI calculation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { AtmosphericGridPoint, RawAtmosphericProfile } from '@/types/atmospheric';
import type { GeographicBounds } from '@/types/geographic';

const execAsync = promisify(exec);

/**
 * Parses GFS atmospheric GRIB2 file and extracts complete vertical profiles
 * 
 * @param gribFilePath - Path to GRIB2 file
 * @param bounds - Geographic bounds to extract data for
 * @returns Array of atmospheric grid points with complete profiles
 */
export async function parseAtmosphericGRIB2(
  gribFilePath: string,
  bounds: GeographicBounds
): Promise<AtmosphericGridPoint[]> {
  // Check if file exists
  try {
    await fs.access(gribFilePath);
  } catch {
    throw new Error(`GRIB2 file not found: ${gribFilePath}`);
  }
  
  const scriptPath = path.join(process.cwd(), 'scripts', 'extract-atmospheric-data.py');
  const boundsJson = JSON.stringify(bounds);
  
  // Try to use venv Python if available, otherwise fall back to system python3
  const venvPython = path.join(process.cwd(), '.venv', 'bin', 'python');
  let pythonCmd = 'python3';
  try {
    await fs.access(venvPython);
    pythonCmd = venvPython;
    console.log(`[Atmospheric Parser] Using venv Python: ${pythonCmd}`);
  } catch {
    console.log(`[Atmospheric Parser] Using system Python: ${pythonCmd}`);
  }
  
  console.log(`[Atmospheric Parser] Extracting atmospheric profiles from GRIB2 file...`);
  console.log(`[Atmospheric Parser]   File: ${gribFilePath}`);
  console.log(`[Atmospheric Parser]   Bounds: ${bounds.minLat}°N-${bounds.maxLat}°N, ${bounds.minLon}°-${bounds.maxLon}°`);
  console.log(`[Atmospheric Parser]   Python script: ${scriptPath}`);
  
  try {
    const pythonStartTime = Date.now();
    const { stdout, stderr } = await execAsync(
      `"${pythonCmd}" "${scriptPath}" "${gribFilePath}" '${boundsJson}'`,
      { maxBuffer: 100 * 1024 * 1024 } // 100MB buffer for large outputs
    );
    
    const pythonTime = ((Date.now() - pythonStartTime) / 1000).toFixed(2);
    
    // Python script outputs errors to stderr, data to stdout
    if (stderr) {
      console.log(`[Atmospheric Parser] Python stderr output:`);
      console.log(stderr);
    }
    
    interface PythonOutput {
      lat: number;
      lon: number;
      profile: RawAtmosphericProfile; // Raw profile from GFS (no SST)
    }
    
    const rawProfiles: PythonOutput[] = JSON.parse(stdout);
    
    // Convert to AtmosphericGridPoint format
    const gridPoints: AtmosphericGridPoint[] = rawProfiles.map((p: PythonOutput) => ({
      lat: p.lat,
      lon: p.lon,
      profile: p.profile
    }));
    
    console.log(`[Atmospheric Parser] ✓ Python extraction complete in ${pythonTime}s`);
    console.log(`[Atmospheric Parser] ✓ Extracted ${gridPoints.length} atmospheric profiles`);
    
    // Log sample profile for verification
    if (gridPoints.length > 0) {
      const sample = gridPoints[0];
      console.log(`[Atmospheric Parser]   Sample profile: ${sample.lat}°N, ${sample.lon}°W`);
      console.log(`[Atmospheric Parser]     Note: Raw atmospheric profile (no SST - SST comes from NSST)`);
      console.log(`[Atmospheric Parser]     Surface (air): ${sample.profile.surface?.temperature}°C, RH: ${sample.profile.surface?.relativeHumidity}%`);
      console.log(`[Atmospheric Parser]     500mb: ${sample.profile.level_500?.temperature}°C`);
      console.log(`[Atmospheric Parser]     200mb: ${sample.profile.level_200?.temperature}°C`);
    }
    
    return gridPoints;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Atmospheric Parser] Python script failed: ${errorMessage}`);
    throw new Error(`Failed to parse atmospheric GRIB2 file: ${errorMessage}`);
  }
}

