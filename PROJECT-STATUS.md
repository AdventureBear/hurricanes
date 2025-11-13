# Hurricane MPI Maps Project - Current Status

**Date:** November 13, 2025  
**Project Goal:** Interactive web application for visualizing Maximum Potential Intensity (MPI) of tropical cyclones using Emanuel's thermodynamic method, with accurate scientific calculations validated by experts.

---

## Project Overview

This is a Next.js/TypeScript application that:
1. Fetches real-time sea surface temperature (SST) data from NOAA NOMADS NSST (GRIB2 format)
2. Fetches atmospheric profile data from NOAA NOMADS GFS (GRIB2 format)
3. Calculates Maximum Potential Intensity (MPI) using Emanuel's complete thermodynamic method
4. Visualizes results on interactive D3.js maps showing:
   - Sea Surface Temperature (SST)
   - Minimum Central Pressure (Pmin)
   - Maximum Wind Speed (Vmax) - *not yet implemented in UI*

---

## Phase Status

### Phase 1: SST Mapping ✅ COMPLETE
- **Status:** Fully implemented and working
- **Data Source:** NOAA NOMADS NSST (GRIB2, 0.5° resolution)
- **Features:**
  - Real-time SST data fetching with caching (6-hour TTL)
  - D3.js interactive map with Mercator projection
  - Basin selection (North Atlantic, Eastern Pacific, etc.)
  - TopoJSON coastlines
  - Color-coded SST visualization with legend
  - Tooltips showing lat/lon and SST values
  - SVG masking for efficient land filtering

### Phase 2: Atmospheric Data & PI Calculation ⚠️ IN PROGRESS - CRITICAL ISSUES

**Status:** Infrastructure complete, but calculations are producing physically impossible results.

**Completed:**
- ✅ Atmospheric data fetching from NOAA NOMADS GFS (GRIB2)
- ✅ Complete Emanuel's formula implementation (`lib/potential-intensity.ts`)
- ✅ PI calculation Server Action (`app/actions/calculate-pi.ts`)
- ✅ D3 Pressure Map component (`components/d3-pressure-map.tsx`)
- ✅ Data caching system
- ✅ Test infrastructure

**Current Critical Problem:**
**ALL PI calculations are producing physically impossible values.**

**Evidence from analysis of cached data:**
- 70,188 points (48.7%) have physical impossibilities
- Max vmax: 622.7kt (historical record: ~195kt)
- Min pmin: 403.2mb (historical record: ~870mb)
- 56,706 Cat5 points (unrealistically high)
- **Example:** Cat5 (235.1kt) with SST 21.6°C at 35.25°N, -21.25°W
  - Cat5 requires SST ≥28°C
  - 235kt exceeds historical record
  - This location is off northern Spain (too cold for hurricanes)

**Physical Validation Rules Being Violated:**
1. Hurricanes require SST ≥26.5°C to form
2. Cat5 requires SST ≥28°C
3. Cat4 requires SST ≥27°C
4. Cat1-3 require SST ≥26.5°C
5. Realistic vmax: 34-195kt
6. Realistic pmin: 870-1013mb

---

## Technical Architecture

### Data Sources
- **SST:** NOAA NOMADS NSST (`rtgssthr_grb_0.5.grib2`)
- **Atmospheric:** NOAA NOMADS GFS (temperature, humidity, pressure at multiple levels)

### Data Flow
1. Server Actions fetch data (not API routes)
2. Python scripts parse GRIB2 files (`scripts/extract-nsst-sst.py`, `scripts/extract-atmospheric-data.py`)
3. Data cached in `data/cache/` (SST, atmospheric, PI subdirectories)
4. PI calculation combines SST + atmospheric profiles
5. Results visualized on D3 maps

### Key Files

**Core Calculation:**
- `lib/potential-intensity.ts` - Emanuel's formula implementation
- `app/actions/calculate-pi.ts` - Server Action that orchestrates PI calculation
- `types/atmospheric.ts` - TypeScript interfaces for atmospheric data

**Data Fetching:**
- `app/actions/sst-data.ts` - SST data Server Action
- `app/actions/atmospheric-data.ts` - Atmospheric data Server Action
- `lib/nsst-fetcher.ts` - NSST GRIB2 fetching
- `lib/atmospheric-fetcher.ts` - GFS GRIB2 fetching
- `lib/nsst-grib2-parser.ts` - Python wrapper for NSST parsing
- `lib/atmospheric-grib2-parser.ts` - Python wrapper for GFS parsing

**Visualization:**
- `components/d3-sst-map.tsx` - SST map (working correctly)
- `components/d3-pressure-map.tsx` - Pressure map (displays data, but data is wrong)
- `components/d3-map-base.tsx` - Reusable base map component

**Analysis Tools:**
- `scripts/analyze-pi-cache.ts` - **NEW** - Analyzes cached PI data for physical impossibilities

**Python Scripts:**
- `scripts/extract-nsst-sst.py` - Extracts SST from NSST GRIB2
- `scripts/extract-atmospheric-data.py` - Extracts atmospheric profiles from GFS GRIB2

---

## Known Issues

### Critical: PI Calculation Errors

**Problem:** Emanuel's formula is producing implausible results across the board.

**Symptoms:**
- Cat5 hurricanes calculated for SST <28°C (impossible)
- Wind speeds >200kt (exceeds historical record)
- Pressure values <870mb (below historical record)
- 48.7% of all calculated points have physical impossibilities

**Possible Root Causes (Need Investigation):**
1. **Unit conversion errors** - Atmospheric data may have incorrect units
2. **Equation implementation error** - Emanuel's formula may be incorrectly implemented
3. **Input data quality** - Atmospheric profiles may have bad data
4. **Missing validation** - Formula may not handle edge cases correctly
5. **Constants/coefficients** - Physical constants may be wrong

**Investigation Needed:**
- Verify atmospheric data units (temperature, pressure, humidity)
- Validate Emanuel's equation implementation against published literature
- Check intermediate calculation values (theta_e, delta_theta_e, etc.)
- Compare with known MPI values from literature
- Review physical constants and their sources

### Secondary Issues
- Wind speed map not yet implemented in UI (Task 2.5)
- No validation of atmospheric data quality before calculation
- Cache may contain bad data (needs clearing after fix)

---

## Current Data

**Cached PI Data:**
- File: `data/cache/pi/pi-2025-11-12-2025-11-13.json`
- 144,000 points
- SST date: 2025-11-12
- Atmospheric date: 2025-11-13
- **Contains physically impossible values - DO NOT TRUST**

**Analysis Results:**
- Run `npx tsx scripts/analyze-pi-cache.ts` to see full analysis
- Shows all physically impossible values with diagnostics

---

## Next Steps (Priority Order)

1. **URGENT: Fix PI Calculation**
   - Investigate why Emanuel's formula produces impossible values
   - Verify all unit conversions
   - Validate equation implementation against Emanuel 1988 paper
   - Check intermediate calculation values
   - Fix root cause

2. **Clear Bad Cache Data**
   - Delete cached PI results after fix
   - Recalculate with corrected formula

3. **Add Input Data Validation**
   - Validate atmospheric profiles before calculation
   - Check for unit errors in input data
   - Add sanity checks

4. **Implement Wind Speed Map** (Task 2.5)
   - Only after PI calculation is fixed

5. **Expert Validation**
   - Have calculations reviewed by atmospheric scientists
   - Compare with published MPI values

---

## Testing

**Test Infrastructure:**
- `scripts/test-runner.ts` - Centralized test runner
- `scripts/test-pi-calculation.ts` - Unit tests for PI formula
- `scripts/test-atmospheric-fetch.ts` - Atmospheric data tests
- `scripts/test-sst-fetch.ts` - SST data tests

**Test Mode:**
- Set `TEST_MODE=true` to use 1°x1° test regions
- Test data stored in `data/cache/*/test/` subdirectories

**Run Tests:**
```bash
npm test              # Test mode (1°x1° regions)
npm run test:production  # Production mode (global)
```

---

## Documentation

- `docs/PHASE-1-LEDGER.md` - Phase 1 completion log
- `docs/PHASE-2-PLAN.md` - Phase 2 implementation plan
- `docs/NSST-MIGRATION-LEDGER.md` - NSST data source migration log
- `docs/CACHE-STRUCTURE.md` - Cache directory structure
- `scripts/README-TESTS.md` - Testing documentation

---

## Environment Setup

**Requirements:**
- Node.js (Next.js 14+)
- Python 3 with virtual environment (`.venv`)
- Python packages: `pygrib`, `numpy` (see `requirements.txt`)

**Key Environment Variables:**
- `TEST_MODE` - Set to `true` for test mode (1°x1° regions)

---

## Critical Files to Review

1. **`lib/potential-intensity.ts`** - Emanuel's formula (likely source of errors)
2. **`app/actions/calculate-pi.ts`** - PI calculation orchestration
3. **`scripts/extract-atmospheric-data.py`** - Atmospheric data extraction (check units)
4. **`lib/atmospheric-grib2-parser.ts`** - Atmospheric data parsing (check unit conversions)
5. **`scripts/analyze-pi-cache.ts`** - Analysis tool (shows all errors)

---

## Summary for New Agent

**Current State:**
- Phase 1 (SST mapping) is complete and working correctly
- Phase 2 infrastructure is complete (data fetching, caching, visualization)
- **CRITICAL:** PI calculations are producing physically impossible results
- 48.7% of calculated points violate physical constraints
- Analysis tool exists to identify all problematic values

**Immediate Priority:**
Fix the PI calculation in `lib/potential-intensity.ts`. The Emanuel's formula implementation is producing impossible values (Cat5 with cold SST, wind speeds >200kt, pressures <870mb). All calculations are suspect until this is fixed.

**Key Insight:**
The user correctly identified that if calculations produce impossible values for some points, ALL calculations are suspect. The analysis script (`scripts/analyze-pi-cache.ts`) confirms this - nearly half of all points have physical impossibilities.

**Next Action:**
Investigate the root cause of calculation errors. Likely candidates: unit conversion errors, equation implementation bugs, or incorrect physical constants.

