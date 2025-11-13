#!/usr/bin/env python3
"""
Final comparison script: NSST vs OISST for 2025-11-11
Uses cached NSST data and fetches OISST from PSL OPeNDAP
"""

import json
import os
import sys
import urllib.request
import re
from datetime import datetime
import numpy as np

COMPARE_DATE = "2025-11-11"
BOUNDS = {
    'minLat': 5,
    'maxLat': 50,
    'minLon': -100,
    'maxLon': 0
}

def load_nsst_data():
    """Load cached NSST data for the date"""
    cache_path = f"data/cache/sst/sst-{COMPARE_DATE}.json"
    
    if not os.path.exists(cache_path):
        print(f"❌ No cached NSST data found at {cache_path}")
        return None
    
    with open(cache_path, 'r') as f:
        data = json.load(f)
    
    if 'data' in data:
        return data['data']
    return data

def fetch_oisst_psl():
    """Fetch OISST from PSL OPeNDAP"""
    year = 2025
    base_url = f"https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.{year}.nc.ascii"
    
    # First, get the time dimension to find the correct index
    # OISST time is days since 1800-01-01
    date_obj = datetime.strptime(COMPARE_DATE, "%Y-%m-%d")
    base_date = datetime(1800, 1, 1)
    days_since_base = (date_obj - base_date).days
    
    # Get time metadata to find index
    time_meta_url = f"{base_url}?time[0:1:0]"
    try:
        with urllib.request.urlopen(time_meta_url, timeout=10) as response:
            time_text = response.read().decode('utf-8')
            # Parse to find closest time index
            # For now, use day of year as approximation
            day_of_year = (date_obj - datetime(year, 1, 1)).days
            # Account for 2-day lag, so use day_of_year - 2
            time_index = max(0, day_of_year - 2)
    except:
        # Fallback: use day of year
        day_of_year = (date_obj - datetime(year, 1, 1)).days
        time_index = max(0, day_of_year - 2)
    
    # Calculate grid indices
    # OISST: starts at -89.875°N, 0.25° increments
    lat_start = int((BOUNDS['minLat'] - (-89.875)) / 0.25)
    lat_end = int((BOUNDS['maxLat'] - (-89.875)) / 0.25)
    
    # Longitude: 0-360 format, starts at 0.125
    min_lon_360 = BOUNDS['minLon'] + 360 if BOUNDS['minLon'] < 0 else BOUNDS['minLon']
    max_lon_360 = BOUNDS['maxLon'] + 360 if BOUNDS['maxLon'] < 0 else BOUNDS['maxLon']
    
    lon_start = int((min_lon_360 - 0.125) / 0.25)
    lon_end = int((max_lon_360 - 0.125) / 0.25)
    
    # Build OPeNDAP URL
    url = f"{base_url}?lat[{lat_start}:1:{lat_end}],lon[{lon_start}:1:{lon_end}],sst[{time_index}:1:{time_index}][{lat_start}:1:{lat_end}][{lon_start}:1:{lon_end}]"
    
    print(f"\nFetching OISST from PSL OPeNDAP...")
    print(f"URL: {url[:100]}...")
    
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            data_text = response.read().decode('utf-8')
            
            # Parse OPeNDAP ASCII
            # Extract lat array
            lat_match = re.search(r'lat = \[([^\]]+)\]', data_text, re.DOTALL)
            lon_match = re.search(r'lon = \[([^\]]+)\]', data_text, re.DOTALL)
            sst_match = re.search(r'sst = \[([^\]]+)\]', data_text, re.DOTALL)
            
            if not lat_match or not lon_match or not sst_match:
                print("❌ Could not parse OPeNDAP response")
                return None
            
            lats = [float(x.strip()) for x in lat_match.group(1).split(',') if x.strip()]
            lons = [float(x.strip()) for x in lon_match.group(1).split(',') if x.strip()]
            sst_values = [float(x.strip()) for x in sst_match.group(1).split(',') if x.strip()]
            
            # Create grid points
            grid_points = []
            value_idx = 0
            for lat in lats:
                for lon in lons:
                    if value_idx < len(sst_values):
                        sst = sst_values[value_idx]
                        # Skip missing values
                        if sst > -100 and sst < 100:
                            lon_180 = lon if lon <= 180 else lon - 360
                            grid_points.append({
                                'lat': lat,
                                'lon': lon_180,
                                'sst': sst
                            })
                        value_idx += 1
            
            return {
                'date': COMPARE_DATE,
                'source': 'NOAA PSL OISST v2.1 (OPeNDAP)',
                'gridPoints': grid_points,
                'pointCount': len(grid_points)
            }
            
    except Exception as e:
        print(f"❌ Error fetching OISST: {e}")
        import traceback
        traceback.print_exc()
        return None

def compare_data(nsst, oisst):
    """Compare NSST and OISST data"""
    print("\n" + "="*60)
    print("COMPARISON RESULTS")
    print("="*60)
    
    print(f"\nNSST Data:")
    print(f"  Date: {nsst['date']}")
    print(f"  Source: {nsst['source']}")
    print(f"  Points: {nsst['pointCount']:,}")
    
    if not oisst:
        print("\n❌ OISST data not available")
        return
    
    print(f"\nOISST Data:")
    print(f"  Date: {oisst['date']}")
    print(f"  Source: {oisst['source']}")
    print(f"  Points: {oisst['pointCount']:,}")
    
    # Create lookup maps (round to 0.25° for matching)
    nsst_map = {}
    for p in nsst['gridPoints']:
        # Round to nearest 0.25° for matching
        lat_round = round(p['lat'] * 4) / 4
        lon_round = round(p['lon'] * 4) / 4
        key = f"{lat_round:.2f},{lon_round:.2f}"
        nsst_map[key] = p['sst']
    
    # Find matching points
    matches = []
    for p in oisst['gridPoints']:
        lat_round = round(p['lat'] * 4) / 4
        lon_round = round(p['lon'] * 4) / 4
        key = f"{lat_round:.2f},{lon_round:.2f}"
        nsst_value = nsst_map.get(key)
        
        if nsst_value is not None:
            matches.append({
                'lat': p['lat'],
                'lon': p['lon'],
                'nsst': nsst_value,
                'oisst': p['sst'],
                'diff': abs(nsst_value - p['sst'])
            })
    
    print(f"\nMatching Grid Points: {len(matches):,}")
    
    if len(matches) > 0:
        diffs = [m['diff'] for m in matches]
        avg_diff = np.mean(diffs)
        max_diff = np.max(diffs)
        min_diff = np.min(diffs)
        std_diff = np.std(diffs)
        
        print(f"  Average difference: {avg_diff:.3f}°C")
        print(f"  Max difference: {max_diff:.3f}°C")
        print(f"  Min difference: {min_diff:.3f}°C")
        print(f"  Std deviation: {std_diff:.3f}°C")
        
        # Show sample comparisons
        print(f"\nSample Comparisons (first 10):")
        for m in matches[:10]:
            print(f"  {m['lat']:.2f}°N, {m['lon']:.2f}°W: NSST={m['nsst']:.2f}°C, OISST={m['oisst']:.2f}°C, diff={m['diff']:.2f}°C")
    
    # Statistics
    nsst_ssts = [p['sst'] for p in nsst['gridPoints']]
    oisst_ssts = [p['sst'] for p in oisst['gridPoints']]
    
    print(f"\nSST Statistics:")
    print(f"  NSST: {min(nsst_ssts):.2f} to {max(nsst_ssts):.2f}°C (mean: {np.mean(nsst_ssts):.2f}°C)")
    print(f"  OISST: {min(oisst_ssts):.2f} to {max(oisst_ssts):.2f}°C (mean: {np.mean(oisst_ssts):.2f}°C)")

def main():
    print("NSST vs OISST Comparison")
    print("="*60)
    print(f"Date: {COMPARE_DATE}")
    
    # Load NSST
    nsst = load_nsst_data()
    if not nsst:
        print("\n❌ Cannot proceed without NSST data")
        sys.exit(1)
    
    # Fetch OISST
    oisst = fetch_oisst_psl()
    
    # Compare
    compare_data(nsst, oisst)

if __name__ == "__main__":
    main()

