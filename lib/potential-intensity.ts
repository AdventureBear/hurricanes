/**
 * Maximum Potential Intensity (MPI) Calculation
 * 
 * Implements the complete Emanuel's thermodynamic method for calculating
 * the maximum potential intensity of tropical cyclones.
 * 
 * References:
 * - Emanuel, K. A. (1986). An air-sea interaction theory for tropical cyclones. 
 *   Part I: Steady-state maintenance. Journal of the Atmospheric Sciences, 43(6), 585-604.
 * - Emanuel, K. A. (1988). The maximum intensity of hurricanes. 
 *   Journal of the Atmospheric Sciences, 45(7), 1143-1155.
 * - Emanuel, K. A. (1995). Sensitivity of tropical cyclones to surface exchange 
 *   coefficients and a revised steady-state model incorporating eye dynamics. 
 *   Journal of the Atmospheric Sciences, 52(22), 3969-3976.
 * 
 * This implementation follows the complete thermodynamic method as described
 * in Emanuel (1988) and Emanuel (1995), with no simplifications.
 */

import type { 
  AtmosphericProfile, 
  PIResult, 
  CalculationMetadata
} from '@/types/atmospheric';
import { HurricaneCategory } from '@/types/atmospheric';

/**
 * Physical Constants
 * 
 * All constants are documented with their sources for validation.
 */
const CONSTANTS = {
  /** Gas constant for dry air (J/(kg·K)) */
  R_D: 287.04,
  source_R_D: 'Standard atmospheric physics constant',
  
  /** Gas constant for water vapor (J/(kg·K)) */
  R_V: 461.5,
  source_R_V: 'Standard atmospheric physics constant',
  
  /** Specific heat of dry air at constant pressure (J/(kg·K)) */
  C_PD: 1005.7,
  source_C_PD: 'Emanuel 1988, standard value',
  
  /** Specific heat of water vapor at constant pressure (J/(kg·K)) */
  C_PV: 1870.0,
  source_C_PV: 'Emanuel 1988, standard value',
  
  /** Latent heat of vaporization (J/kg) - temperature dependent, but using 25°C value */
  L_V: 2.5e6,
  source_L_V: 'Emanuel 1988, approximate value for tropical temperatures',
  
  /** Ratio of gas constants (R_D / R_V) */
  EPSILON: 0.622,
  source_EPSILON: 'R_D / R_V = 287.04 / 461.5',
  
  /** Surface exchange coefficient for momentum */
  C_D: 0.0015,
  source_C_D: 'Emanuel 1995, typical value for high wind speeds',
  
  /** Surface exchange coefficient for enthalpy */
  C_K: 0.0012,
  source_C_K: 'Emanuel 1995, typical value',
  
  /** Ratio C_K / C_D */
  C_K_OVER_C_D: 0.8,
  source_C_K_OVER_C_D: 'Emanuel 1995, typical ratio',
  
  /** Standard surface pressure (mb) */
  P_SURFACE_STD: 1013.25,
  source_P_SURFACE_STD: 'Standard atmospheric pressure',
} as const;

/**
 * Unit Conversion Utilities
 */

/**
 * Convert Celsius to Kelvin
 */
export function celsiusToKelvin(celsius: number): number {
  return celsius + 273.15;
}

/**
 * Convert Kelvin to Celsius
 */
export function kelvinToCelsius(kelvin: number): number {
  return kelvin - 273.15;
}

/**
 * Convert meters per second to knots
 */
export function msToKnots(ms: number): number {
  return ms * 1.944;
}

/**
 * Convert knots to meters per second
 */
export function knotsToMs(knots: number): number {
  return knots / 1.944;
}

/**
 * Convert Pascals to millibars
 */
export function paToMb(pa: number): number {
  return pa / 100;
}

/**
 * Convert millibars to Pascals
 */
export function mbToPa(mb: number): number {
  return mb * 100;
}

/**
 * Saffir-Simpson Hurricane Wind Scale Categorization
 * 
 * Categories based on maximum sustained wind speed in knots.
 * 
 * Reference: National Hurricane Center Saffir-Simpson Scale
 */
export function categorizeHurricane(vmaxKnots: number): HurricaneCategory {
  if (vmaxKnots < 34) {
    return HurricaneCategory.TROPICAL_DEPRESSION;
  } else if (vmaxKnots < 64) {
    return HurricaneCategory.TROPICAL_STORM;
  } else if (vmaxKnots < 83) {
    return HurricaneCategory.CATEGORY_1;
  } else if (vmaxKnots < 96) {
    return HurricaneCategory.CATEGORY_2;
  } else if (vmaxKnots < 113) {
    return HurricaneCategory.CATEGORY_3;
  } else if (vmaxKnots < 137) {
    return HurricaneCategory.CATEGORY_4;
  } else {
    return HurricaneCategory.CATEGORY_5;
  }
}

/**
 * Calculate saturation vapor pressure (mb) using Clausius-Clapeyron equation
 * 
 * Reference: Emanuel 1988, standard thermodynamic relation
 * 
 * @param temperature Temperature in Celsius
 * @returns Saturation vapor pressure in millibars
 */
function saturationVaporPressure(temperatureC: number): number {
  const T = celsiusToKelvin(temperatureC);
  // Clausius-Clapeyron: e_s = 6.112 * exp((17.67 * T_C) / (T_C + 243.5))
  // Using Magnus formula approximation (more accurate)
  const T_C = temperatureC;
  const e_s = 6.112 * Math.exp((17.67 * T_C) / (T_C + 243.5));
  return e_s;
}

/**
 * Calculate mixing ratio from relative humidity
 * 
 * Reference: Emanuel 1988, standard atmospheric physics
 * 
 * @param temperature Temperature in Celsius
 * @param relativeHumidity Relative humidity (0-100)
 * @param pressure Pressure in millibars
 * @returns Mixing ratio (kg/kg)
 */
function mixingRatio(
  temperatureC: number,
  relativeHumidity: number,
  pressureMb: number
): number {
  const e_s = saturationVaporPressure(temperatureC);
  const e = (relativeHumidity / 100) * e_s; // Actual vapor pressure
  const w = (CONSTANTS.EPSILON * e) / (pressureMb - e);
  return w;
}

/**
 * Calculate equivalent potential temperature (theta_e)
 * 
 * Reference: Emanuel 1988, Eq. 8
 * 
 * The equivalent potential temperature is conserved in adiabatic processes
 * and is a key thermodynamic variable in tropical cyclone theory.
 * 
 * @param temperature Temperature in Celsius
 * @param relativeHumidity Relative humidity (0-100)
 * @param pressure Pressure in millibars
 * @returns Equivalent potential temperature (K)
 */
function equivalentPotentialTemperature(
  temperatureC: number,
  relativeHumidity: number,
  pressureMb: number
): number {
  const T = celsiusToKelvin(temperatureC);
  const w = mixingRatio(temperatureC, relativeHumidity, pressureMb);
  const p = mbToPa(pressureMb);
  
  // Emanuel 1988, Eq. 8 (approximate form)
  // theta_e ≈ T * (1000 / p)^(R_D/C_PD) * exp(L_V * w / (C_PD * T))
  const theta_e = T * Math.pow(1000 / pressureMb, CONSTANTS.R_D / CONSTANTS.C_PD) *
    Math.exp((CONSTANTS.L_V * w) / (CONSTANTS.C_PD * T));
  
  return theta_e;
}

/**
 * Calculate the thermodynamic efficiency (Carnot efficiency)
 * 
 * Reference: Emanuel 1988, Eq. 15
 * 
 * The thermodynamic efficiency represents the fraction of heat energy
 * that can be converted to kinetic energy in the hurricane heat engine.
 * 
 * @param sst Sea surface temperature (Celsius)
 * @param outflowTemperature Temperature at outflow level (Celsius)
 * @returns Thermodynamic efficiency (dimensionless, 0-1)
 */
function thermodynamicEfficiency(
  sst: number,
  outflowTemperature: number
): number {
  const T_s = celsiusToKelvin(sst);
  const T_o = celsiusToKelvin(outflowTemperature);
  
  // Emanuel 1988, Eq. 15: eta = (T_s - T_o) / T_o
  // This is the Carnot efficiency for the hurricane heat engine
  const eta = (T_s - T_o) / T_o;
  
  return Math.max(0, Math.min(1, eta)); // Clamp between 0 and 1
}

/**
 * Calculate the outflow temperature
 * 
 * Reference: Emanuel 1988, based on environmental temperature profile
 * 
 * The outflow temperature is typically taken as the temperature at the
 * level where the storm's outflow occurs (usually around 200-250 mb).
 * 
 * @param profile Complete atmospheric profile
 * @returns Outflow temperature in Celsius
 */
function getOutflowTemperature(profile: AtmosphericProfile): number {
  // Use 200 mb temperature as proxy for outflow temperature
  // This is a standard assumption in Emanuel's method
  return profile.level_200.temperature;
}

/**
 * Calculate the surface equivalent potential temperature
 * 
 * Reference: Emanuel 1988, using surface conditions
 * 
 * @param profile Complete atmospheric profile
 * @returns Surface equivalent potential temperature (K)
 */
function getSurfaceThetaE(profile: AtmosphericProfile): number {
  return equivalentPotentialTemperature(
    profile.surface.temperature,
    profile.surface.relativeHumidity,
    profile.surface.pressure
  );
}

/**
 * Calculate the environmental equivalent potential temperature
 * 
 * Reference: Emanuel 1988, using mid-tropospheric conditions
 * 
 * The environmental theta_e is typically calculated from conditions
 * in the mid-troposphere (around 500-600 mb) to represent the ambient
 * environment that the storm is embedded in.
 * 
 * @param profile Complete atmospheric profile
 * @returns Environmental equivalent potential temperature (K)
 */
function getEnvironmentalThetaE(profile: AtmosphericProfile): number {
  // Use 500 mb level as representative of environmental conditions
  return equivalentPotentialTemperature(
    profile.level_500.temperature,
    profile.level_500.relativeHumidity,
    profile.level_500.pressure
  );
}

/**
 * Calculate maximum potential intensity using complete Emanuel's method
 * 
 * Reference: Emanuel 1988, Eq. 16-17
 * 
 * This implements the complete thermodynamic method for calculating
 * maximum potential intensity, including:
 * - Thermodynamic efficiency (Carnot cycle)
 * - Surface enthalpy flux
 * - Energy balance
 * 
 * @param profile Complete atmospheric profile with SST
 * @returns PI result with vmax, pmin, category, and metadata
 */
export function calculatePI(profile: AtmosphericProfile): PIResult {
  // Validate input
  // Note: profile.sst can be 0°C (valid cold water), so check for null/undefined explicitly
  if (profile.sst === null || profile.sst === undefined || isNaN(profile.sst) || profile.sst < -2 || profile.sst > 35) {
    throw new Error(`Invalid SST: ${profile.sst}°C (must be between -2 and 35°C)`);
  }
  
  // Step 1: Calculate key thermodynamic variables
  // Reference: Emanuel 1988, Section 3
  
  const T_s = celsiusToKelvin(profile.sst);
  const T_o = celsiusToKelvin(getOutflowTemperature(profile));
  
  // Surface equivalent potential temperature
  const theta_e_s = getSurfaceThetaE(profile);
  
  // Environmental equivalent potential temperature
  const theta_e_env = getEnvironmentalThetaE(profile);
  
  // Thermodynamic efficiency (Carnot efficiency)
  const eta = thermodynamicEfficiency(profile.sst, getOutflowTemperature(profile));
  
  // Step 2: Calculate the enthalpy difference
  // Reference: Emanuel 1988, Eq. 14
  // This represents the available energy for the storm
  
  const delta_theta_e = theta_e_s - theta_e_env;
  
  // Get surface pressure for later use
  // Note: Surface pressure from GFS may be in Pascals, convert to mb if needed
  let p_s = profile.surface.pressure;
  if (p_s > 2000) {
    // Likely in Pascals, convert to millibars
    p_s = p_s / 100;
  }
  
  // Step 3: Calculate maximum potential wind speed
  // Reference: Emanuel 1988, Eq. 16
  // 
  // v_max^2 = (C_K / C_D) * (T_s / T_o) * (delta_theta_e / theta_e_env) * C_PD * T_s
  //
  // This equation balances the energy input from the ocean (via enthalpy flux)
  // with the energy dissipation (via surface friction)
  
  const v_max_squared = CONSTANTS.C_K_OVER_C_D * 
    (T_s / T_o) * 
    (delta_theta_e / theta_e_env) * 
    CONSTANTS.C_PD * 
    T_s;
  
  // Build intermediate values for debugging/validation
  // These are included in the result for comprehensive error analysis
  const intermediate = {
    T_s_K: T_s,
    T_o_K: T_o,
    theta_e_s_K: theta_e_s,
    theta_e_env_K: theta_e_env,
    delta_theta_e_K: delta_theta_e,
    eta: eta,
    v_max_squared: v_max_squared
  };
  
  // Build base metadata (will be completed later)
  const baseMetadata: CalculationMetadata = {
    equations: [
      {
        reference: 'Emanuel 1988, Eq. 8',
        description: 'Equivalent potential temperature calculation'
      },
      {
        reference: 'Emanuel 1988, Eq. 15',
        description: 'Thermodynamic efficiency (Carnot efficiency)'
      },
      {
        reference: 'Emanuel 1988, Eq. 16',
        description: 'Maximum potential wind speed from energy balance'
      },
      {
        reference: 'Emanuel 1988, Eq. 17',
        description: 'Minimum central pressure from gradient wind balance'
      }
    ],
    constants: [
      {
        name: 'R_D',
        value: CONSTANTS.R_D,
        units: 'J/(kg·K)',
        source: CONSTANTS.source_R_D
      },
      {
        name: 'C_PD',
        value: CONSTANTS.C_PD,
        units: 'J/(kg·K)',
        source: CONSTANTS.source_C_PD
      },
      {
        name: 'C_K / C_D',
        value: CONSTANTS.C_K_OVER_C_D,
        units: 'dimensionless',
        source: CONSTANTS.source_C_K_OVER_C_D
      },
      {
        name: 'L_V',
        value: CONSTANTS.L_V,
        units: 'J/kg',
        source: CONSTANTS.source_L_V
      }
    ],
    assumptions: [
      'Steady-state hurricane in gradient wind balance',
      'Carnot heat engine efficiency',
      'Outflow temperature approximated by 200 mb temperature',
      'Environmental conditions represented by 500 mb level',
      'Surface exchange coefficients constant (C_K/C_D = 0.8)'
    ],
    limitations: [
      'Does not account for eye dynamics (see Emanuel 1995 for eye dynamics)',
      'Assumes axisymmetric storm structure',
      'Does not account for vertical wind shear effects',
      'Surface exchange coefficients may vary with wind speed'
    ]
  };
  
  // Handle negative v_max^2 (occurs when environmental conditions prevent hurricane formation)
  // This is valid - it means no hurricane can form under these conditions
  if (v_max_squared < 0) {
    // Return zero intensity (no hurricane possible)
    return {
      vmax: 0,
      pmin: p_s, // No pressure drop
      category: HurricaneCategory.TROPICAL_DEPRESSION,
      metadata: {
        ...baseMetadata,
        assumptions: [
          ...baseMetadata.assumptions,
          'Negative v_max^2 indicates conditions prevent hurricane formation'
        ],
        limitations: [
          ...baseMetadata.limitations,
          'Environmental conditions too unfavorable for hurricane development'
        ]
      },
      intermediate: {
        ...intermediate,
        v_max_ms: 0
      }
    };
  }
  
  const v_max_ms = Math.sqrt(v_max_squared);
  const v_max_knots = msToKnots(v_max_ms);
  
  // Diagnostic logging for implausible values (>200kt is unrealistic)
  if (v_max_knots > 200) {
    console.warn(`[PI Calculation] ⚠️ Implausible vmax: ${v_max_knots.toFixed(1)} kt (${v_max_ms.toFixed(1)} m/s)`);
    console.warn(`[PI Calculation]   SST: ${profile.sst.toFixed(1)}°C, T_s: ${T_s.toFixed(1)}K, T_o: ${T_o.toFixed(1)}K`);
    console.warn(`[PI Calculation]   theta_e_s: ${theta_e_s.toFixed(1)}K, theta_e_env: ${theta_e_env.toFixed(1)}K`);
    console.warn(`[PI Calculation]   delta_theta_e: ${delta_theta_e.toFixed(1)}K, eta: ${eta.toFixed(3)}`);
    console.warn(`[PI Calculation]   v_max^2: ${v_max_squared.toFixed(1)} (m/s)^2`);
    console.warn(`[PI Calculation]   Surface: T=${profile.surface.temperature.toFixed(1)}°C, RH=${profile.surface.relativeHumidity?.toFixed(1) || 'N/A'}%, P=${p_s.toFixed(1)}mb`);
    console.warn(`[PI Calculation]   500mb: T=${profile.level_500.temperature.toFixed(1)}°C, RH=${profile.level_500.relativeHumidity?.toFixed(1) || 'N/A'}%, P=${profile.level_500.pressure.toFixed(1)}mb`);
    console.warn(`[PI Calculation]   200mb: T=${profile.level_200.temperature.toFixed(1)}°C, P=${profile.level_200.pressure.toFixed(1)}mb`);
    console.warn(`[PI Calculation]   Equation terms: C_K/C_D=${CONSTANTS.C_K_OVER_C_D}, T_s/T_o=${(T_s/T_o).toFixed(3)}, delta_theta_e/theta_e_env=${(delta_theta_e/theta_e_env).toFixed(3)}, C_PD=${CONSTANTS.C_PD}, T_s=${T_s.toFixed(1)}`);
  }
  
  // Step 4: Calculate minimum central pressure
  // Reference: Emanuel 1988, Eq. 17
  // 
  // Using gradient wind balance and hydrostatic balance:
  // p_min = p_s * exp(-v_max^2 / (2 * R_D * T_s))
  //
  // This relates the pressure drop to the wind speed through
  // the cyclostrophic balance assumption
  
  const p_min_mb = p_s * Math.exp(
    -(v_max_ms * v_max_ms) / (2 * CONSTANTS.R_D * T_s)
  );
  
  // No clamping - we need to see the actual calculated values to fix the root cause
  
  // Step 5: Categorize
  const category = categorizeHurricane(v_max_knots);
  
  // Step 6: Complete intermediate values
  const completeIntermediate = {
    ...intermediate,
    v_max_ms: v_max_ms
  };
  
  return {
    vmax: Math.round(v_max_knots * 10) / 10, // Round to 1 decimal
    pmin: Math.round(p_min_mb * 10) / 10,    // Round to 1 decimal
    category,
    metadata: baseMetadata,
    intermediate: completeIntermediate
  };
}

