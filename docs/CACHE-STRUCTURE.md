# Cache Structure Documentation

## Overview

This document describes the cache structure for the Hurricane MPI Maps project, including separation between test and production data.

## Cache Directory Structure

```
data/cache/
├── sst/                    # SST JSON cache (production)
│   ├── sst-YYYY-MM-DD.json # Cached SST data from NSST (full global coverage)
│   └── test/               # Test SST cache (1° resolution, small bounds)
│       └── test-sst-YYYY-MM-DD.json
├── atmospheric/            # Atmospheric data JSON cache (production)
│   ├── atmospheric-YYYY-MM-DD.json
│   └── test/               # Test atmospheric cache (1° resolution, small bounds)
│       └── test-atmospheric-YYYY-MM-DD.json
├── pi/                     # PI calculation results cache (production)
│   ├── pi-{sst-date}-{atmospheric-date}.json
│   └── test/               # Test PI cache (1° resolution, small bounds)
│       └── test-pi-{sst-date}-{atmospheric-date}.json
└── grib2/                  # Raw GRIB2 files (production)
    ├── nsst/               # NSST GRIB2 files (production)
    │   └── nsst.YYYYMMDD.grb2
    ├── gfs/                # GFS GRIB2 files (production)
    │   └── gfs.YYYYMMDD.f000.grb2
    └── test/               # Test GRIB2 files (1° resolution, small bounds)
        ├── nsst/
        │   └── test-nsst.YYYYMMDD.grb2
        └── gfs/
            └── test-gfs.YYYYMMDD.f000.grb2
```

## Cache Types

### 1. SST Cache (`data/cache/sst/`)
- **Format**: JSON files named `sst-YYYY-MM-DD.json`
- **Content**: Parsed SST grid points from NSST GRIB2 data
- **TTL**: 24 hours
- **Production Use**: Full global coverage (-40°N to 60°N, -180° to 180°)
- **Test Data**: Should be stored separately if needed (e.g., `sst/test/`)

### 2. Atmospheric Cache (`data/cache/atmospheric/`)
- **Format**: JSON files named `atmospheric-YYYY-MM-DD.json`
- **Content**: Parsed atmospheric profiles from GFS GRIB2 data
- **TTL**: 6 hours (with 20-minute recent fetch bypass)
- **Production Use**: Full vertical profiles for specified bounds
- **Test Data**: Should be stored separately if needed (e.g., `atmospheric/test/`)

### 3. PI Cache (`data/cache/pi/`)
- **Format**: JSON files named `pi-{sst-date}-{atmospheric-date}.json`
- **Content**: Calculated PI results (vmax, pmin, category) for all grid points
- **TTL**: Valid as long as SST and atmospheric dates match
- **Production Use**: Full PI calculation results
- **Test Data**: Should be stored separately if needed (e.g., `pi/test/`)

### 4. GRIB2 Cache (`data/cache/grib2/`)
- **Format**: Binary GRIB2 files
- **Content**: Raw GRIB2 data from NOMADS
- **TTL**: 24 hours for NSST, 6 hours for GFS
- **Production Use**: Raw data files before parsing
- **Test Data**: Should be stored separately if needed (e.g., `grib2/test/`)

## Cache Naming Conventions

### Production Cache Files
- SST: `sst-YYYY-MM-DD.json` (e.g., `sst-2025-11-12.json`)
- Atmospheric: `atmospheric-YYYY-MM-DD.json` (e.g., `atmospheric-2025-11-12.json`)
- PI: `pi-{sst-date}-{atmospheric-date}.json` (e.g., `pi-2025-11-12-2025-11-12.json`)
- GRIB2 NSST: `nsst.YYYYMMDD.grb2` (e.g., `nsst.20251112.grb2`)
- GRIB2 GFS: `gfs.YYYYMMDD.f000.grb2` (e.g., `gfs.20251112.f000.grb2`)

### Test Cache Files
- **Location**: Stored in `test/` subdirectories
- **Naming**: Prefixed with `test-`
- **Bounds**: 1° x 1° area (e.g., 25°N-26°N, -81°W to -80°W)
- SST: `test/sst/test-sst-YYYY-MM-DD.json`
- Atmospheric: `test/atmospheric/test-atmospheric-YYYY-MM-DD.json`
- PI: `test/pi/test-pi-{sst-date}-{atmospheric-date}.json`
- GRIB2 NSST: `test/nsst/test-nsst.YYYYMMDD.grb2`
- GRIB2 GFS: `test/gfs/test-gfs.YYYYMMDD.f000.grb2`

### Test Mode
- **Enable**: Set `TEST_MODE=true` environment variable
- **Bounds**: Automatically uses 1° x 1° test bounds (25°N-26°N, -81°W to -80°W)
- **Cache**: Automatically uses test cache directories (`test/` subdirectories)
- **Naming**: All test cache files prefixed with `test-`
- **Usage**: 
  ```bash
  # Run tests in test mode (1° x 1° bounds, separate cache)
  TEST_MODE=true npx tsx scripts/test-sst-fetch.ts
  
  # Run in production mode (default, global coverage)
  npx tsx scripts/test-sst-fetch.ts
  ```

### Test vs Production Separation
- **Test data**: Stored in `test/` subdirectories with `test-` prefix
- **Production data**: Stored in root cache directories, no prefix
- **No mixing**: Test and production caches are completely separate
- **1° resolution**: Test data uses 1° x 1° bounds for faster testing

## Cache Validation

### SST Cache
- Valid if less than 24 hours old
- Checks for most recent cache file (by data date, not file date)
- Uses data date from NOAA, not today's date

### Atmospheric Cache
- Valid if less than 6 hours old
- If fetched within last 20 minutes, uses cache without checking
- Uses today's date for cache key (simplified - should match actual GFS date)

### PI Cache
- Valid as long as SST and atmospheric dates match
- No time-based expiration (only invalidated when source data changes)

## Cache Flow

1. **SST Data**:
   - Check `data/cache/sst/` for JSON cache
   - If not found, check `data/cache/grib2/nsst/` for GRIB2 cache
   - If not found, fetch from NOMADS and cache both GRIB2 and JSON

2. **Atmospheric Data**:
   - Check `data/cache/atmospheric/` for JSON cache
   - If not found, check `data/cache/grib2/gfs/` for GRIB2 cache
   - If not found, fetch from NOMADS and cache both GRIB2 and JSON

3. **PI Data**:
   - Check `data/cache/pi/` for cached results
   - If not found, calculate PI using cached SST and atmospheric data
   - Cache results for reuse

## Test Data Separation

If test data is created (e.g., 1° resolution, small bounds), it should be:
1. Stored in separate subdirectories (`test/` subdirectories)
2. Clearly labeled in filenames or metadata
3. Documented in test scripts
4. Not mixed with production cache

## Cache Cleanup

- Production cache: Automatically expires based on TTL
- Test cache: Should be manually cleaned or use separate directories
- GRIB2 cache: Can be large, consider cleanup for old files

## Notes

- Cache files use the data date from NOAA, not the fetch date
- Most recent cache is found by comparing data dates, not file modification times
- Cache validation respects the 6-hour minimum for atmospheric data
- PI cache is keyed by both SST and atmospheric dates to ensure consistency

