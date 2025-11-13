# Test Scripts

This directory contains test scripts for validating the Hurricane MPI Maps implementation.

## Quick Start

### Run All Tests (Recommended)

```bash
# Production mode (uses global coverage, production cache)
npx tsx scripts/test-runner.ts

# Test mode (uses 1° x 1° bounds, test cache in test/ subdirectories)
TEST_MODE=true npx tsx scripts/test-runner.ts
```

The test runner will execute all enabled tests. Edit `scripts/test-runner.ts` to enable/disable specific tests.

**Note**: Test mode uses separate cache directories (`test/` subdirectories) and 1° x 1° bounds (25°N-26°N, -81°W to -80°W) for faster testing. Production mode uses full global coverage.

### Run Individual Tests

```bash
# PI Calculation Tests
npx tsx scripts/test-pi-calculation.ts

# Atmospheric Data Fetching Tests
npx tsx scripts/test-atmospheric-fetch.ts

# Legacy NOAA Fetch Tests (not recommended - we use NSST now)
npx tsx scripts/test-noaa-fetch.ts
```

## Test Scripts

### `test-runner.ts`
**Central test runner** - Run all tests from one place.

**Usage:**
1. Open `scripts/test-runner.ts`
2. Edit the `TEST_CONFIG` object to enable/disable tests:
   ```typescript
   const TEST_CONFIG = {
     piCalculation: true,      // Enable PI calculation tests
     atmosphericFetch: true,    // Enable atmospheric fetch tests
     noaaFetch: false,         // Disable legacy NOAA tests
   };
   ```
3. Run: `npx tsx scripts/test-runner.ts`

**Output:** Summary of all test results with pass/fail status.

---

### `test-sst-fetch.ts`
**Phase 1 SST Data Fetching Tests** - Validates NSST data source and D3 map compatibility.

**What it tests:**
- Data source validation (NSST from NOMADS, not old OISST)
- SST temperature ranges and accuracy (-2°C to 35°C)
- Data format validation (lat, lon, sst fields)
- D3 map data compatibility (structure, density, distribution)
- Cache behavior (6-hour TTL, 20-minute recent fetch bypass)

**Run:** `npx tsx scripts/test-sst-fetch.ts`

**Expected:** All tests pass, data source is NSST/NOMADS, data is suitable for D3 rendering.

---

### `test-pi-calculation.ts`
**PI Calculation Library Tests** - Validates Emanuel's formula implementation.

**What it tests:**
- Unit conversions (Celsius/Kelvin, m/s/knots, categorization)
- Warm tropical conditions (expected Cat 4-5)
- Moderate tropical conditions (expected Cat 2-3)
- Cool water / marginal conditions (expected TD/TS or no formation)
- Very warm SST edge case (expected Cat 5)
- Error handling for invalid inputs

**Run:** `npx tsx scripts/test-pi-calculation.ts`

**Expected:** All tests pass with reasonable validation ranges.

---

### `test-atmospheric-fetch.ts`
**Atmospheric Data Fetching Tests** - Validates GFS atmospheric data fetching from NOMADS.

**What it tests:**
- Small region fetch (single point area)
- Large region fetch (North Atlantic basin) - commented out by default (takes longer)
- Cache behavior (6-hour TTL, 20-minute recent fetch bypass)
- SST separation (SST should be null - comes from NSST, not GFS)
- Profile completeness (all required atmospheric levels)
- Temperature and humidity validation

**Run:** `npx tsx scripts/test-atmospheric-fetch.ts`

**Note:** SST comes from NSST (Phase 1), not from GFS. Atmospheric profiles should have SST as `null`.

**Expected:** All tests pass, SST is correctly null in atmospheric profiles.

---

### `test-noaa-fetch.ts`
**Legacy NOAA Fetch Tests** - Tests old OISST data source (deprecated).

**Status:** Legacy - we now use NSST from NOMADS (Phase 1 migration).

**Run:** `npx tsx scripts/test-noaa-fetch.ts` (if needed for debugging)

---

## Test Configuration

### Enabling/Disabling Tests

Edit `scripts/test-runner.ts`:

```typescript
const TEST_CONFIG = {
  sstFetch: true,          // ✓ Run Phase 1 SST fetch tests
  piCalculation: true,     // ✓ Run PI calculation tests
  atmosphericFetch: true,  // ✓ Run atmospheric fetch tests
  noaaFetch: false,        // ✗ Skip legacy NOAA tests
};
```

### Running Specific Tests Only

Comment out tests you don't want to run:

```typescript
const TEST_CONFIG = {
  piCalculation: true,      // Only run this
  atmosphericFetch: false,  // Skip this
  noaaFetch: false,
};
```

---

## Test Output

### Successful Test Run
```
========================================
Test Summary
========================================
✓ PASSED: PI Calculation
✓ PASSED: Atmospheric Fetch

Total: 2 | Passed: 2 | Failed: 0
========================================
```

### Failed Test Run
```
========================================
Test Summary
========================================
✓ PASSED: PI Calculation
✗ FAILED: Atmospheric Fetch
  Error: Failed to fetch atmospheric data...

Total: 2 | Passed: 1 | Failed: 1
========================================
```

---

## Troubleshooting

### Python Dependencies
If atmospheric tests fail with "ModuleNotFoundError: No module named 'pygrib'":
```bash
# Activate venv and install dependencies
source .venv/bin/activate
pip install -r requirements.txt
```

### Cache Issues
If tests show stale data:
```bash
# Clear atmospheric cache
rm -rf data/cache/atmospheric/*.json

# Clear GRIB2 cache (if needed)
rm -rf data/cache/grib2/gfs/*.grb2
```

### Network Issues
Atmospheric fetch tests require internet connection to NOMADS. If tests fail:
- Check internet connection
- Verify NOMADS is accessible: https://nomads.ncep.noaa.gov/
- Check if GFS data is available for the test date

---

## Adding New Tests

1. Create test file: `scripts/test-<feature>.ts`
2. Export `runTests()` function:
   ```typescript
   export async function runTests(): Promise<void> {
     // Your tests here
   }
   ```
3. Add to `test-runner.ts`:
   ```typescript
   import { runTests as runNewTests } from './test-<feature>';
   
   const TEST_CONFIG = {
     // ... existing tests
     newFeature: true,
   };
   
   // In runAllTests():
   if (TEST_CONFIG.newFeature) {
     await runNewTests();
   }
   ```

---

## Test Philosophy

These are **validation scripts**, not a formal test framework. They:
- Validate functionality works correctly
- Check data formats and ranges
- Verify caching behavior
- Ensure data separation (SST vs atmospheric)

For production, consider adding:
- Jest/Vitest for unit tests
- Playwright for E2E tests
- CI/CD integration

