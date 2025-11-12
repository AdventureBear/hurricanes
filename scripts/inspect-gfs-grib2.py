#!/usr/bin/env python3
"""
Debug script to inspect GFS GRIB2 file contents
Shows all variables and levels available
"""

import sys
import pygrib

if len(sys.argv) < 2:
    print("Usage: inspect-gfs-grib2.py <grib_file>")
    sys.exit(1)

grib_file = sys.argv[1]

print(f"Inspecting: {grib_file}")
print("=" * 80)

try:
    grbs = pygrib.open(grib_file)
    
    print(f"Total messages: {len(list(grbs))}")
    grbs.rewind()
    
    print("\nAll messages:")
    print("-" * 80)
    
    for i, grb in enumerate(grbs, 1):
        grb_str = str(grb)
        print(f"{i:4d}: {grb_str[:120]}")
        
        # Show first 20 messages in detail
        if i <= 20:
            print(f"      Name: {grb.name}")
            print(f"      Level: {grb.level}")
            print(f"      Type of level: {grb.typeOfLevel}")
            print()
    
    print("\n" + "=" * 80)
    print("Searching for specific variables:")
    print("-" * 80)
    
    grbs.rewind()
    
    # Look for surface temperature
    print("\nSurface temperature messages:")
    for grb in grbs:
        grb_str = str(grb).lower()
        if 'tmp' in grb_str and ('surface' in grb_str or '2 m' in grb_str or '2m' in grb_str):
            print(f"  {grb}")
    
    grbs.rewind()
    
    # Look for temperature at pressure levels
    print("\nTemperature at pressure levels (first 10):")
    count = 0
    for grb in grbs:
        if 'tmp' in str(grb).lower() and 'mb' in str(grb).lower():
            print(f"  {grb}")
            count += 1
            if count >= 10:
                break
    
    grbs.rewind()
    
    # Look for relative humidity
    print("\nRelative humidity messages (first 10):")
    count = 0
    for grb in grbs:
        if 'rh' in str(grb).lower() or 'relative' in str(grb).lower():
            print(f"  {grb}")
            count += 1
            if count >= 10:
                break
    
    grbs.rewind()
    
    # Look for pressure
    print("\nPressure messages:")
    for grb in grbs:
        grb_str = str(grb).lower()
        if 'pres' in grb_str or 'prmsl' in grb_str:
            print(f"  {grb}")
    
    grbs.close()
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

