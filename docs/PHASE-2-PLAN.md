# Phase 2: Maximum Potential Intensity (MPI) Calculation - Implementation Plan

**Last Updated**: November 12, 2025 (after NSST migration)  
**Status**: Ready to implement

## Overview
Phase 2 implements the core MPI calculation functionality using Emanuel's thermodynamic method, creating three visualization maps: SST (existing), Pressure, and Wind Speed.

**Key Principles**:
- **Scientific Accuracy**: ⚠️ **CRITICAL** - The goal is accurate data. We must implement the **complete Emanuel's formula** from the start - no simplifications. Accuracy is the whole point of this project.
- **Show Our Work**: All calculations must be documented, traceable, and validatable by experts. Include references, validation data, and clear documentation of methods.
- **Real Data**: Use real atmospheric data (GRIB2 from NOMADS preferred for consistency with NSST, or THREDDS/OPeNDAP)
- **Smart Caching**: Don't fetch data every time - 6 hour minimum between checks, respect recent fetches (within 20 minutes)
- **Calculate Once**: PI calculation happens once per dataset, results are cached (not recalculated for each basin request)
- **Layout**: Top/bottom for single basin (SST top, Pressure/Wind bottom side-by-side)
- **Categories**: Include all Saffir-Simpson categories (TD, TS, Cat 1-5)
- **Server Actions**: Use Server Actions pattern (consistent with NSST migration), not API routes

---

## Implementation Decisions (Confirmed)

### 1. Emanuel's Formula Implementation
- **Decision**: ⚠️ **Implement COMPLETE Emanuel's formula from the start** - no simplifications
- **Critical Requirement**: Scientific accuracy is the whole point of this project. We need to "show our work" for expert validation.
- **Requirements**:
  - Full vertical profile integration (all atmospheric levels, not just 4 key levels)
  - Complete thermodynamic calculations as per Emanuel's method
  - Document all equations, constants, and assumptions
  - Include validation against known MPI values from literature
  - Make calculations traceable and reviewable by experts
- **Documentation**: Must include references to Emanuel's papers, equation numbers, and validation data

### 2. Atmospheric Data Source
- **Decision**: Use **REAL data from NOMADS GRIB2** (preferred for consistency with NSST) or THREDDS/OPeNDAP
- **Rationale**: NSST migration (Phase 3) showed GRIB2 is more efficient and consistent. Consider GRIB2 for atmospheric data too.
- **Testing Strategy**: Can scale to subset of grid points for initial testing, but use full data for final validation
- **Caching**: 6-hour minimum between NOAA checks, respect if we just checked within last 20 minutes
- **Server Actions**: Use Server Actions pattern (not API routes) for consistency with NSST implementation

### 3. Multi-Panel Layout
- **Decision**: **Top/Bottom layout** for single basin:
  - SST Map: Top (full width)
  - Pressure & Wind Maps: Bottom (side-by-side, 50/50 split)

### 4. Performance & Caching Strategy
- **Decision**: Performance time is fine - we calculate PI **once per dataset**, not every basin request
- **Caching**: PI calculation results are cached with the dataset
- **Atmospheric Data**: Cache with 6-hour TTL, check if recently fetched (within 20 minutes)

### 5. Saffir-Simpson Categories
- **Decision**: Include **all categories** (TD, TS, Cat 1-5)
- **Initial Implementation**: Can start with just one category for testing, then expand to all

---

## Phase 2 Task List

### **Task 2.1: PI Calculation Library - Complete Emanuel's Formula Implementation**
**Priority**: High | **Estimated Time**: 12-16 hours (increased for complete implementation)

**⚠️ CRITICAL REQUIREMENT**: Implement the **COMPLETE Emanuel's thermodynamic method** - no simplifications. Scientific accuracy and expert validation are the core goals.

**Subtasks**:
- [ ] Create `lib/potential-intensity.ts`
- [ ] Create `types/atmospheric.ts` with interfaces:
  - `AtmosphericProfile` (complete vertical profile with all required levels)
  - `PIResult` (vmax, pmin, category, calculation metadata)
  - `CalculationMetadata` (equations used, constants, validation info)
- [ ] Research and document complete Emanuel's thermodynamic method:
  - Read Emanuel's papers (1986, 1988, 1995)
  - Document all equations with references
  - Identify all required atmospheric levels
  - Document all constants and their sources
- [ ] Implement **COMPLETE Emanuel's formula**:
  - Full vertical profile integration (all required atmospheric levels)
  - Complete thermodynamic calculations
  - Proper handling of all physical processes
  - Input: SST + complete atmospheric profile
  - Output: Vmax (knots), Pmin (millibars), Category, metadata
- [ ] Add comprehensive documentation:
  - Equation references (Emanuel paper citations)
  - Constant values and sources
  - Calculation steps with comments
  - Validation notes
- [ ] Add Saffir-Simpson categorization function (all categories: TD, TS, Cat 1-5)
- [ ] Add unit conversion utilities (m/s ↔ knots, Pa ↔ mb, K ↔ °C)
- [ ] Add validation/error handling
- [ ] Create validation test suite:
  - Test against known MPI values from literature
  - Compare with published Emanuel's formula results
  - Validate edge cases

**Documentation Requirements**:
- All equations must reference Emanuel's papers (year, equation number)
- All constants must be documented with sources
- Calculation steps must be clearly commented
- Include validation data and comparisons
- Make code reviewable by experts

**Testing**:
```typescript
// Test with known values from literature
const profile = {
  sst: 28.5,
  // Complete vertical profile (all required levels)
  temp_surface: 26.0,
  temp_850: 18.0,
  temp_500: -5.0,
  temp_250: -45.0,
  // ... all other required levels
  rh_surface: 80,
  rh_850: 75,
  // ... all other required levels
  pressure_surface: 1013
};
const result = calculatePI(profile);
// Expected: vmax ~140-160 kt, pmin ~920-940 mb, category 4
// Must match published Emanuel's formula results for same conditions
```

**Validation Requirements**:
- Compare results with published Emanuel's formula calculations
- Validate against known hurricane intensity data
- Test edge cases (very warm SST, very cold SST, extreme atmospheric conditions)
- Document any discrepancies and their sources

**Files Created**:
- `lib/potential-intensity.ts` (complete implementation with full documentation)
- `types/atmospheric.ts`
- `docs/EMANUEL-FORMULA-IMPLEMENTATION.md` (detailed documentation of method)

**Success Criteria**: 
- ✅ Complete Emanuel's formula implemented (no simplifications)
- ✅ Results match published Emanuel's formula calculations
- ✅ All equations documented with references
- ✅ Validation test suite passes
- ✅ Code is reviewable by experts

---

### **Task 2.2: Atmospheric Data - GRIB2/NOMADS or THREDDS/OPeNDAP Implementation**
**Priority**: High | **Estimated Time**: 6-10 hours (longer if GRIB2 approach)

**Decision Point**: Choose between:
- **Option A**: GRIB2 from NOMADS (consistent with NSST, more efficient, already have infrastructure)
- **Option B**: THREDDS/OPeNDAP (simpler parsing, but different from NSST approach)

**Recommendation**: Consider GRIB2 for consistency, but THREDDS is acceptable if simpler.

**Subtasks**:
- [ ] Research available atmospheric data sources:
  - NOMADS GRIB2 (GFS atmospheric data)
  - THREDDS/OPeNDAP datasets for GFS atmospheric data
- [ ] Decide on data source (GRIB2 vs OPeNDAP)
- [ ] Create Server Action: `app/actions/atmospheric-data.ts` (not API route)
- [ ] Implement `fetchAtmosphericData()` function:
  - Accept bounds or grid points
  - Fetch **complete vertical profile** (all levels required for complete Emanuel's formula):
    - Temperature: surface, 850mb, 700mb, 500mb, 400mb, 300mb, 250mb, 200mb, 150mb, 100mb (and any other levels required)
    - Relative humidity: surface, 850mb, 700mb, 500mb, 400mb, 300mb (and any other levels required)
    - Pressure: surface and all standard levels
    - Wind: if needed for complete Emanuel's formula
  - **Note**: Must fetch ALL levels required by complete Emanuel's method - no shortcuts
- [ ] Parse data format:
  - If GRIB2: Use Python script (similar to NSST) or GRIB2 library
  - If OPeNDAP: Parse ASCII format (similar to old SST parser)
- [ ] Add TypeScript types matching `AtmosphericProfile` (complete vertical profile)
- [ ] Implement caching with 6-hour minimum TTL:
  - Check if we fetched within last 6 hours
  - If fetched within last 20 minutes, use cache without checking
  - Similar pattern to NSST cache manager
- [ ] Add error handling for invalid coordinates and network failures
- [ ] Add comprehensive logging (similar to NSST implementation)
- [ ] Support subset of grid points for testing (can scale down initially)
- [ ] Document data source, resolution, and any limitations

**Caching Strategy**:
- File-based cache: `data/cache/atmospheric/atmospheric-YYYY-MM-DD-HH.json`
- Check timestamp: if < 6 hours old, use cache
- If fetched within 20 minutes, skip NOAA check entirely
- Cache key includes data date to match SST data

**Testing**:
```bash
# Single point test
curl "http://localhost:3000/api/atmospheric-data?lat=25&lon=-80"
# Expected: Real atmospheric profile from NOAA

# Verify caching
# First request: fetches from NOAA
# Second request (within 20 min): uses cache without checking
# Third request (after 6 hours): checks NOAA for updates
```

**Files Created**:
- `app/actions/atmospheric-data.ts` (Server Action, not API route)
- If GRIB2: `lib/atmospheric-grib2-parser.ts` and `scripts/extract-atmospheric-data.py`
- If OPeNDAP: `lib/atmospheric-opendap-parser.ts`
- Update `lib/cache-manager.ts` to support atmospheric data caching

**Success Criteria**: 
- ✅ Server Action returns real atmospheric data with complete vertical profile
- ✅ Proper caching implemented
- ✅ Data format matches requirements for complete Emanuel's formula

---

### **Task 2.3: Combined PI Calculation Server Action**
**Priority**: High | **Estimated Time**: 4-6 hours

**Subtasks**:
- [ ] Create `app/actions/calculate-pi.ts` (Server Action, not API route)
- [ ] Fetch SST data (reuse existing cache from `getSSTData()` Server Action)
- [ ] Check if PI results already cached for this dataset:
  - Cache key: `pi-{sst-date}-{atmospheric-date}.json`
  - If cached and valid, return cached results immediately
- [ ] If not cached, calculate PI for all grid points:
  - Get atmospheric profile for each point (from cached atmospheric data)
  - Calculate PI using `calculatePI()`
  - Categorize using Saffir-Simpson scale
  - Store result: `{ lat, lon, sst, vmax, pmin, category }`
- [ ] Add progress logging (log every 10% completion)
- [ ] Cache PI calculation results (once per dataset, not per request)
- [ ] Return results array with metadata

**Caching Strategy**:
- **Key Point**: Calculate PI **once per dataset**, cache results
- Cache file: `data/cache/pi/pi-{sst-date}-{atmospheric-date}.json`
- Cache is valid as long as SST and atmospheric data dates match
- No need to recalculate when switching basins - use same cached results

**Performance Optimization**:
- Batch atmospheric data fetching (fetch all needed points at once if possible)
- Consider processing subset for initial testing (e.g., 1000 points)
- Add timeout handling
- Progress logging for long calculations

**Response Format**:
```typescript
{
  date: "2025-11-12",
  gridPoints: [
    {
      lat: 25.0,
      lon: -80.0,
      sst: 28.5,
      vmax: 145,  // knots
      pmin: 925,  // millibars
      category: 4
    },
    // ... ~45k points
  ],
  bounds: {...},
  pointCount: 45000
}
```

**Testing**:
```typescript
// In component or test
import { calculatePI } from '@/app/actions/calculate-pi';

// First call - calculates and caches
const result1 = await calculatePI();
// Expected: ~45000 points (or subset if testing), takes time to calculate

// Second call - uses cache (instant)
const result2 = await calculatePI();
// Expected: ~45000 points, returns instantly from cache

// Verify results include metadata
console.log(result1.gridPoints[0]);
// Expected: { lat, lon, sst, vmax, pmin, category, metadata }
```

**Files Created**:
- `app/actions/calculate-pi.ts` (Server Action, not API route)
- `types/pi.ts` (PI result types including metadata)
- Update `lib/cache-manager.ts` to support PI result caching

**Success Criteria**: 
- ✅ PI calculated once per dataset using complete Emanuel's formula
- ✅ Cached results reused efficiently
- ✅ Results include calculation metadata for validation

---

### **Task 2.4: D3 Pressure Map Component**
**Priority**: High | **Estimated Time**: 5-6 hours

**Subtasks**:
- [ ] Create `components/d3-pressure-map.tsx`
- [ ] Reuse projection setup from `d3-sst-map.tsx`
- [ ] Implement D3 sequential color scale (880-1000 mb)
- [ ] Render pressure data as SVG circles (similar to SST map)
- [ ] Add pressure-specific tooltip (show pressure in mb)
- [ ] Create `components/pressure-color-legend.tsx`
- [ ] Add loading/error states
- [ ] Integrate with PI calculation API

**Color Scale**:
```typescript
const pressureScale = d3.scaleSequential()
  .domain([880, 1000])  // Low pressure = stronger storm
  .interpolator(d3.interpolateSpectral.reverse());
// Lower pressure = warmer colors (red/purple)
// Higher pressure = cooler colors (blue/green)
```

**Features**:
- Same geographic features as SST map (coastlines, grid lines)
- Interactive tooltips
- Color legend with D3 axis
- Date stamp

**Testing**:
- Visual: Lower pressure areas show warmer colors
- Tooltip: Displays pressure in millibars
- Legend: Accurately represents 880-1000 mb range
- Performance: Renders ~45k points smoothly

**Files Created**:
- `components/d3-pressure-map.tsx`
- `components/pressure-color-legend.tsx`

**Success Criteria**: ✅ Pressure map displays correctly with proper colors

---

### **Task 2.5: D3 Wind Speed Map Component**
**Priority**: High | **Estimated Time**: 5-6 hours

**Subtasks**:
- [ ] Create `components/d3-windspeed-map.tsx`
- [ ] Implement D3 threshold scale for Saffir-Simpson categories
- [ ] Render wind speed data as colored circles
- [ ] Add category labels (TD, TS, Cat 1-5)
- [ ] Create `components/windspeed-color-legend.tsx`
- [ ] Add tooltip showing wind speed (knots) and category
- [ ] Add loading/error states
- [ ] Integrate with PI calculation API

**Color Scale** (Saffir-Simpson):
```typescript
const windScale = d3.scaleThreshold<number, string>()
  .domain([34, 64, 83, 96, 113, 137])  // Category thresholds in knots
  .range([
    '#5b7c99',  // TD: < 34 kt (gray-blue)
    '#ffffb2',  // TS: 34-63 kt (yellow)
    '#fecc5c',  // Cat 1: 64-82 kt (orange-yellow)
    '#fd8d3c',  // Cat 2: 83-95 kt (orange)
    '#f03b20',  // Cat 3: 96-112 kt (red)
    '#bd0026',  // Cat 4: 113-136 kt (dark red)
    '#800026'   // Cat 5: ≥ 137 kt (maroon)
  ]);
```

**Features**:
- Same geographic features as other maps
- Category-based coloring
- Interactive tooltips with category name
- Color legend with category labels

**Testing**:
- Visual: Categories clearly distinguished by color
- Tooltip: Shows wind speed and category name
- Legend: All categories displayed correctly
- Performance: Renders smoothly

**Files Created**:
- `components/d3-windspeed-map.tsx`
- `components/windspeed-color-legend.tsx`

**Success Criteria**: ✅ Wind speed map displays with correct category colors

---

### **Task 2.6: Multi-Panel Dashboard Layout**
**Priority**: Medium | **Estimated Time**: 3-4 hours

**Subtasks**:
- [ ] Update `app/page.tsx` with top/bottom layout for single basin
- [ ] Arrange maps:
  - **Top**: SST Map (full width)
  - **Bottom**: Pressure & Wind Maps (side-by-side, 50/50 split)
- [ ] Add map titles/headers
- [ ] Synchronize data date across all maps
- [ ] Add "Calculate PI" button (only needed if not already calculated)
- [ ] Add loading state for PI calculation (first time only)
- [ ] Show cached status indicator
- [ ] Style with Tailwind CSS
- [ ] Make responsive for different screen sizes

**Layout Structure** (Single Basin):
```
┌─────────────────────────────────────┐
│         SST Map (Full Width)        │
├──────────────────┬──────────────────┤
│  Pressure Map    │  Wind Speed Map  │
│    (50% width)   │    (50% width)   │
└──────────────────┴──────────────────┘
```

**Features**:
- Shared data date display
- Unified refresh button (refreshes SST, atmospheric, and PI data)
- Cache status indicator
- Responsive grid layout
- Consistent styling

**Testing**:
- All three maps load successfully
- Layout is responsive (mobile, tablet, desktop)
- Buttons work correctly
- Performance acceptable with 3 maps
- Cached results load instantly

**Files Modified**:
- `app/page.tsx`

**Success Criteria**: ✅ Dashboard displays all three maps in top/bottom layout

---

### **Task 2.7: Phase 2 Testing with Real Data**
**Priority**: High | **Estimated Time**: 2-3 hours

**Subtasks**:
- [ ] Test PI calculation API with full grid (or subset for initial testing)
- [ ] Verify pressure values are reasonable (920-980 mb in warm water)
- [ ] Verify wind speeds are reasonable (100-160 kt in warm water)
- [ ] Verify categories make sense (Cat 3-5 where SST > 28°C)
- [ ] Test spatial patterns (smooth gradients, realistic distribution)
- [ ] Test caching behavior:
  - First request calculates and caches
  - Second request uses cache (instant)
  - Atmospheric data respects 6-hour minimum
- [ ] Visual inspection of all three maps
- [ ] Cross-browser testing

**Validation Checklist**:
- [ ] Pressure values: 920-980 mb in warm water (SST > 28°C)
- [ ] Wind speeds: 100-160 kt in warm water
- [ ] Categories: Cat 3-5 where SST > 28°C
- [ ] Spatial patterns: Smooth gradients, realistic distribution
- [ ] Caching: PI calculated once, reused efficiently
- [ ] Atmospheric caching: 6-hour minimum respected
- [ ] UI: All maps render correctly
- [ ] Tooltips: Work on all maps
- [ ] Legends: Accurate and readable

**Success Criteria**: ✅ Phase 2 works correctly with real atmospheric data and proper caching

---

### **Task 2.8: Validation and Expert Review Preparation**
**Priority**: High | **Estimated Time**: 4-6 hours

**Note**: This task is critical for ensuring scientific accuracy and expert validation. All calculations must be reviewable.

**Subtasks**:
- [ ] Create comprehensive documentation:
  - `docs/EMANUEL-FORMULA-IMPLEMENTATION.md` - Complete method documentation
  - `docs/VALIDATION-RESULTS.md` - Comparison with published results
  - `docs/CALCULATION-EXAMPLES.md` - Step-by-step examples
- [ ] Validate against known MPI values from literature:
  - Compare with published Emanuel's formula results
  - Test with known hurricane intensity data
  - Document any discrepancies
- [ ] Create validation test suite:
  - Test cases with known expected results
  - Edge case testing
  - Performance benchmarks
- [ ] Prepare code for expert review:
  - Ensure all equations are clearly documented
  - Include references to Emanuel's papers
  - Make calculation steps traceable
  - Add comments explaining physical processes
- [ ] Document data sources and limitations:
  - Atmospheric data source and resolution
  - SST data source and resolution
  - Any approximations or assumptions
  - Known limitations

**Success Criteria**: 
- ✅ Complete documentation for expert review
- ✅ Validation results match published Emanuel's formula calculations
- ✅ Code is reviewable and traceable
- ✅ All assumptions and limitations documented

---

### **Task 2.9: Phase 2 Comprehensive Testing**
**Priority**: High | **Estimated Time**: 2-3 hours

**Test Suite**:

**1. Server Action Tests**:
```typescript
// PI calculation Server Action
import { calculatePI } from '@/app/actions/calculate-pi';
const result = await calculatePI();
// Expected: ~45000 points with complete Emanuel's formula results

// Atmospheric data Server Action
import { getAtmosphericData } from '@/app/actions/atmospheric-data';
const profile = await getAtmosphericData({ lat: 25, lon: -80 });
// Expected: Complete vertical profile matching AtmosphericProfile type
```

**2. Visual Tests**:
- [ ] All three maps render correctly
- [ ] Colors are accurate and meaningful
- [ ] Tooltips work on all maps
- [ ] Legends are correct
- [ ] Geographic features align properly

**3. Performance Tests**:
- [ ] Full PI calculation < 30 seconds (mock data)
- [ ] Maps render smoothly (< 2 seconds)
- [ ] No memory leaks during multiple calculations

**4. Error Handling Tests**:
- [ ] API failures handled gracefully
- [ ] Invalid coordinates return errors
- [ ] Network timeouts handled

**5. Integration Tests**:
- [ ] SST data flows correctly to PI calculation
- [ ] Atmospheric data integrates properly
- [ ] All three maps use same data date

**Success Criteria**: ✅ Phase 2 complete and production-ready

---

## Implementation Order

**Recommended Sequence**:
1. **Task 2.1** → PI calculation library (foundation, simplified version)
2. **Task 2.2** → Real atmospheric data API with THREDDS (with proper caching)
3. **Task 2.3** → Combined PI API (core functionality, with result caching)
4. **Task 2.4** → Pressure map (first visualization)
5. **Task 2.5** → Wind speed map (second visualization, can start with one category)
6. **Task 2.6** → Dashboard layout (top/bottom for single basin)
7. **Task 2.7** → Testing with real data (validation)
8. **Task 2.8** → Complete Emanuel's formula (future enhancement for accuracy)
9. **Task 2.9** → Comprehensive testing (final validation)

---

## Dependencies

**External Libraries Needed**:
- None new (D3 already installed)

**Data Sources**:
- SST data: ✅ Already working (NSST from NOMADS GRIB2 - Phase 3 migration)
- Atmospheric data: GRIB2/NOMADS (preferred) or THREDDS/OPeNDAP (Task 2.2) with 6-hour caching

**Type Definitions**:
- `types/atmospheric.ts` - New
- `types/pi.ts` - New
- `types/sst.ts` - ✅ Already exists
- `types/geographic.ts` - ✅ Already exists

---

## Success Metrics

**Phase 2 Complete When**:
- ✅ PI calculations scientifically accurate
- ✅ Three maps display pressure, wind, SST
- ✅ Values are reasonable (match expected ranges)
- ✅ Full grid processed in < 30 seconds (mock data)
- ✅ UI is responsive and user-friendly
- ✅ All tests pass

---

## Notes

- **⚠️ CRITICAL: Complete Emanuel's Formula**: Implement the complete method from the start - no simplifications. Scientific accuracy is the core goal.
- **Show Our Work**: All calculations must be documented, traceable, and validatable by experts. Include references, validation data, and clear documentation.
- **Real data from start**: Use real atmospheric data (GRIB2/NOMADS preferred for consistency, or THREDDS/OPeNDAP)
- **Server Actions**: Use Server Actions pattern (consistent with NSST migration), not API routes
- **Smart caching**: 
  - Atmospheric data: 6-hour minimum between checks, respect 20-minute recent fetch
  - PI results: Calculate once per dataset, cache and reuse
- **Subset testing**: Can scale to subset of grid points for initial testing, but validate with full data
- **Scientific accuracy**: The goal is accurate data - complete Emanuel's formula implementation required
- **Performance**: Calculate once, cache results - no need to recalculate for each basin
- **Layout**: Top/bottom for single basin view
- **Categories**: Include all Saffir-Simpson categories (TD, TS, Cat 1-5)
- **Documentation**: Must include equation references, validation data, and expert-reviewable code
- **Commit frequently** after each task completion

---

## Changes Since Original Plan

**Updated November 12, 2025** (after NSST migration):

1. **Emanuel's Formula**: Changed from "simplified version" to **complete implementation from the start**
   - Original: Start simplified, plan for complete later
   - Updated: Implement complete method immediately - accuracy is critical
   - Reason: User requirement - need accurate data and ability to "show our work" for expert validation

2. **Data Source**: SST now from NSST (NOMADS GRIB2), not OISST (OPeNDAP)
   - Updated references to reflect NSST migration
   - Consider GRIB2 for atmospheric data for consistency

3. **Architecture**: Use Server Actions, not API routes
   - Consistent with NSST migration pattern
   - Better TypeScript support
   - Modern Next.js approach

4. **Documentation Requirements**: Added emphasis on "showing our work"
   - Must document all equations with references
   - Must include validation data
   - Must be reviewable by experts
   - Must include calculation metadata

5. **Task 2.8**: Changed from "Complete Emanuel's Formula" to "Validation and Expert Review Preparation"
   - Complete formula is now in Task 2.1
   - Task 2.8 focuses on validation and documentation

## Ready to Implement

All decisions confirmed. Ready to proceed with implementation in the recommended order.

**⚠️ Remember**: Scientific accuracy is paramount. Implement complete Emanuel's formula from the start, document everything, and make it reviewable by experts.

