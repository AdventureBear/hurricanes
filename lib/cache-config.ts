/**
 * Cache Configuration
 * 
 * Manages cache paths and test mode detection for separating
 * test data from production data.
 */

import * as path from 'path';

/**
 * Test mode detection
 * Set TEST_MODE=true environment variable to enable test mode
 * Test mode uses separate cache directories and 1° resolution bounds
 */
export const TEST_MODE = process.env.TEST_MODE === 'true' || process.env.TEST_MODE === '1';

/**
 * Test bounds: 1° x 1° area for testing
 * Example: 25°N-26°N, -81°W to -80°W (small region in Gulf of Mexico)
 */
export const TEST_BOUNDS = {
  minLat: 25.0,
  maxLat: 26.0,
  minLon: -81.0,
  maxLon: -80.0,
};

/**
 * Production bounds: Full global coverage for hurricane basins
 */
export const PRODUCTION_BOUNDS = {
  minLat: -40,
  maxLat: 60,
  minLon: -180,
  maxLon: 180,
};

/**
 * Gets the SST cache directory (production or test)
 */
export function getSSTCacheDir(): string {
  if (TEST_MODE) {
    return path.join(process.cwd(), 'data', 'cache', 'sst', 'test');
  }
  return path.join(process.cwd(), 'data', 'cache', 'sst');
}

/**
 * Gets the atmospheric cache directory (production or test)
 */
export function getAtmosphericCacheDir(): string {
  if (TEST_MODE) {
    return path.join(process.cwd(), 'data', 'cache', 'atmospheric', 'test');
  }
  return path.join(process.cwd(), 'data', 'cache', 'atmospheric');
}

/**
 * Gets the PI cache directory (production or test)
 */
export function getPICacheDir(): string {
  if (TEST_MODE) {
    return path.join(process.cwd(), 'data', 'cache', 'pi', 'test');
  }
  return path.join(process.cwd(), 'data', 'cache', 'pi');
}

/**
 * Gets the NSST GRIB2 cache directory (production or test)
 */
export function getNSSTGRIB2CacheDir(): string {
  if (TEST_MODE) {
    return path.join(process.cwd(), 'data', 'cache', 'grib2', 'test', 'nsst');
  }
  return path.join(process.cwd(), 'data', 'cache', 'grib2', 'nsst');
}

/**
 * Gets the GFS GRIB2 cache directory (production or test)
 */
export function getGFSGRIB2CacheDir(): string {
  if (TEST_MODE) {
    return path.join(process.cwd(), 'data', 'cache', 'grib2', 'test', 'gfs');
  }
  return path.join(process.cwd(), 'data', 'cache', 'grib2', 'gfs');
}

/**
 * Gets the cache filename prefix (empty for production, "test-" for test)
 */
export function getCachePrefix(): string {
  return TEST_MODE ? 'test-' : '';
}

/**
 * Gets the GRIB2 filename prefix (empty for production, "test-" for test)
 */
export function getGRIB2Prefix(): string {
  return TEST_MODE ? 'test-' : '';
}

