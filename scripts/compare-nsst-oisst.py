#!/usr/bin/env python3
"""
Compare NSST and OISST data for the same date
Fetches data from both sources and compares values, coverage, and statistics
"""

import json
import sys
import os
from datetime import datetime
import numpy as np

# Try to import NetCDF4 for OISST
try:
    import netCDF4
    HAS_NETCDF = True
except ImportError:
    HAS_NETCDF = False
    print("Warning: netCDF4 not installed. Install with: pip install netCDF4")

# Date to compare: Use NSST cache date (2025-11-12) or specify
# Check NSST cache first to see what date we have
COMPARE_DATE = None  # Will be determined from cache

def load_nsst_data():
    """Load cached NSST data - find most recent cache"""
    cache_dir = "data/cache/sst"
    
    # Find most recent cache file
    cache_files = [f for f in os.listdir(cache_dir) if f.startswith("sst-") and f.endswith(".json")]
    if not cache_files:
        print("❌ No cached NSST data found")
        print("   Run the app to fetch NSST data first")
        return None, None
    
    # Sort by filename (which includes date)
    cache_files.sort(reverse=True)
    latest_cache = cache_files[0]
    cache_path = os.path.join(cache_dir, latest_cache)
    
    # Extract date from filename
    date_str = latest_cache.replace("sst-", "").replace(".json", "")
    
    print(f"✅ Found NSST cache: {latest_cache}")
    
    with open(cache_path, 'r') as f:
        data = json.load(f)
    
    # Handle both old and new cache formats
    if 'data' in data:
        nsst_data = data['data']
    else:
        nsst_data = data
    
    return nsst_data, date_str

def fetch_oisst_from_ncei(compare_date):
    """Fetch OISST data from NCEI THREDDS"""
    if not HAS_NETCDF:
        print("❌ netCDF4 required for OISST fetching")
        print("   Install with: pip install netCDF4")
        return None
    
    date_str = compare_date.replace("-", "")
    year = date_str[:4]
    month = date_str[4:6]
    
    # NCEI THREDDS OPeNDAP URL
    # Try different URL formats
    urls_to_try = [
        f"https://www.ncei.noaa.gov/thredds/dodsC/OisstBase/NetCDF/V2.1/AVHRR/{year}{month}/sst.day.mean.{date_str}.nc",
        f"https://www.ncei.noaa.gov/thredds/dodsC/OisstBase/NetCDF/V2.1/AVHRR/{year}/{month}/sst.day.mean.{date_str}.nc",
    ]
    
    url = None
    for test_url in urls_to_try:
        try:
            # Try to open it
            test_ds = netCDF4.Dataset(test_url)
            test_ds.close()
            url = test_url
            break
        except:
            continue
    
    if not url:
        url = urls_to_try[0]  # Use first as default
    
    print(f"\nFetching OISST from NCEI THREDDS...")
    print(f"URL: {url}")
    
    try:
        # Open dataset via OPeNDAP
        ds = netCDF4.Dataset(url)
        
        # Get dimensions
        time_var = ds.variables['time']
        lat_var = ds.variables['lat']
        lon_var = ds.variables['lon']
        sst_var = ds.variables['sst']
        
        # Find time index for our date
        # OISST time is typically days since 1800-01-01
        # We need to calculate which day index corresponds to our date
        base_date = datetime(1800, 1, 1)
        target_date = datetime.strptime(COMPARE_DATE, "%Y-%m-%d")
        days_since_base = (target_date - base_date).days
        
        # Find closest time index
        time_data = time_var[:]
        time_index = np.argmin(np.abs(time_data - days_since_base))
        
        print(f"  Time index: {time_index} (days since 1800-01-01: {days_since_base})")
        
        # Extract data for North Atlantic basin: 5°N-50°N, -100°W-0°
        # OISST lon is typically 0-360, so -100°W = 260°E
        min_lat, max_lat = 5, 50
        min_lon, max_lon = -100, 0
        
        # Convert lon to 0-360 if needed
        if min_lon < 0:
            min_lon_360 = min_lon + 360
        else:
            min_lon_360 = min_lon
        if max_lon < 0:
            max_lon_360 = max_lon + 360
        else:
            max_lon_360 = max_lon
        
        # Find lat/lon indices
        lats = lat_var[:]
        lons = lon_var[:]
        
        lat_mask = (lats >= min_lat) & (lats <= max_lat)
        lon_mask = (lons >= min_lon_360) | (lons <= max_lon_360) if min_lon_360 > max_lon_360 else (lons >= min_lon_360) & (lons <= max_lon_360)
        
        lat_indices = np.where(lat_mask)[0]
        lon_indices = np.where(lon_mask)[0]
        
        if len(lat_indices) == 0 or len(lon_indices) == 0:
            print("❌ No data found in specified bounds")
            return None
        
        print(f"  Lat range: {lats[lat_indices[0]]:.2f} to {lats[lat_indices[-1]]:.2f}")
        print(f"  Lon range: {lons[lon_indices[0]]:.2f} to {lons[lon_indices[-1]]:.2f}")
        
        # Extract SST data
        sst_data = sst_var[time_index, lat_indices[0]:lat_indices[-1]+1, lon_indices[0]:lon_indices[-1]+1]
        lat_subset = lats[lat_indices[0]:lat_indices[-1]+1]
        lon_subset = lons[lon_indices[0]:lon_indices[-1]+1]
        
        # Convert to grid points
        grid_points = []
        for i, lat in enumerate(lat_subset):
            for j, lon in enumerate(lon_subset):
                sst_value = float(sst_data[i, j])
                # Skip missing values (typically -9.96921e+36 or NaN)
                if not np.isnan(sst_value) and sst_value > -100:
                    # Convert lon back to -180-180 if needed
                    lon_180 = lon if lon <= 180 else lon - 360
                    grid_points.append({
                        'lat': float(lat),
                        'lon': float(lon_180),
                        'sst': float(sst_value)
                    })
        
        ds.close()
        
        return {
            'date': COMPARE_DATE,
            'source': 'NOAA NCEI OISST v2.1 (THREDDS)',
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
    print(f"  Points: {nsst['pointCount']}")
    
    if not oisst:
        print("\n❌ OISST data not available for comparison")
        return
    
    print(f"\nOISST Data:")
    print(f"  Date: {oisst['date']}")
    print(f"  Source: {oisst['source']}")
    print(f"  Points: {oisst['pointCount']}")
    
    # Create maps for quick lookup
    nsst_map = {}
    for p in nsst['gridPoints']:
        key = f"{p['lat']:.2f},{p['lon']:.2f}"
        nsst_map[key] = p['sst']
    
    # Find matching points and compare
    matches = []
    oisst_only = []
    
    for p in oisst['gridPoints']:
        key = f"{p['lat']:.2f},{p['lon']:.2f}"
        nsst_value = nsst_map.get(key)
        
        if nsst_value is not None:
            matches.append({
                'lat': p['lat'],
                'lon': p['lon'],
                'nsst': nsst_value,
                'oisst': p['sst'],
                'diff': abs(nsst_value - p['sst'])
            })
        else:
            oisst_only.append(p)
    
    nsst_only = []
    for p in nsst['gridPoints']:
        key = f"{p['lat']:.2f},{p['lon']:.2f}"
        found = False
        for o in oisst['gridPoints']:
            if abs(p['lat'] - o['lat']) < 0.01 and abs(p['lon'] - o['lon']) < 0.01:
                found = True
                break
        if not found:
            nsst_only.append(p)
    
    print(f"\nMatching Grid Points: {len(matches)}")
    
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
        
        # Show some sample comparisons
        print(f"\nSample Comparisons (first 10):")
        for m in matches[:10]:
            print(f"  {m['lat']:.2f}°N, {m['lon']:.2f}°W: NSST={m['nsst']:.2f}°C, OISST={m['oisst']:.2f}°C, diff={m['diff']:.2f}°C")
    
    print(f"\nCoverage:")
    print(f"  NSST only points: {len(nsst_only)}")
    print(f"  OISST only points: {len(oisst_only)}")
    print(f"  Overlapping points: {len(matches)}")
    
    # Coverage statistics
    nsst_lats = [p['lat'] for p in nsst['gridPoints']]
    oisst_lats = [p['lat'] for p in oisst['gridPoints']]
    nsst_lons = [p['lon'] for p in nsst['gridPoints']]
    oisst_lons = [p['lon'] for p in oisst['gridPoints']]
    
    print(f"\nSpatial Coverage:")
    print(f"  NSST lat range: {min(nsst_lats):.2f} to {max(nsst_lats):.2f}°N")
    print(f"  OISST lat range: {min(oisst_lats):.2f} to {max(oisst_lats):.2f}°N")
    print(f"  NSST lon range: {min(nsst_lons):.2f} to {max(nsst_lons):.2f}°W")
    print(f"  OISST lon range: {min(oisst_lons):.2f} to {max(oisst_lons):.2f}°W")
    
    # SST value ranges
    nsst_ssts = [p['sst'] for p in nsst['gridPoints']]
    oisst_ssts = [p['sst'] for p in oisst['gridPoints']]
    
    print(f"\nSST Value Ranges:")
    print(f"  NSST: {min(nsst_ssts):.2f} to {max(nsst_ssts):.2f}°C (mean: {np.mean(nsst_ssts):.2f}°C)")
    print(f"  OISST: {min(oisst_ssts):.2f} to {max(oisst_ssts):.2f}°C (mean: {np.mean(oisst_ssts):.2f}°C)")

def main():
    print("NSST vs OISST Comparison")
    print("="*60)
    
    # Load NSST data (will determine date from cache)
    nsst, compare_date = load_nsst_data()
    if not nsst:
        print("\n❌ Cannot proceed without NSST data")
        sys.exit(1)
    
    print(f"\nUsing date from NSST cache: {compare_date}")
    print(f"NSST date in data: {nsst.get('date', 'unknown')}")
    
    # Fetch OISST data for the same date
    oisst = fetch_oisst_from_ncei(compare_date)
    
    # Compare
    compare_data(nsst, oisst)

if __name__ == "__main__":
    main()

