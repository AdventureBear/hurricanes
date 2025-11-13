#!/usr/bin/env python3
"""
Extract SST grid points from NSST GRIB2 file
Outputs JSON array of {lat, lon, sst} points filtered to bounds
"""

import sys
import json
import pygrib
import numpy as np
from typing import Dict, List, Any

def extract_sst_grid(grib_file: str, bounds: Dict[str, float]) -> List[Dict[str, float]]:
    """
    Extract SST grid points from GRIB2 file within specified bounds
    
    Args:
        grib_file: Path to GRIB2 file
        bounds: Dictionary with minLat, maxLat, minLon, maxLon
    
    Returns:
        List of dictionaries with lat, lon, sst keys
    """
    try:
        print(f"[Python] Opening GRIB2 file: {grib_file}", file=sys.stderr)
        print(f"[Python] Bounds: {bounds['minLat']}°N-{bounds['maxLat']}°N, {bounds['minLon']}°-{bounds['maxLon']}°", file=sys.stderr)
        
        grbs = pygrib.open(grib_file)
        
        # Find SST variable
        # NSST files may contain: 'nsstf' (foundation), 'nsst' (near-surface), or 'TMP:surface'
        sst_msg = None
        variable_name = None
        message_count = 0
        
        print(f"[Python] Searching for SST variable in GRIB2 messages...", file=sys.stderr)
        for grb in grbs:
            message_count += 1
            grb_str = str(grb)
            # Check for NSST variables first
            if 'nsstf' in grb_str.lower() or 'nsst' in grb_str.lower():
                sst_msg = grb
                variable_name = 'nsst'
                print(f"[Python] Found NSST variable in message {message_count}", file=sys.stderr)
                break
            # Fallback to TMP:surface
            elif 'tmp' in grb_str.lower() and 'surface' in grb_str.lower():
                sst_msg = grb
                variable_name = 'tmp'
                print(f"[Python] Found TMP:surface variable in message {message_count}", file=sys.stderr)
                break
        
        if not sst_msg:
            # If no specific SST found, try first message
            grbs.rewind()
            sst_msg = grbs[1]  # First message (0-indexed)
            variable_name = 'unknown'
            print(f"[Python] Warning: No specific SST variable found, using first message: {sst_msg}", file=sys.stderr)
        else:
            print(f"[Python] Using SST variable: {variable_name}", file=sys.stderr)
        
        # Get grid coordinates and values
        print(f"[Python] Reading grid coordinates and values...", file=sys.stderr)
        lats, lons = sst_msg.latlons()
        values = sst_msg.values
        
        # Get missing value indicator (land points use this)
        missing_value = getattr(sst_msg, 'missingValue', None)
        if missing_value is not None:
            print(f"[Python] Missing value indicator: {missing_value} (land points)", file=sys.stderr)
        
        # Check units and convert Kelvin to Celsius if needed
        units = getattr(sst_msg, 'units', '').lower()
        is_kelvin = 'k' in units or 'kelvin' in units
        
        # Valid SST range: -2°C to 35°C (ocean temperatures)
        # In Kelvin: 271.15K to 308.15K
        valid_sst_min_k = 271.0  # Slightly below -2°C to account for rounding
        valid_sst_max_k = 308.5  # Slightly above 35°C to account for rounding
        
        if is_kelvin:
            print(f"[Python] Values are in Kelvin, will convert to Celsius after filtering...", file=sys.stderr)
            print(f"[Python] Grid shape: {lats.shape}, raw value range: {np.nanmin(values):.2f}K to {np.nanmax(values):.2f}K", file=sys.stderr)
        else:
            print(f"[Python] Variable units: {units}", file=sys.stderr)
            print(f"[Python] Grid shape: {lats.shape}, value range: {np.nanmin(values):.2f} to {np.nanmax(values):.2f} ({units})", file=sys.stderr)
        
        # Convert to numpy arrays for easier filtering
        lats_flat = lats.flatten()
        lons_flat = lons.flatten()
        values_flat = values.flatten()
        
        total_points = len(lats_flat)
        print(f"[Python] Total grid points: {total_points}", file=sys.stderr)
        
        # Filter to bounds and valid ocean SST values (exclude land)
        grid_points = []
        invalid_count = 0
        out_of_bounds_count = 0
        land_count = 0
        
        for i in range(len(lats_flat)):
            lat = float(lats_flat[i])
            lon = float(lons_flat[i])
            sst_raw = float(values_flat[i])
            
            # Handle longitude wraparound (convert 0-360 to -180-180 if needed)
            if lon > 180:
                lon = lon - 360
            
            # Check if within bounds
            if (bounds['minLat'] <= lat <= bounds['maxLat'] and
                bounds['minLon'] <= lon <= bounds['maxLon']):
                
                # Filter out land points and invalid values
                # 1. Check for NaN first
                if np.isnan(sst_raw):
                    invalid_count += 1
                    continue
                
                # 2. Check for missing value indicator (land points)
                # Missing values are typically 9999 or very large numbers
                if missing_value is not None:
                    # Check if value matches missing value (with tolerance for floating point)
                    if abs(sst_raw - missing_value) < 1.0:
                        land_count += 1
                        invalid_count += 1
                        continue
                
                # 3. Check for valid ocean SST range (in Kelvin if needed)
                # This is the primary filter for land points - land temps are outside ocean range
                if is_kelvin:
                    # Valid ocean SST: 271K (-2°C) to 308K (35°C)
                    # Land temperatures can be much colder (winter) or hotter (desert)
                    if sst_raw < valid_sst_min_k or sst_raw > valid_sst_max_k:
                        land_count += 1
                        invalid_count += 1
                        continue
                    # Convert to Celsius
                    sst = sst_raw - 273.15
                else:
                    # Already in Celsius, check range
                    if sst_raw < -2 or sst_raw > 35:
                        land_count += 1
                        invalid_count += 1
                        continue
                    sst = sst_raw
                
                # Valid ocean point
                grid_points.append({
                    'lat': round(lat, 2),
                    'lon': round(lon, 2),
                    'sst': round(sst, 2)
                })
            else:
                out_of_bounds_count += 1
        
        if land_count > 0:
            print(f"[Python]   Land points filtered: {land_count}", file=sys.stderr)
        
        grbs.close()
        
        print(f"[Python] Extraction complete:", file=sys.stderr)
        print(f"[Python]   Valid points: {len(grid_points)}", file=sys.stderr)
        print(f"[Python]   Out of bounds: {out_of_bounds_count}", file=sys.stderr)
        print(f"[Python]   Invalid values: {invalid_count}", file=sys.stderr)
        
        return grid_points
        
    except Exception as e:
        print(f"[Python] Error: {str(e)}", file=sys.stderr)
        raise

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: extract-nsst-sst.py <grib_file> <bounds_json>", file=sys.stderr)
        sys.exit(1)
    
    grib_file = sys.argv[1]
    bounds_json = sys.argv[2]
    
    print(f"[Python] ========================================", file=sys.stderr)
    print(f"[Python] NSST GRIB2 Extraction Script", file=sys.stderr)
    print(f"[Python] ========================================", file=sys.stderr)
    
    try:
        bounds = json.loads(bounds_json)
        points = extract_sst_grid(grib_file, bounds)
        print(json.dumps(points))
        print(f"[Python] ========================================", file=sys.stderr)
        print(f"[Python] Successfully output {len(points)} points to stdout", file=sys.stderr)
        print(f"[Python] ========================================", file=sys.stderr)
    except Exception as e:
        print(f"[Python] ========================================", file=sys.stderr)
        print(f"[Python] Fatal error: {str(e)}", file=sys.stderr)
        print(f"[Python] ========================================", file=sys.stderr)
        sys.exit(1)

