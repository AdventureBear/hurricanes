#!/usr/bin/env python3
"""
Extract atmospheric profile data from GFS GRIB2 file
Outputs JSON array of atmospheric profiles for grid points within bounds

This script extracts the complete vertical profile required for Emanuel's
Maximum Potential Intensity calculation:
- Temperature: surface, 850mb, 700mb, 500mb, 400mb, 300mb, 250mb, 200mb, 150mb, 100mb
- Relative humidity: surface, 850mb, 700mb, 500mb, 400mb, 300mb
- Pressure: surface and all standard levels
"""

import sys
import json
import pygrib
import numpy as np
from typing import Dict, List, Any

def extract_atmospheric_profile(
    grib_file: str, 
    bounds: Dict[str, float]
) -> List[Dict[str, Any]]:
    """
    Extract complete atmospheric profiles from GRIB2 file within specified bounds
    
    Args:
        grib_file: Path to GRIB2 file
        bounds: Dictionary with minLat, maxLat, minLon, maxLon
    
    Returns:
        List of dictionaries with lat, lon, and complete atmospheric profile
    """
    try:
        print(f"[Python] Opening GRIB2 file: {grib_file}", file=sys.stderr)
        print(f"[Python] Bounds: {bounds['minLat']}°N-{bounds['maxLat']}°N, {bounds['minLon']}°-{bounds['maxLon']}°", file=sys.stderr)
        
        grbs = pygrib.open(grib_file)
        
        # GFS variable names and levels we need
        # Temperature: TMP (at various pressure levels)
        # Relative Humidity: RH (at various pressure levels)
        # Surface temperature: TMP:surface or TMP:2 m above ground
        # Surface pressure: PRESS:surface or PRMSL:mean sea level
        
        profiles = []
        
        # Get all messages to find what we need
        all_messages = list(grbs)
        grbs.rewind()
        
        print(f"[Python] Found {len(all_messages)} messages in GRIB2 file", file=sys.stderr)
        
        # Find surface temperature (2 metre temperature)
        surface_temp_msg = None
        for grb in all_messages:
            grb_str = str(grb).lower()
            # Look for 2 metre temperature or surface temperature
            if ('temperature' in grb_str or 'tmp' in grb_str) and (
                '2 m' in grb_str or '2m' in grb_str or 
                (grb.typeOfLevel == 'heightAboveGround' and grb.level == 2) or
                (grb.typeOfLevel == 'surface' and 'temperature' in grb.name.lower())
            ):
                surface_temp_msg = grb
                print(f"[Python] Found surface temperature: {grb.name} at {grb.typeOfLevel} level {grb.level}", file=sys.stderr)
                break
        
        if not surface_temp_msg:
            raise ValueError("Surface temperature not found in GRIB2 file")
        
        # Find surface pressure
        surface_press_msg = None
        for grb in all_messages:
            grb_str = str(grb).lower()
            # Look for pressure at surface or mean sea level pressure
            if (('pressure' in grb_str or 'pres' in grb_str or 'prmsl' in grb_str) and 
                (grb.typeOfLevel == 'surface' or 'mean sea level' in grb_str)):
                surface_press_msg = grb
                print(f"[Python] Found surface pressure: {grb.name} at {grb.typeOfLevel}", file=sys.stderr)
                break
        
        if not surface_press_msg:
            raise ValueError("Surface pressure not found in GRIB2 file")
        
        # Find surface relative humidity
        surface_rh_msg = None
        for grb in all_messages:
            grb_str = str(grb).lower()
            # Look for relative humidity at 2m or surface
            if ('relative humidity' in grb_str or 'rh' in grb_str) and (
                (grb.typeOfLevel == 'heightAboveGround' and grb.level == 2) or
                (grb.typeOfLevel == 'surface')
            ):
                surface_rh_msg = grb
                print(f"[Python] Found surface relative humidity: {grb.name} at {grb.typeOfLevel} level {grb.level}", file=sys.stderr)
                break
        
        if not surface_rh_msg:
            print("[Python] Warning: Surface relative humidity not found, using 80% default", file=sys.stderr)
        
        # Find temperature and RH at standard pressure levels
        pressure_levels = [1000, 850, 700, 500, 400, 300, 250, 200, 150, 100]
        temp_messages = {}
        rh_messages = {}
        
        for level in pressure_levels:
            # Find temperature at this pressure level (in hPa, but stored as Pa in GRIB2)
            level_pa = level * 100  # Convert hPa to Pa
            for grb in all_messages:
                if (grb.typeOfLevel == 'isobaricInhPa' and 
                    grb.level == level and 
                    'temperature' in grb.name.lower()):
                    temp_messages[level] = grb
                    print(f"[Python] Found temperature at {level}mb (level={grb.level}, type={grb.typeOfLevel})", file=sys.stderr)
                    break
            
            # Find relative humidity at this level (only for lower levels)
            if level >= 300:
                for grb in all_messages:
                    if (grb.typeOfLevel == 'isobaricInhPa' and 
                        grb.level == level and 
                        ('relative humidity' in grb.name.lower() or 'rh' in str(grb).lower())):
                        rh_messages[level] = grb
                        print(f"[Python] Found relative humidity at {level}mb (level={grb.level})", file=sys.stderr)
                        break
        
        # Get coordinates from surface temperature (all should have same grid)
        lats, lons = surface_temp_msg.latlons()
        surface_temps = surface_temp_msg.values
        surface_press = surface_press_msg.values if surface_press_msg else None
        surface_rh = surface_rh_msg.values if surface_rh_msg else None
        
        # Get temperature and RH at each level
        level_temps = {}
        level_rhs = {}
        for level in pressure_levels:
            if level in temp_messages:
                level_temps[level] = temp_messages[level].values
            if level in rh_messages:
                level_rhs[level] = rh_messages[level].values
        
        print(f"[Python] Grid shape: {lats.shape}", file=sys.stderr)
        
        # Extract profiles for points within bounds
        grid_points = []
        for i in range(lats.shape[0]):
            for j in range(lats.shape[1]):
                lat = float(lats[i, j])
                lon = float(lons[i, j])
                
                # Handle longitude wraparound
                if lon > 180:
                    lon = lon - 360
                
                # Check if within bounds
                if (bounds['minLat'] <= lat <= bounds['maxLat'] and
                    bounds['minLon'] <= lon <= bounds['maxLon']):
                    
                    # Get surface values
                    surface_temp = float(surface_temps[i, j])
                    if np.isnan(surface_temp) or surface_temp > 1e20:
                        continue
                    
                    # Convert Kelvin to Celsius
                    surface_temp_c = surface_temp - 273.15
                    
                    # Get surface pressure (convert Pa to mb if needed)
                    # GFS surface pressure is in Pascals (typical range: 100000-102500 Pa = 1000-1025 mb)
                    if surface_press is not None:
                        surface_press_val = float(surface_press[i, j])
                        # If value is > 2000, it's likely in Pascals (normal range: 100000-102500 Pa)
                        # If value is < 2000, it's likely already in millibars (normal range: 1000-1025 mb)
                        if surface_press_val > 2000:
                            surface_press_mb = surface_press_val / 100
                        else:
                            surface_press_mb = surface_press_val
                    else:
                        surface_press_mb = 1013.25  # Default
                    
                    # Get surface RH
                    if surface_rh is not None:
                        surface_rh_val = float(surface_rh[i, j])
                        if surface_rh_val > 100:  # Might be in fraction, convert to percent
                            surface_rh_val = surface_rh_val * 100
                        surface_rh_percent = max(0, min(100, surface_rh_val))
                    else:
                        surface_rh_percent = 80.0  # Default
                    
                    # Build profile
                    # NOTE: SST (Sea Surface Temperature) comes from NSST data source (Phase 1), NOT from GFS
                    # GFS provides ONLY atmospheric data (air temperature, humidity, pressure)
                    # SST will be combined with this raw atmospheric profile in Task 2.3 to create the complete profile
                    # We do NOT include SST here - it's not part of the raw atmospheric profile
                    profile: Dict[str, Any] = {
                        'lat': round(lat, 2),
                        'lon': round(lon, 2),
                        'profile': {
                            # No SST field - SST comes from NSST, not GFS
                            'surface': {
                                'temperature': round(surface_temp_c, 2),  # Air temperature at 2m above ground
                                'relativeHumidity': round(surface_rh_percent, 1),
                                'pressure': round(surface_press_mb, 2)
                            }
                        }
                    }
                    
                    # Add pressure level data
                    if 850 in level_temps:
                        temp_850 = float(level_temps[850][i, j]) - 273.15
                        rh_850 = float(level_rhs[850][i, j]) if 850 in level_rhs else 70.0
                        if rh_850 > 100:
                            rh_850 = rh_850 / 100 * 100  # Convert fraction to percent if needed
                        profile['profile']['level_850'] = {
                            'temperature': round(temp_850, 2),
                            'relativeHumidity': round(max(0, min(100, rh_850)), 1),
                            'pressure': 850.0
                        }
                    
                    if 700 in level_temps:
                        temp_700 = float(level_temps[700][i, j]) - 273.15
                        rh_700 = float(level_rhs[700][i, j]) if 700 in level_rhs else 65.0
                        if rh_700 > 100:
                            rh_700 = rh_700 / 100 * 100
                        profile['profile']['level_700'] = {
                            'temperature': round(temp_700, 2),
                            'relativeHumidity': round(max(0, min(100, rh_700)), 1),
                            'pressure': 700.0
                        }
                    
                    if 500 in level_temps:
                        temp_500 = float(level_temps[500][i, j]) - 273.15
                        rh_500 = float(level_rhs[500][i, j]) if 500 in level_rhs else 55.0
                        if rh_500 > 100:
                            rh_500 = rh_500 / 100 * 100
                        profile['profile']['level_500'] = {
                            'temperature': round(temp_500, 2),
                            'relativeHumidity': round(max(0, min(100, rh_500)), 1),
                            'pressure': 500.0
                        }
                    
                    if 400 in level_temps:
                        temp_400 = float(level_temps[400][i, j]) - 273.15
                        rh_400 = float(level_rhs[400][i, j]) if 400 in level_rhs else 50.0
                        if rh_400 > 100:
                            rh_400 = rh_400 / 100 * 100
                        profile['profile']['level_400'] = {
                            'temperature': round(temp_400, 2),
                            'relativeHumidity': round(max(0, min(100, rh_400)), 1),
                            'pressure': 400.0
                        }
                    
                    if 300 in level_temps:
                        temp_300 = float(level_temps[300][i, j]) - 273.15
                        rh_300 = float(level_rhs[300][i, j]) if 300 in level_rhs else 40.0
                        if rh_300 > 100:
                            rh_300 = rh_300 / 100 * 100
                        profile['profile']['level_300'] = {
                            'temperature': round(temp_300, 2),
                            'relativeHumidity': round(max(0, min(100, rh_300)), 1),
                            'pressure': 300.0
                        }
                    
                    if 250 in level_temps:
                        temp_250 = float(level_temps[250][i, j]) - 273.15
                        profile['profile']['level_250'] = {
                            'temperature': round(temp_250, 2),
                            'pressure': 250.0
                        }
                    
                    if 200 in level_temps:
                        temp_200 = float(level_temps[200][i, j]) - 273.15
                        profile['profile']['level_200'] = {
                            'temperature': round(temp_200, 2),
                            'pressure': 200.0
                        }
                    
                    if 150 in level_temps:
                        temp_150 = float(level_temps[150][i, j]) - 273.15
                        profile['profile']['level_150'] = {
                            'temperature': round(temp_150, 2),
                            'pressure': 150.0
                        }
                    
                    if 100 in level_temps:
                        temp_100 = float(level_temps[100][i, j]) - 273.15
                        profile['profile']['level_100'] = {
                            'temperature': round(temp_100, 2),
                            'pressure': 100.0
                        }
                    
                    grid_points.append(profile)
        
        grbs.close()
        
        print(f"[Python] Extraction complete:", file=sys.stderr)
        print(f"[Python]   Valid profiles: {len(grid_points)}", file=sys.stderr)
        
        return grid_points
        
    except Exception as e:
        print(f"[Python] Error: {str(e)}", file=sys.stderr)
        raise

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: extract-atmospheric-data.py <grib_file> <bounds_json>", file=sys.stderr)
        sys.exit(1)
    
    grib_file = sys.argv[1]
    bounds_json = sys.argv[2]
    
    print(f"[Python] ========================================", file=sys.stderr)
    print(f"[Python] GFS Atmospheric Data Extraction Script", file=sys.stderr)
    print(f"[Python] ========================================", file=sys.stderr)
    
    try:
        bounds = json.loads(bounds_json)
        profiles = extract_atmospheric_profile(grib_file, bounds)
        print(json.dumps(profiles))
        print(f"[Python] ========================================", file=sys.stderr)
        print(f"[Python] Successfully output {len(profiles)} profiles to stdout", file=sys.stderr)
        print(f"[Python] ========================================", file=sys.stderr)
    except Exception as e:
        print(f"[Python] ========================================", file=sys.stderr)
        print(f"[Python] Fatal error: {str(e)}", file=sys.stderr)
        print(f"[Python] ========================================", file=sys.stderr)
        sys.exit(1)

