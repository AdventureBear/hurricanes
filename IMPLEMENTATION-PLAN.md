# Hurricane MPI Maps - Implementation Plan

## Overview
This plan breaks down the design doc into incremental, testable steps. Each step includes validation criteria before moving forward.

---

## PHASE 1: Sea Surface Temperature (SST) Mapping

### Step 1.1: Project Setup & Dependencies
**Goal**: Install required packages and set up project structure

**Tasks**:
- [ ] Install D3.js libraries: `d3`, `d3-geo`, `@types/d3`, `@types/d3-geo`
- [ ] Install topojson for geographic data: `topojson-client`, `@types/topojson-client`
- [ ] Create directory structure: `lib/`, `components/`, `types/`
- [ ] Set up TypeScript types for SST data

**Testing**:
```bash
npm run build  # Should compile without errors
npm run lint   # Should pass
```

**Files Created**:
- `types/sst.ts` - TypeScript interfaces
- `lib/map-utils.ts` - D3 projection helpers (empty placeholder)

**Success Criteria**: ✅ Clean build with no errors

---

### Step 1.2: SST Data API Route - Basic Structure
**Goal**: Create API endpoint with mock data to test the flow

**Tasks**:
- [ ] Create `app/api/sst-data/route.ts`
- [ ] Implement basic route handler with mock data (hardcoded 10 points)
- [ ] Add proper TypeScript types
- [ ] Add error handling

**Testing**:
```bash
# Terminal test
curl http://localhost:3000/api/sst-data

# Expected: JSON with mock SST data
{
  "date": "2025-11-12",
  "gridPoints": [
    {"lat": 25, "lon": -80, "sst": 28.5},
    ...
  ],
  "bounds": {...}
}
```

**Files Created**:
- `app/api/sst-data/route.ts`

**Success Criteria**: ✅ API returns mock data successfully

---

### Step 1.3: OPeNDAP Data Fetching
**Goal**: Implement real NOAA data fetching

**Tasks**:
- [ ] Implement `fetchSSTDataFromNOAA()` function
- [ ] Implement `parseOPeNDAPAscii()` parser
- [ ] Add error handling for network failures
- [ ] Add logging for debugging

**Testing**:
```bash
# Test in isolation first
curl "https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.2025.nc.ascii?time[0:1:0]"

# Then test API endpoint
curl http://localhost:3000/api/sst-data
# Should return real data with ~45k grid points
```

**Manual Verification**:
- Check console logs show correct number of parsed points
- Verify lat/lon ranges match Atlantic basin (5°N-45°N, 95°W-10°W)
- Verify SST values are reasonable (20-32°C)

**Success Criteria**: ✅ Real NOAA data fetched and parsed correctly

---

### Step 1.4: Server-Side Caching with File System
**Goal**: Implement 24-hour file-based cache to avoid repeated NOAA requests

**Tasks**:
- [ ] Create `data/cache/` directory (add to .gitignore)
- [ ] Implement file-based cache with date-stamped filenames
- [ ] Add cache validation (check if file exists and is current)
- [ ] Implement cache refresh logic

**File Naming Convention**:
```
data/cache/sst-YYYY-MM-DD.json
Example: data/cache/sst-2025-11-12.json
```

**Testing**:
```bash
# First request - should fetch from NOAA
curl http://localhost:3000/api/sst-data
# Check logs: "[v0] Fetching SST data from NOAA"
# Verify file created: ls data/cache/

# Second request - should use cache
curl http://localhost:3000/api/sst-data
# Check logs: "[v0] Using cached SST data from: sst-2025-11-12.json"

# Manual cache clear test
rm data/cache/*.json
curl http://localhost:3000/api/sst-data
# Should fetch fresh data
```

**Files Created**:
- `lib/cache-manager.ts` - Cache utilities
- `data/cache/.gitkeep` (directory tracked but contents ignored)

**Success Criteria**: ✅ Cache works, reduces NOAA requests

---

### Step 1.5: Basic D3 Map Component - Structure Only
**Goal**: Create D3 React component with proper lifecycle

**Tasks**:
- [ ] Create `components/d3-sst-map.tsx`
- [ ] Set up SVG container with proper dimensions
- [ ] Implement D3 projection (Mercator)
- [ ] Add useEffect for D3 lifecycle management
- [ ] Render empty map with border (no data yet)

**Testing**:
- [ ] Visual: Empty SVG renders at correct size (800x600)
- [ ] Console: No React errors or warnings
- [ ] Inspect element: SVG structure is correct

**Files Created**:
- `components/d3-sst-map.tsx`

**Success Criteria**: ✅ Empty map component renders without errors

---

### Step 1.6: D3 Coastlines & Geographic Features
**Goal**: Add coastlines and lat/lon grid lines

**Tasks**:
- [ ] Download Natural Earth data (10m coastlines)
- [ ] Convert to TopoJSON format
- [ ] Add to `public/data/` directory
- [ ] Render coastlines with D3
- [ ] Add lat/lon grid lines (5° increments)

**Testing**:
- [ ] Visual: Coastlines visible and correctly positioned
- [ ] Visual: Grid lines at correct intervals
- [ ] Visual: Atlantic basin properly centered
- [ ] Test zoom/pan (if implementing interactivity)

**Files Added**:
- `public/data/world-110m.json` - TopoJSON coastlines

**Success Criteria**: ✅ Geographic features render correctly

---

### Step 1.7: D3 SST Data Visualization
**Goal**: Display SST data as colored circles

**Tasks**:
- [ ] Fetch SST data from API in component
- [ ] Create D3 color scale (d3.scaleSequential)
- [ ] Render grid points as SVG circles
- [ ] Apply color mapping
- [ ] Add loading state

**Testing**:
```typescript
// Visual checks:
// - ~45k colored circles visible
// - Colors match temperature (warmer = red/orange)
// - No gaps in coverage over ocean
// - Land areas properly masked

// Performance check:
// - Initial render < 2 seconds
// - No lag when moving mouse
```

**Success Criteria**: ✅ SST data displays as colored map

---

### Step 1.8: D3 Interactive Features
**Goal**: Add tooltips and color legend

**Tasks**:
- [ ] Create tooltip component with D3 positioning
- [ ] Add mouse hover handlers
- [ ] Display lat/lon/SST on hover
- [ ] Create color legend with D3 axis
- [ ] Add date stamp

**Testing**:
- [ ] Hover over any point → tooltip appears
- [ ] Tooltip shows correct values
- [ ] Legend displays color scale
- [ ] Date stamp shows current data date

**Files Created**:
- `components/sst-color-legend.tsx`

**Success Criteria**: ✅ Interactive features work smoothly

---

### Step 1.9: Main Page Integration
**Goal**: Integrate map into main page with proper layout

**Tasks**:
- [ ] Update `app/page.tsx` with map component
- [ ] Add header/title
- [ ] Add data source attribution
- [ ] Add "Refresh Data" button
- [ ] Style with Tailwind

**Testing**:
- [ ] Full page renders correctly
- [ ] Refresh button triggers new data fetch
- [ ] Responsive layout works on different screen sizes
- [ ] Attribution links are correct

**Success Criteria**: ✅ Complete working SST map application

---

### Step 1.10: Phase 1 Comprehensive Testing
**Goal**: Validate entire Phase 1 before moving to Phase 2

**Test Suite**:

```bash
# 1. Build test
npm run build
# Expected: Success

# 2. Production test
npm run build && npm start
# Expected: Runs on port 3000

# 3. API test
curl http://localhost:3000/api/sst-data | jq '.gridPoints | length'
# Expected: ~45000

# 4. Cache test
# - Delete cache files
# - Request data (should fetch from NOAA, takes 5-10s)
# - Request again (should be instant from cache)

# 5. Error handling test
# - Disconnect internet
# - Try to fetch data with empty cache
# - Expected: Graceful error message
```

**Manual Testing Checklist**:
- [ ] SST map loads within 3 seconds
- [ ] All grid points visible (zoom in to verify)
- [ ] Colors accurately reflect temperature
- [ ] Tooltip works on hover
- [ ] Color legend is accurate
- [ ] Date stamp is current
- [ ] Coastlines align with data
- [ ] No console errors
- [ ] Mobile responsive (if applicable)

**Success Criteria**: ✅ All tests pass, Phase 1 complete and stable

---

## PHASE 2: Maximum Potential Intensity (MPI) Calculation

### Step 2.1: PI Calculation Library - Mock Implementation
**Goal**: Create PI calculation function with simplified physics

**Tasks**:
- [ ] Create `lib/potential-intensity.ts`
- [ ] Implement Emanuel's formula (simplified version)
- [ ] Add TypeScript interfaces for atmospheric profiles
- [ ] Use mock atmospheric data (constant values)
- [ ] Calculate Vmax and Pmin

**Testing**:
```typescript
// Unit test
import { calculatePI } from '@/lib/potential-intensity';

const testProfile = {
  sst: 28.5,
  temp_surface: 26.0,
  temp_500: -5.0,
  temp_250: -45.0,
  rh_surface: 80,
  rh_850: 75,
  pressure_surface: 1013
};

const result = calculatePI(testProfile);
console.log(result);
// Expected: { vmax: 140-160 kt, pmin: 920-940 mb, category: 4 }
```

**Files Created**:
- `lib/potential-intensity.ts`
- `types/atmospheric.ts`

**Success Criteria**: ✅ PI calculation produces reasonable results

---

### Step 2.2: Atmospheric Data API - Mock Data
**Goal**: Create atmospheric data endpoint with mock data

**Tasks**:
- [ ] Create `app/api/atmospheric-data/route.ts`
- [ ] Return mock atmospheric profile for any lat/lon
- [ ] Match SST API response format
- [ ] Add caching structure (to be implemented later)

**Testing**:
```bash
curl "http://localhost:3000/api/atmospheric-data?lat=25&lon=-80"
# Expected: Atmospheric profile JSON
```

**Success Criteria**: ✅ API returns mock atmospheric data

---

### Step 2.3: Combined PI Calculation API
**Goal**: Create endpoint that combines SST + atmospheric data + PI calculation

**Tasks**:
- [ ] Create `app/api/calculate-pi/route.ts`
- [ ] Fetch SST data (from existing cache)
- [ ] For each grid point:
  - Get atmospheric profile (mock for now)
  - Calculate PI
  - Categorize (Saffir-Simpson scale)
- [ ] Return results array
- [ ] Add progress logging

**Testing**:
```bash
curl http://localhost:3000/api/calculate-pi | jq '.results | length'
# Expected: ~45000 (same as SST grid)

# Check sample values
curl http://localhost:3000/api/calculate-pi | jq '.results[0]'
# Expected: { lat, lon, vmax, pmin, category }
```

**Performance Target**: Complete calculation in < 30 seconds

**Success Criteria**: ✅ PI calculated for all grid points

---

### Step 2.4: D3 Pressure Map Component
**Goal**: Create pressure visualization map

**Tasks**:
- [ ] Create `components/d3-pressure-map.tsx`
- [ ] Use same projection as SST map
- [ ] Implement D3 sequential color scale (880-1000 mb)
- [ ] Render pressure data as colored circles
- [ ] Add pressure-specific color legend
- [ ] Add tooltip with pressure values

**Color Scale**:
```typescript
const pressureScale = d3.scaleSequential()
  .domain([880, 1000])
  .interpolator(d3.interpolateSpectral);
```

**Testing**:
- [ ] Visual: Lower pressure = warmer colors
- [ ] Tooltip shows pressure in mb
- [ ] Legend accurately represents scale

**Success Criteria**: ✅ Pressure map displays correctly

---

### Step 2.5: D3 Wind Speed Map Component
**Goal**: Create wind speed visualization with Saffir-Simpson categories

**Tasks**:
- [ ] Create `components/d3-windspeed-map.tsx`
- [ ] Implement D3 threshold scale for hurricane categories
- [ ] Render wind speed data
- [ ] Add category labels (Cat 1-5, TD, TS)
- [ ] Add wind speed contours (optional)

**Color Scale**:
```typescript
const windScale = d3.scaleThreshold()
  .domain([34, 64, 83, 96, 113, 137])
  .range(['#5b7c99', '#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026', '#800026']);
```

**Testing**:
- [ ] Visual: Categories clearly distinguished
- [ ] Colors match standard hurricane scales
- [ ] Tooltip shows wind speed and category

**Success Criteria**: ✅ Wind speed map displays correctly

---

### Step 2.6: Multi-Panel Dashboard Layout
**Goal**: Display all three maps (SST, Pressure, Wind) in organized layout

**Tasks**:
- [ ] Update `app/page.tsx` with 3-panel layout
- [ ] Add map titles
- [ ] Synchronize zoom/pan across maps (optional)
- [ ] Add toggle to switch between views
- [ ] Optimize layout for different screen sizes

**Testing**:
- [ ] All three maps load successfully
- [ ] Layout is responsive
- [ ] Performance acceptable with 3 maps

**Success Criteria**: ✅ Dashboard displays all visualizations

---

### Step 2.7: Phase 2 Testing with Mock Data
**Goal**: Validate Phase 2 functionality before real atmospheric data

**Test Suite**:
```bash
# API tests
curl http://localhost:3000/api/atmospheric-data?lat=25&lon=-80
curl http://localhost:3000/api/calculate-pi

# Visual tests
# - Open browser to http://localhost:3000
# - Verify all 3 maps render
# - Check PI values are reasonable
# - Verify categories make sense (warm water = higher category)
```

**Validation Checklist**:
- [ ] Pressure values: 920-980 mb in warm water
- [ ] Wind speeds: 100-160 kt in warm water
- [ ] Categories: Cat 3-5 where SST > 28°C
- [ ] Spatial patterns make sense (no random noise)

**Success Criteria**: ✅ Phase 2 works with mock atmospheric data

---

### Step 2.8: Real Atmospheric Data - THREDDS/OPeNDAP
**Goal**: Replace mock atmospheric data with real NOAA data

**Tasks**:
- [ ] Research available THREDDS datasets for atmospheric data
- [ ] Implement fetcher for temperature profiles
- [ ] Implement fetcher for humidity profiles
- [ ] Add caching (similar to SST)
- [ ] Test with small subset of points first

**Testing Strategy**:
```bash
# Test single point first
curl "http://localhost:3000/api/atmospheric-data?lat=25&lon=-80"
# Verify real values vs mock values

# Test grid subset (100 points)
# Compare PI results with mock vs real data
# Expect: More spatial variation with real data
```

**Success Criteria**: ✅ Real atmospheric data integrated

---

### Step 2.9: Phase 2 Comprehensive Testing
**Goal**: Full validation of MPI maps with real data

**Test Suite**:
- [ ] End-to-end data flow test
- [ ] Performance test (full grid calculation)
- [ ] Visual accuracy test (compare to historical MPI maps)
- [ ] Error handling test
- [ ] Cache invalidation test

**Success Criteria**: ✅ Phase 2 complete and production-ready

---

## PHASE 3: GRIB2 Direct Data Access

### Step 3.1: GRIB2 File Analysis
**Goal**: Understand GRIB2 structure before implementing parser

**Tasks**:
- [ ] Download sample GFS GRIB2 file
- [ ] Download corresponding .idx file
- [ ] Analyze file structure
- [ ] Identify required variables
- [ ] Calculate byte ranges for subset download

**Testing**:
```bash
# Download test files
DATE=$(date -u +%Y%m%d)
CYCLE="00"
BASE_URL="https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.${DATE}/${CYCLE}/atmos"

curl -O "${BASE_URL}/gfs.t${CYCLE}z.pgrb2.0p25.f000"
curl -O "${BASE_URL}/gfs.t${CYCLE}z.pgrb2.0p25.f000.idx"

# View index
head -50 gfs.t00z.pgrb2.0p25.f000.idx

# Find required variables
grep "TMP:" gfs.t00z.pgrb2.0p25.f000.idx | head -20
grep "RH:" gfs.t00z.pgrb2.0p25.f000.idx | head -20
```

**Documentation**:
- Document variable names and byte offsets
- Create mapping of required variables
- Note any peculiarities in the data format

**Success Criteria**: ✅ GRIB2 structure fully understood

---

### Step 3.2: GRIB2 Index Parser
**Goal**: Parse .idx files to find byte ranges

**Tasks**:
- [ ] Create `lib/grib2-index-parser.ts`
- [ ] Implement index file parser
- [ ] Extract byte ranges for specific variables
- [ ] Add validation and error handling

**Testing**:
```typescript
import { parseGRIB2Index } from '@/lib/grib2-index-parser';

const idxUrl = "https://nomads.ncep.noaa.gov/.../gfs.t00z.pgrb2.0p25.f000.idx";
const variables = ['TMP:surface', 'TMP:850 mb', 'RH:850 mb'];

const ranges = await parseGRIB2Index(idxUrl, variables);
console.log(ranges);
// Expected: Array of { variable, level, startByte, endByte }
```

**Success Criteria**: ✅ Index parser extracts correct byte ranges

---

### Step 3.3: GRIB2 Subset Downloader
**Goal**: Download only needed variables using HTTP Range requests

**Tasks**:
- [ ] Create `lib/grib2-subset-fetch.ts`
- [ ] Implement HTTP Range request logic
- [ ] Handle multiple byte ranges
- [ ] Add retry logic for network failures
- [ ] Test with small subsets first

**Testing**:
```typescript
import { fetchGRIB2Subset } from '@/lib/grib2-subset-fetch';

const gribUrl = "https://nomads.ncep.noaa.gov/.../gfs.t00z.pgrb2.0p25.f000";
const variables = ['TMP:surface'];

const data = await fetchGRIB2Subset(gribUrl, variables);
console.log(`Downloaded ${data.byteLength} bytes`);
// Expected: ~500KB instead of 500MB
```

**Success Criteria**: ✅ Subset downloading works correctly

---

### Step 3.4: Python GRIB2 Parser Setup
**Goal**: Set up Python environment for GRIB2 parsing

**Tasks**:
- [ ] Create `requirements.txt` with pygrib dependency
- [ ] Create Python virtual environment
- [ ] Test pygrib installation
- [ ] Create test script to read GRIB2 files

**Testing**:
```bash
# Setup
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Test
python3 scripts/test_grib2_read.py
# Expected: Successfully reads GRIB2 file
```

**Files Created**:
- `requirements.txt`
- `scripts/test_grib2_read.py`

**Success Criteria**: ✅ Python GRIB2 parsing environment working

---

### Step 3.5: GRIB2 Extraction Script
**Goal**: Create Python script to extract atmospheric profiles

**Tasks**:
- [ ] Create `scripts/extract_grib2.py`
- [ ] Implement variable extraction at specific lat/lon
- [ ] Add bilinear interpolation for exact coordinates
- [ ] Return JSON output for Node.js consumption
- [ ] Add error handling

**Testing**:
```bash
python3 scripts/extract_grib2.py 25.0 -80.0
# Expected: JSON with atmospheric profile
{
  "temp_surface": 26.5,
  "temp_850": 18.2,
  "temp_500": -5.4,
  "temp_250": -45.6,
  "rh_surface": 78,
  "rh_850": 72,
  "pressure_surface": 1013.2
}
```

**Success Criteria**: ✅ Python script extracts data correctly

---

### Step 3.6: Node.js → Python Integration
**Goal**: Call Python script from Node.js API route

**Tasks**:
- [ ] Update `app/api/atmospheric-grib2/route.ts`
- [ ] Implement child process to call Python
- [ ] Parse JSON output from Python
- [ ] Add timeout handling
- [ ] Add error handling for Python failures

**Testing**:
```bash
curl "http://localhost:3000/api/atmospheric-grib2?lat=25&lon=-80"
# Expected: Atmospheric profile from GRIB2
```

**Performance Test**:
- Single point: < 1 second
- 100 points: < 10 seconds

**Success Criteria**: ✅ Node.js successfully calls Python GRIB2 parser

---

### Step 3.7: GRIB2 Caching System
**Goal**: Cache GRIB2 files to avoid repeated downloads

**Tasks**:
- [ ] Create `lib/grib2-cache.ts`
- [ ] Implement cycle detection (00Z, 06Z, 12Z, 18Z)
- [ ] Cache full GRIB2 subset (6-hour TTL)
- [ ] Add cache cleanup for old files
- [ ] Store in `data/cache/grib2/`

**File Structure**:
```
data/cache/grib2/
  gfs-2025111200.grb2  (00Z cycle)
  gfs-2025111206.grb2  (06Z cycle)
  gfs-2025111212.grb2  (12Z cycle)
  ...
```

**Testing**:
```bash
# First request: Downloads GRIB2 (~5 seconds)
time curl "http://localhost:3000/api/atmospheric-grib2?lat=25&lon=-80"

# Second request: Uses cache (< 1 second)
time curl "http://localhost:3000/api/atmospheric-grib2?lat=25&lon=-80"

# Verify cache file exists
ls -lh data/cache/grib2/
```

**Success Criteria**: ✅ GRIB2 caching reduces repeated downloads

---

### Step 3.8: Batch Processing Optimization
**Goal**: Optimize to process all grid points efficiently

**Tasks**:
- [ ] Modify Python script to accept multiple lat/lon pairs
- [ ] Implement batch extraction (1000 points at a time)
- [ ] Add progress logging
- [ ] Optimize grid interpolation

**Testing**:
```bash
# Process 1000 points
time curl -X POST http://localhost:3000/api/calculate-pi-grib2 \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 1000}'

# Expected: < 30 seconds per batch
```

**Target Performance**:
- Full Atlantic basin (45k points): < 10 minutes

**Success Criteria**: ✅ Batch processing works efficiently

---

### Step 3.9: Replace Phase 2 Atmospheric Data
**Goal**: Switch from THREDDS to GRIB2 for atmospheric data

**Tasks**:
- [ ] Update `app/api/calculate-pi/route.ts` to use GRIB2
- [ ] Add fallback to THREDDS if GRIB2 fails
- [ ] Compare results (GRIB2 vs THREDDS)
- [ ] Document any differences

**Testing**:
```bash
# Compare outputs
curl http://localhost:3000/api/calculate-pi?source=thredds > thredds.json
curl http://localhost:3000/api/calculate-pi?source=grib2 > grib2.json

# Visual comparison on map
# Expected: GRIB2 should have more detail/accuracy
```

**Success Criteria**: ✅ GRIB2 data produces better results

---

### Step 3.10: Phase 3 Comprehensive Testing
**Goal**: Full validation of GRIB2 implementation

**Test Suite**:

**1. Data Accuracy Test**:
```bash
# Compare single point across all methods:
# - Mock data
# - THREDDS data  
# - GRIB2 data
# Verify GRIB2 is most accurate
```

**2. Performance Test**:
```bash
# Full grid processing time
time curl http://localhost:3000/api/calculate-pi

# Target: < 15 minutes for full Atlantic basin
```

**3. Cache Efficiency Test**:
```bash
# Clear cache
rm -rf data/cache/grib2/*

# First run (downloads GRIB2)
time curl http://localhost:3000/api/calculate-pi
# Note time

# Second run (uses cache)
time curl http://localhost:3000/api/calculate-pi
# Should be 5-10x faster
```

**4. Error Handling Test**:
- [ ] GRIB2 file unavailable → fallback to THREDDS
- [ ] Python script fails → graceful error
- [ ] Network timeout → retry logic works

**5. Production Readiness Test**:
- [ ] 24-hour uptime test
- [ ] Memory leak test (multiple requests)
- [ ] Concurrent request handling
- [ ] Error logging comprehensive

**Success Criteria**: ✅ Phase 3 complete and production-ready

---

## FINAL VALIDATION & DEPLOYMENT

### Pre-Deployment Checklist

**Code Quality**:
- [ ] All TypeScript types properly defined
- [ ] No `any` types (except where absolutely necessary)
- [ ] ESLint passes with no warnings
- [ ] Code comments for complex logic
- [ ] README updated with usage instructions

**Performance**:
- [ ] SST map loads in < 3 seconds
- [ ] PI calculation completes in < 15 minutes
- [ ] Cache reduces repeat requests by 90%
- [ ] No memory leaks during 100+ requests

**Error Handling**:
- [ ] All API routes have try/catch blocks
- [ ] User-friendly error messages
- [ ] Fallback mechanisms in place
- [ ] Logging for debugging

**Documentation**:
- [ ] API endpoints documented
- [ ] Data sources cited
- [ ] Cache strategy explained
- [ ] Known limitations listed

**Security**:
- [ ] No API keys exposed in client code
- [ ] Cache directory not publicly accessible
- [ ] Input validation on all API routes
- [ ] Rate limiting considered (if needed)

---

## Testing Strategy Summary

### Unit Tests (Create as you go)
```
lib/__tests__/
  potential-intensity.test.ts
  grib2-parser.test.ts
  cache-manager.test.ts
```

### Integration Tests
```
app/api/__tests__/
  sst-data.test.ts
  calculate-pi.test.ts
  atmospheric-grib2.test.ts
```

### End-to-End Tests
```
e2e/
  sst-map.spec.ts
  pi-dashboard.spec.ts
  data-refresh.spec.ts
```

### Manual Testing Checklist
**After Each Phase**:
- [ ] Visual inspection (maps render correctly)
- [ ] Data validation (values are reasonable)
- [ ] Performance check (acceptable speed)
- [ ] Error handling (graceful failures)
- [ ] Cache verification (working as expected)

### Rollback Plan
**If something breaks**:
1. Check git status - commit before each step
2. Use feature flags to disable new features
3. Fallback mechanisms already in code (GRIB2 → THREDDS → Mock)
4. Cache can be cleared without breaking anything

---

## Timeline Estimate

**Phase 1: SST Mapping**
- Setup & API: 2-3 days
- D3 Visualization: 2-3 days
- Testing & Polish: 1 day
- **Total: ~1 week**

**Phase 2: MPI Calculation**
- Mock implementation: 1 day
- Real atmospheric data: 2-3 days
- Multiple map panels: 2 days
- Testing: 1 day
- **Total: ~1 week**

**Phase 3: GRIB2 Integration**
- Analysis & setup: 1 day
- Python parsing: 2 days
- Integration & optimization: 2-3 days
- Comprehensive testing: 1-2 days
- **Total: ~1-1.5 weeks**

**Grand Total: 3-4 weeks** for full implementation

---

## Risk Mitigation

### Risk 1: NOAA Data Source Unavailable
**Mitigation**: 
- Cache data locally
- Implement retry logic with exponential backoff
- Add fallback to previous day's data
- Monitor NOAA status pages

### Risk 2: GRIB2 Parsing Complexity
**Mitigation**:
- Start with Python (pygrib is battle-tested)
- Can pivot to TypeScript library later if needed
- Phase 2 still works without Phase 3
- Extensive testing with sample files first

### Risk 3: Performance Issues (45k grid points)
**Mitigation**:
- Implement batch processing
- Add loading indicators
- Consider progressive rendering
- Optimize D3 rendering (canvas fallback if needed)

### Risk 4: Memory Leaks with Large Datasets
**Mitigation**:
- Clear D3 selections properly
- Monitor with Chrome DevTools
- Implement data pagination if needed
- Server-side garbage collection for cache

---

## Success Metrics

### Phase 1 Complete When:
✅ SST map displays real NOAA data  
✅ Data updates daily via cache  
✅ Interactive tooltips work  
✅ No performance issues  

### Phase 2 Complete When:
✅ MPI calculations scientifically accurate  
✅ Three maps display pressure, wind, SST  
✅ Values match historical MPI maps  
✅ Full grid processed in reasonable time  

### Phase 3 Complete When:
✅ GRIB2 data provides better accuracy than Phase 2  
✅ Cache system works efficiently  
✅ No dependency on intermediate APIs  
✅ Production-ready performance  

### Project Complete When:
✅ All phases working together seamlessly  
✅ Comparable to original NOAA/COLA MPI maps  
✅ Deployed and accessible to users  
✅ Documentation complete  

---

## Notes

- **Commit often**: After each step, commit with descriptive message
- **Test incrementally**: Don't wait until the end to test
- **Keep it simple**: Start with basic implementation, optimize later
- **Document as you go**: Add comments and update README
- **Monitor NOAA**: Data sources can change, stay informed

**Remember**: The goal is scientific accuracy and reliability. Take time to validate data at each step!

