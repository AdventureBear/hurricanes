/**
 * Atmospheric Data Types
 * 
 * These types define the complete vertical atmospheric profile required
 * for Emanuel's Maximum Potential Intensity (MPI) calculation.
 * 
 * References:
 * - Emanuel, K. A. (1986). An air-sea interaction theory for tropical cyclones. Part I: Steady-state maintenance.
 * - Emanuel, K. A. (1988). The maximum intensity of hurricanes.
 * - Emanuel, K. A. (1995). Sensitivity of tropical cyclones to surface exchange coefficients and a revised steady-state model incorporating eye dynamics.
 */

/**
 * Complete vertical atmospheric profile
 * 
 * Contains temperature, relative humidity, and pressure at all standard
 * atmospheric levels required for Emanuel's thermodynamic method.
 * 
 * All temperatures in Celsius
 * All pressures in millibars (mb)
 * Relative humidity as percentage (0-100)
 */
export interface AtmosphericProfile {
  /** Sea surface temperature (Celsius) */
  sst: number;
  
  /** Surface level (typically ~1013 mb) */
  surface: {
    temperature: number; // Celsius
    relativeHumidity: number; // 0-100
    pressure: number; // millibars
  };
  
  /** 1000 mb level */
  level_1000?: {
    temperature: number;
    relativeHumidity: number;
    pressure: number;
  };
  
  /** 850 mb level */
  level_850: {
    temperature: number;
    relativeHumidity: number;
    pressure: number;
  };
  
  /** 700 mb level */
  level_700: {
    temperature: number;
    relativeHumidity: number;
    pressure: number;
  };
  
  /** 500 mb level */
  level_500: {
    temperature: number;
    relativeHumidity: number;
    pressure: number;
  };
  
  /** 400 mb level */
  level_400: {
    temperature: number;
    relativeHumidity: number;
    pressure: number;
  };
  
  /** 300 mb level */
  level_300: {
    temperature: number;
    relativeHumidity: number;
    pressure: number;
  };
  
  /** 250 mb level */
  level_250: {
    temperature: number;
    pressure: number;
  };
  
  /** 200 mb level */
  level_200: {
    temperature: number;
    pressure: number;
  };
  
  /** 150 mb level */
  level_150: {
    temperature: number;
    pressure: number;
  };
  
  /** 100 mb level */
  level_100: {
    temperature: number;
    pressure: number;
  };
}

/**
 * Saffir-Simpson Hurricane Wind Scale categories
 */
export enum HurricaneCategory {
  TROPICAL_DEPRESSION = 'TD', // < 34 knots
  TROPICAL_STORM = 'TS',       // 34-63 knots
  CATEGORY_1 = 'Cat1',         // 64-82 knots
  CATEGORY_2 = 'Cat2',         // 83-95 knots
  CATEGORY_3 = 'Cat3',         // 96-112 knots
  CATEGORY_4 = 'Cat4',         // 113-136 knots
  CATEGORY_5 = 'Cat5'          // ≥ 137 knots
}

/**
 * Calculation metadata for validation and expert review
 * 
 * Contains information about the calculation process, equations used,
 * constants applied, and validation data.
 */
export interface CalculationMetadata {
  /** Equations used (with Emanuel paper references) */
  equations: Array<{
    reference: string; // e.g., "Emanuel 1988, Eq. 15"
    description: string;
  }>;
  
  /** Constants used with their sources */
  constants: Array<{
    name: string;
    value: number;
    units: string;
    source: string;
  }>;
  
  /** Validation information */
  validation?: {
    /** Comparison with published results */
    publishedComparison?: {
      source: string;
      vmax: number;
      pmin: number;
      ourVmax: number;
      ourPmin: number;
      difference: {
        vmaxPercent: number;
        pminPercent: number;
      };
    };
    
    /** Test case information */
    testCase?: string;
  };
  
  /** Any assumptions or approximations made */
  assumptions?: string[];
  
  /** Known limitations */
  limitations?: string[];
}

/**
 * Maximum Potential Intensity (MPI) calculation result
 * 
 * Contains the calculated maximum wind speed, minimum central pressure,
 * hurricane category, and calculation metadata for validation.
 */
export interface PIResult {
  /** Maximum potential wind speed (knots) */
  vmax: number;
  
  /** Minimum potential central pressure (millibars) */
  pmin: number;
  
  /** Saffir-Simpson category */
  category: HurricaneCategory;
  
  /** Calculation metadata for validation and expert review */
  metadata: CalculationMetadata;
  
  /** Optional: Additional intermediate calculation values for debugging */
  intermediate?: {
    [key: string]: number;
  };
}

/**
 * Atmospheric data for a single grid point
 * 
 * Used when fetching atmospheric data for multiple points.
 */
export interface AtmosphericGridPoint {
  lat: number;
  lon: number;
  profile: AtmosphericProfile;
}

/**
 * Response from atmospheric data fetch
 */
export interface AtmosphericDataResponse {
  date: string; // ISO date string
  gridPoints: AtmosphericGridPoint[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  source: string;
  pointCount: number;
}

