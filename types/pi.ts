/**
 * PI (Potential Intensity) Result Types
 * 
 * Types for PI calculation results that combine SST and atmospheric data.
 */

import type { PIResult, HurricaneCategory } from './atmospheric';
import type { SSTGridPoint } from './sst';

/**
 * PI result for a single grid point
 * 
 * Combines SST data with calculated PI values.
 */
export interface PIGridPoint extends SSTGridPoint {
  /** Maximum potential wind speed (knots) */
  vmax: number;
  
  /** Minimum potential central pressure (millibars) */
  pmin: number;
  
  /** Saffir-Simpson category */
  category: HurricaneCategory;
  
  /** Optional: Calculation metadata for this point */
  metadata?: {
    /** Whether calculation was successful */
    success: boolean;
    /** Error message if calculation failed */
    error?: string;
  };
}

/**
 * PI calculation response
 * 
 * Contains PI results for all grid points.
 */
export interface PIDataResponse {
  /** Date of the SST data used */
  sstDate: string;
  
  /** Date of the atmospheric data used */
  atmosphericDate: string;
  
  /** PI calculation results for each grid point */
  gridPoints: PIGridPoint[];
  
  /** Geographic bounds */
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  
  /** Number of points calculated */
  pointCount: number;
  
  /** Calculation metadata (summary) */
  metadata?: {
    /** Number of successful calculations */
    successCount: number;
    /** Number of failed calculations */
    errorCount: number;
    /** Average calculation time per point (ms) */
    avgCalculationTime?: number;
  };
}

