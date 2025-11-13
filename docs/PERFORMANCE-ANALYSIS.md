# Performance Analysis

## Caching Strategy

### ✅ What IS Cached (Working Correctly)

1. **PI Calculation Results** (`data/cache/pi/`)
   - Cached after calculation completes
   - Checked before recalculating
   - Cache key: `{sstDate}-{atmosphericDate}.json`

2. **Atmospheric Data (Extracted JSON)** (`data/cache/atmospheric/`)
   - Cached after GRIB2 extraction
   - Checked before re-extracting
   - Cache key: `atmospheric-{date}.json`
   - TTL: 6 hours (20-minute recent fetch bypass)

3. **GRIB2 Files** (`data/cache/grib2/`)
   - **NSST GRIB2**: Cached after download
   - **GFS GRIB2**: Cached after download
   - Checked before re-downloading
   - GRIB2 files can be reused even if older than 24 hours

4. **SST Data (Extracted JSON)** (`data/cache/sst/`)
   - Cached after GRIB2 extraction
   - Checked before re-extracting

### ❌ Performance Bottlenecks

1. **Land Filtering (Expensive)**
   - Location: `components/d3-pressure-map.tsx` lines 187-222
   - Runs on EVERY basin change
   - Operations:
     - Fetches TopoJSON file (async, but happens every time)
     - Filters all coastline features
     - For each data point, checks against ALL land features using `d3.geoContains()`
   - **Impact**: With 50,000+ points, this is O(n*m) where n=points, m=features
   - **Solution**: Cache filtered results per basin, or use spatial indexing

2. **D3 Rendering**
   - Drawing thousands of grid cells (one SVG rect per point)
   - Projection calculations for each cell
   - **Impact**: Linear with number of points, but can be slow with 50,000+ points
   - **Solution**: Use canvas instead of SVG for large datasets, or implement virtual scrolling

3. **TopoJSON Loading**
   - Fetched on every basin change
   - **Impact**: Network request + parsing overhead
   - **Solution**: Cache TopoJSON in memory or use a service worker

## Recommendations

### Immediate Fixes

1. **Cache Land-Filtered Results**
   - Store filtered points per basin in component state
   - Only re-filter when basin changes AND data changes
   - Use `useMemo` to memoize filtered results

2. **Optimize Land Filtering**
   - Use spatial indexing (R-tree) for faster point-in-polygon checks
   - Or pre-compute land mask as a grid

3. **Memoize TopoJSON**
   - Load TopoJSON once and cache in component state
   - Or use a global cache/context

### Future Optimizations

1. **Canvas Rendering**
   - Switch from SVG to Canvas for large datasets
   - Much faster for 10,000+ points

2. **Web Workers**
   - Move land filtering to a Web Worker
   - Non-blocking UI during filtering

3. **Virtual Scrolling**
   - Only render visible cells
   - Use intersection observer or viewport culling

