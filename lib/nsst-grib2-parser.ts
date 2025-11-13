/**
 * NSST GRIB2 Parser
 * Wrapper to call Python script for extracting SST data from GRIB2 files
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { SSTGridPoint } from '@/types/sst';
import type { GeographicBounds } from '@/types/geographic';

const execAsync = promisify(exec);

/**
 * Parses a GRIB2 file to extract SST grid points using Python script
 * @param gribFilePath - Path to the GRIB2 file
 * @param bounds - Geographic bounds to filter points
 * @returns Array of SST grid points
 */
export async function parseNSSTGRIB2(
  gribFilePath: string,
  bounds: GeographicBounds
): Promise<SSTGridPoint[]> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'extract-nsst-sst.py');
  
  // Verify script exists
  try {
    await fs.access(scriptPath);
  } catch {
    throw new Error(`Python script not found: ${scriptPath}`);
  }
  
  // Verify GRIB2 file exists
  try {
    await fs.access(gribFilePath);
  } catch {
    throw new Error(`GRIB2 file not found: ${gribFilePath}`);
  }
  
  const boundsJson = JSON.stringify(bounds);
  
  console.log(`[NSST Parser] Extracting SST from GRIB2 file...`);
  console.log(`[NSST Parser]   File: ${gribFilePath}`);
  console.log(`[NSST Parser]   Bounds: ${bounds.minLat}°N-${bounds.maxLat}°N, ${bounds.minLon}°-${bounds.maxLon}°`);
  console.log(`[NSST Parser]   Python script: ${scriptPath}`);
  
  try {
    const pythonStartTime = Date.now();
    
    // Use a temporary file for output to avoid stdout buffer limits
    const tmpOutputPath = path.join(process.cwd(), 'data', 'cache', 'tmp', `nsst-extract-${Date.now()}.json`);
    await fs.mkdir(path.dirname(tmpOutputPath), { recursive: true });
    
    // Run Python script and write output to temp file
    const { stderr } = await execAsync(
      `python3 "${scriptPath}" "${gribFilePath}" '${boundsJson}' > "${tmpOutputPath}"`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for stderr only (stdout goes to file)
    );
    
    const pythonTime = ((Date.now() - pythonStartTime) / 1000).toFixed(2);
    
    // Python script outputs errors to stderr, data to stdout (redirected to file)
    if (stderr) {
      console.log(`[NSST Parser] Python stderr output:`);
      console.log(stderr);
    }
    
    // Read the output file
    const outputText = await fs.readFile(tmpOutputPath, 'utf-8');
    const points: SSTGridPoint[] = JSON.parse(outputText);
    
    // Clean up temp file
    try {
      await fs.unlink(tmpOutputPath);
    } catch {
      // Ignore cleanup errors
    }
    
    console.log(`[NSST Parser] ✓ Python extraction complete in ${pythonTime}s`);
    console.log(`[NSST Parser] ✓ Extracted ${points.length} SST grid points`);
    
    // Log sample points for verification
    if (points.length > 0) {
      const sample = points.slice(0, 3);
      console.log(`[NSST Parser]   Sample points:`, sample.map(p => 
        `${p.lat}°N, ${p.lon}°W: ${p.sst}°C`
      ));
    }
    
    return points;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[NSST Parser] Python script failed: ${errorMessage}`);
    throw new Error(`Failed to parse GRIB2 file: ${errorMessage}`);
  }
}

