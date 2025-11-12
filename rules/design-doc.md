# Maximum Potential Hurricane Intensity Maps - Design Document

## Project Overview

This project aims to recreate the Maximum Potential Hurricane Intensity (MPI) maps originally hosted by NOAA/COLA, which were taken offline. These maps display potential minimum central pressure and maximum wind speeds for hurricanes based on current atmospheric and oceanic conditions, calculated using Dr. Kerry Emanuel's thermodynamic method.

**Critical Requirements**:
- **Government data sources only** - No commercial services (Open-Meteo, etc.)
- **D3.js for mapping** - Professional cartographic rendering, not canvas
- **Server-side GRIB2 parsing** - For long-term scalability
- **Scientific accuracy** - This is a climate research tool

---

## Phase 1: Sea Surface Temperature (SST) Mapping ✓ WORKING

### Objective
Display current, high-resolution sea surface temperature data for the Atlantic basin (5°N-45°N, 95°W-10°W) on an interactive D3 map with proper geographic context.

### Data Source

**NOAA Physical Sciences Laboratory (PSL) OISST v2.1**
- URL: `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.YEAR.nc.ascii`
- Resolution: 0.25° x 0.25° (approximately 45,000 grid points for Atlantic basin)
- Update frequency: Daily (typically 1-2 day lag)
- Format: NetCDF via OPeNDAP ASCII protocol
- Coverage: Global, including full Atlantic basin
- Authorization: None required (public dataset)
- **Status**: VERIFIED WORKING

\`\`\`typescript
// app/api/sst-data/route.ts
import { NextResponse } from 'next/server';

// data cache (24 hour TTL)
store data in a server file, check for date and refresh once daily. 
If data does not exist, fetch new data, check for data file and use it if current. 
Use a naming convention that reflects the current dataset, we will store historical data. 


export async function GET() {
  try {
    // Check cache
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
      console.log('[v0] Returning cached SST data');
      return NextResponse.json(cachedData.data);
    }

    // Fetch new data
    const data = await fetchSSTDataFromNOAA();
    
    // Cache the result
    cachedData = {
      data,
      timestamp: Date.now()
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('[v0] Error fetching SST data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SST data' },
      { status: 500 }
    );
  }
}

async function fetchSSTDataFromNOAA() {
  const currentYear = new Date().getFullYear();
  
  // Step 1: Get latest available date from metadata
  const metadataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${currentYear}.nc.ascii?time[0:1:0]`;
  const metadataResponse = await fetch(metadataUrl);
  const metadataText = await metadataResponse.text();
  
  // Parse the time dimension to get max index
  const timeMatch = metadataText.match(/time\[(\d+)\]/);
  const maxTimeIndex = timeMatch ? parseInt(timeMatch[1]) : 0;
  
  // Use latest available date (accounting for 2-day lag)
  const timeIndex = Math.max(0, maxTimeIndex - 2);
  
  // Step 2: Fetch SST data for Atlantic basin
  // Latitude: 5°N to 45°N (index 100 to 260 in 0.25° grid starting at -89.875)
  // Longitude: -95°W to -10°W (index 420 to 760 in 0.25° grid starting at 0.125)
  const latStart = 100;  // 5°N
  const latEnd = 260;    // 45°N
  const lonStart = 420;  // -95°W (265°E in 0-360 system)
  const lonEnd = 760;    // -10°W (350°E in 0-360 system)
  
  const dataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${currentYear}.nc.ascii?` +
    `lat[${latStart}:1:${latEnd}],` +
    `lon[${lonStart}:1:${lonEnd}],` +
    `sst[${timeIndex}:1:${timeIndex}][${latStart}:1:${latEnd}][${lonStart}:1:${lonEnd}]`;

  console.log('[v0] Fetching SST data from:', dataUrl);
  
  const dataResponse = await fetch(dataUrl);
  if (!dataResponse.ok) {
    throw new Error(`OPeNDAP request failed: ${dataResponse.status}`);
  }
  
  const dataText = await dataResponse.text();
  
  // Step 3: Parse OPeNDAP ASCII format
  const parsed = parseOPeNDAPAscii(dataText);
  
  return {
    date: new Date(currentYear, 0, timeIndex + 1).toISOString().split('T')[0],
    gridPoints: parsed.gridPoints,
    bounds: {
      minLat: 5,
      maxLat: 45,
      minLon: -95,
      maxLon: -10
    }
  };
}

function parseOPeNDAPAscii(asciiData: string) {
  // OPeNDAP ASCII format has sections separated by dashed lines
  const sections = asciiData.split(/\n-{20,}\n/);
  
  // Extract lat, lon, and sst arrays
  let latitudes: number[] = [];
  let longitudes: number[] = [];
  let sstValues: number[] = [];
  
  for (const section of sections) {
    if (section.includes('lat,')) {
      // Parse latitude array: "lat, [160]" followed by comma-separated values
      const values = section.split('\n').slice(1).join('').split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
      latitudes = values;
    } else if (section.includes('lon,')) {
      // Parse longitude array
      const values = section.split('\n').slice(1).join('').split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
      // Convert from 0-360 to -180 to 180
      longitudes = values.map(lon => lon > 180 ? lon - 360 : lon);
    } else if (section.includes('sst,')) {
      // Parse SST 3D array [time][lat][lon]
      // Extract all numeric values from nested brackets
      const numericValues = section.match(/-?\d+\.?\d*/g);
      if (numericValues) {
        sstValues = numericValues.map(v => parseFloat(v)).filter(v => !isNaN(v));
      }
    }
  }
  
  // Build grid points array
  const gridPoints = [];
  let sstIndex = 0;
  
  for (let i = 0; i < latitudes.length; i++) {
    for (let j = 0; j < longitudes.length; j++) {
      const sst = sstValues[sstIndex++];
      // Filter out missing values (typically < -999)
      if (sst && sst > -100) {
        gridPoints.push({
          lat: latitudes[i],
          lon: longitudes[j],
          sst: sst
        });
      }
    }
  }
  
  console.log(`[v0] Parsed ${gridPoints.length} SST grid points`);
  return { gridPoints };
}
\`\`\`

### Visualization with D3.js

**D3 Geographic Projection Setup**
\`\`\`typescript
// components/d3-sst-map.tsx
import * as d3 from 'd3';
import * as d3Geo from 'd3-geo';

const projection = d3Geo.geoMercator()
  .center([-52.5, 25])  // Center of Atlantic basin
  .scale(600)
  .translate([width / 2, height / 2]);

const colorScale = d3.scaleSequential()
  .domain([20, 32])
  .interpolator(d3.interpolateYlOrRd);

// Render each grid point as SVG circle
svg.selectAll('circle')
  .data(gridPoints)
  .enter()
  .append('circle')
  .attr('cx', d => projection([d.lon, d.lat])[0])
  .attr('cy', d => projection([d.lon, d.lat])[1])
  .attr('r', 2)
  .attr('fill', d => colorScale(d.sst))
  .attr('opacity', 0.8);
\`\`\`

**Features**:
- Geographic coastlines from D3 topojson
- Lat/lon grid lines (0.5° minor, 5° major)
- Interactive tooltip on hover
- Color legend with D3 axis
- Date stamp showing data validity


---

## Phase 2: Maximum Potential Intensity (MPI) Calculation

### Objective
Calculate and display potential minimum central pressure and maximum wind speeds using Kerry Emanuel's thermodynamic method, overlaid on SST data using D3.js visualization.


### Atmospheric Data Sources

**Primary: NCEP GFS via THREDDS/OPeNDAP**
- Similar data access pattern to SST (Phase 1)
- URL: NOAA THREDDS GFS catalogs
- Variables needed: Temperature and humidity at multiple levels
- Advantage: Consistent with SST fetch method
- Format: NetCDF via OPeNDAP ASCII

**Long-term: NCEP GFS GRIB2 Files (See Phase 3)**
- Source: NOAA NCEP NOMADS server
- URL: `https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/`
- Requires server-side GRIB2 parsing
- Provides complete atmospheric profiles
- Update frequency: 4x daily (00Z, 06Z, 12Z, 18Z)


### D3 Visualization - Phase 2

**Two D3 map panels required:**

1. **Potential Minimum Central Pressure Map**
   - D3 sequential color scale: 880-1000 mb
   - Render as SVG circles with D3 data binding
   - Contour generation using d3-contour
   - Colors: Deep blues/purples (low pressure) → yellow/gray (high pressure)

2. **Potential Maximum Wind Speed Map**
   - D3 threshold scale for Saffir-Simpson categories
   - SVG rendering with interactive tooltips
   - Overlay SST contours (26.5°C threshold)

\`\`\`typescript
// D3 pressure color scale
const pressureScale = d3.scaleSequential()
  .domain([880, 1000])
  .interpolator(d3.interpolateSpectral);

// D3 categorical wind scale
const windScale = d3.scaleThreshold<number, string>()
  .domain([34, 64, 83, 96, 113, 137])
  .range(['#5b7c99', '#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026', '#800026']);
\`\`\`

---

## Phase 3: GRIB2 Direct Data Access (Long-term Solution)

### Objective
Implement direct GRIB2 file parsing on the server for complete atmospheric profiles without relying on intermediate APIs. This provides the most complete and up-to-date data for PI calculations and can be reused across other projects.

### Why GRIB2?

**Advantages**:
- Most complete atmospheric data (full vertical resolution)
- Updated 4x daily (00Z, 06Z, 12Z, 18Z cycles)
- Official operational forecast data from NCEP
- No rate limits (files are publicly accessible)
- Reusable for other meteorological projects
- Data is already in binary format (no API parsing overhead)

**Variables Available**:
- Temperature at all pressure levels (1000mb-10mb)
- Relative humidity at all levels
- Geopotential height
- U and V wind components
- Surface pressure, temperature, dewpoint
- And 100+ other atmospheric variables

### GRIB2 File Structure

\`\`\`
GRIB2 File = Collection of "messages"
Each message = One variable at one level at one time

Example messages in gfs.t00z.pgrb2.0p25.f000:
1: TMP:surface
2: TMP:2 m above ground
3: TMP:1000 mb
4: TMP:975 mb
5: TMP:950 mb
...
52: RH:surface
53: RH:1000 mb
...
\`\`\`

**Index Files (.idx)**:
- Plain text file listing each message with byte offset
- Format: `message_number:byte_offset:date:variable:level:forecast_hour`
- Enables subset downloading via HTTP range requests

### Implementation Strategy

**Step 1: Understand GRIB2 File Layout**

\`\`\`bash
# Download latest GFS analysis (f000 = analysis, not forecast)
curl -O https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.20251112/00/atmos/gfs.t00z.pgrb2.0p25.f000

# Download index
curl -O https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.20251112/00/atmos/gfs.t00z.pgrb2.0p25.f000.idx

# View index (shows message:byte_offset:variable:level)
head -20 gfs.t00z.pgrb2.0p25.f000.idx
\`\`\`

**Step 2: Subset Download (HTTP Range Requests)**

Instead of downloading full 500MB file, download only needed variables:

\`\`\`typescript
// lib/grib2-subset-fetch.ts

interface GRIB2Message {
  variable: string;
  level: string;
  startByte: number;
  endByte: number;
}

export async function fetchGRIB2Subset(
  gribUrl: string,
  variables: string[]  // e.g., ['TMP:surface', 'TMP:850 mb', 'RH:850 mb']
): Promise<ArrayBuffer> {
  // 1. Fetch index file
  const idxUrl = `${gribUrl}.idx`;
  const idxResponse = await fetch(idxUrl);
  const idxText = await idxResponse.text();
  
  // 2. Parse index to find byte ranges
  const messages = parseGRIB2Index(idxText, variables);
  
  // 3. Download only needed byte ranges
  const ranges = messages.map(m => `${m.startByte}-${m.endByte}`);
  const rangeHeader = `bytes=${ranges.join(',')}`;
  
  const gribResponse = await fetch(gribUrl, {
    headers: { 'Range': rangeHeader }
  });
  
  return await gribResponse.arrayBuffer();
}

function parseGRIB2Index(
  idxText: string,
  wantedVariables: string[]
): GRIB2Message[] {
  const lines = idxText.split('\n');
  const messages: GRIB2Message[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(':');
    if (parts.length < 4) continue;
    
    const msgNum = parseInt(parts[0]);
    const startByte = parseInt(parts[1]);
    const variable = parts[3];
    const level = parts[4];
    const varLevel = `${variable}:${level}`;
    
    if (wantedVariables.includes(varLevel)) {
      // End byte is start of next message
      const nextLine = lines[i + 1];
      const endByte = nextLine ? parseInt(nextLine.split(':')[1]) - 1 : startByte + 100000;
      
      messages.push({
        variable,
        level,
        startByte,
        endByte
      });
    }
  }
  
  return messages;
}
\`\`\`

**Step 3: Server-Side GRIB2 Parsing**

Option A: Python subprocess (recommended for v0 environment)

\`\`\`typescript
// app/api/atmospheric-grib2/route.ts
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '25');
  const lon = parseFloat(searchParams.get('lon') || '-80');
  
  try {
    // Call Python script to extract GRIB2 data
    const { stdout } = await execAsync(
      `python3 scripts/extract_grib2.py ${lat} ${lon}`
    );
    
    const data = JSON.parse(stdout);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'GRIB2 extraction failed' },
      { status: 500 }
    );
  }
}
\`\`\`

\`\`\`python
# scripts/extract_grib2.py
import sys
import json
import pygrib
from datetime import datetime

def extract_profile(lat, lon):
    # Download latest GFS file (or use cached)
    grib_url = get_latest_gfs_url()
    grib_file = download_grib_subset(grib_url, ['TMP', 'RH', 'PRES'])
    
    # Open GRIB2 file
    grbs = pygrib.open(grib_file)
    
    # Extract variables at lat/lon
    profile = {}
    
    # Surface temperature
    grb = grbs.select(name='Temperature', typeOfLevel='surface')[0]
    data, lats, lons = grb.data(lat1=lat, lat2=lat, lon1=lon, lon2=lon)
    profile['temp_surface'] = float(data[0][0] - 273.15)  # Convert K to C
    
    # 850 mb temperature
    grb = grbs.select(name='Temperature', typeOfLevel='isobaricInhPa', level=850)[0]
    data, _, _ = grb.data(lat1=lat, lat2=lat, lon1=lon, lon2=lon)
    profile['temp_850'] = float(data[0][0] - 273.15)
    
    # 500 mb temperature
    grb = grbs.select(name='Temperature', typeOfLevel='isobaricInhPa', level=500)[0]
    data, _, _ = grb.data(lat1=lat, lat2=lat, lon1=lon, lon2=lon)
    profile['temp_500'] = float(data[0][0] - 273.15)
    
    # 250 mb temperature (outflow)
    grb = grbs.select(name='Temperature', typeOfLevel='isobaricInhPa', level=250)[0]
    data, _, _ = grb.data(lat1=lat, lat2=lat, lon1=lon, lon2=lon)
    profile['temp_250'] = float(data[0][0] - 273.15)
    
    # Relative humidity levels
    grb = grbs.select(name='Relative humidity', typeOfLevel='surface')[0]
    data, _, _ = grb.data(lat1=lat, lat2=lat, lon1=lon, lon2=lon)
    profile['rh_surface'] = float(data[0][0])
    
    grb = grbs.select(name='Relative humidity', typeOfLevel='isobaricInhPa', level=850)[0]
    data, _, _ = grb.data(lat1=lat, lat2=lat, lon1=lon, lon2=lon)
    profile['rh_850'] = float(data[0][0])
    
    # Surface pressure
    grb = grbs.select(name='Pressure', typeOfLevel='surface')[0]
    data, _, _ = grb.data(lat1=lat, lat2=lat, lon1=lon, lon2=lon)
    profile['pressure_surface'] = float(data[0][0] / 100)  # Convert Pa to hPa
    
    grbs.close()
    
    return profile

if __name__ == '__main__':
    lat = float(sys.argv[1])
    lon = float(sys.argv[2])
    
    profile = extract_profile(lat, lon)
    print(json.dumps(profile))
\`\`\`

Option B: TypeScript GRIB2 parser

\`\`\`typescript
// lib/grib2-parser.ts
import { decode } from 'grib2-decoder';  // hypothetical library

export async function parseGRIB2(
  gribData: ArrayBuffer,
  lat: number,
  lon: number
): Promise<AtmosphericProfile> {
  const messages = decode(gribData);
  
  const profile: Partial<AtmosphericProfile> = {};
  
  for (const msg of messages) {
    const value = interpolateValue(msg.grid, lat, lon);
    
    if (msg.parameter === 'TMP' && msg.level === 'surface') {
      profile.temp_surface = value - 273.15;
    } else if (msg.parameter === 'TMP' && msg.level === 850) {
      profile.temp_850 = value - 273.15;
    }
    // ... etc for all variables
  }
  
  return profile as AtmosphericProfile;
}

function interpolateValue(
  grid: number[][],
  lat: number,
  lon: number
): number {
  // Bilinear interpolation from grid to exact lat/lon
  // Implementation depends on grid specification
  return 0;
}
\`\`\`

**Step 4: Caching Strategy**

\`\`\`typescript
// lib/grib2-cache.ts

interface CachedGRIB {
  cycle: string;      // e.g., '2025111200' (YYYYMMDDHH)
  data: ArrayBuffer;
  timestamp: number;
}

const gribCache = new Map<string, CachedGRIB>();

export async function getCachedGRIB(
  date: Date = new Date()
): Promise<ArrayBuffer> {
  const cycle = getLatestGFSCycle(date);
  const cacheKey = `gfs_${cycle}`;
  
  // Check cache (6-hour TTL since GFS runs 4x daily)
  const cached = gribCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 6 * 60 * 60 * 1000) {
    console.log(`[v0] Using cached GRIB2 for cycle ${cycle}`);
    return cached.data;
  }
  
  // Download new
  console.log(`[v0] Downloading GRIB2 for cycle ${cycle}`);
  const gribUrl = buildGFSUrl(cycle);
  const data = await fetchGRIB2Subset(gribUrl, [
    'TMP:surface',
    'TMP:850 mb',
    'TMP:500 mb',
    'TMP:250 mb',
    'RH:surface',
    'RH:850 mb',
    'RH:500 mb',
    'PRES:surface'
  ]);
  
  // Cache
  gribCache.set(cacheKey, {
    cycle,
    data,
    timestamp: Date.now()
  });
  
  return data;
}

function getLatestGFSCycle(date: Date): string {
  // GFS cycles: 00Z, 06Z, 12Z, 18Z
  // Files available ~4 hours after cycle time
  const hours = date.getUTCHours();
  const cycleHour = Math.floor((hours - 4) / 6) * 6;
  
  const cycleDate = new Date(date);
  cycleDate.setUTCHours(cycleHour, 0, 0, 0);
  
  const year = cycleDate.getUTCFullYear();
  const month = String(cycleDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(cycleDate.getUTCDate()).padStart(2, '0');
  const hour = String(cycleDate.getUTCHours()).padStart(2, '0');
  
  return `${year}${month}${day}${hour}`;
}

function buildGFSUrl(cycle: string): string {
  const yyyymmdd = cycle.slice(0, 8);
  const hh = cycle.slice(8, 10);
  return `https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.${yyyymmdd}/${hh}/atmos/gfs.t${hh}z.pgrb2.0p25.f000`;
}
\`\`\`

**Step 5: Integration with PI Calculation**

\`\`\`typescript
// app/api/calculate-pi-grib2/route.ts
import { NextResponse } from 'next/server';
import { getCachedGRIB } from '@/lib/grib2-cache';
import { parseGRIB2 } from '@/lib/grib2-parser';
import { calculatePI } from '@/lib/potential-intensity';
import { fetchSSTData } from '@/lib/api-client';

export async function POST(request: Request) {
  const { gridPoints } = await request.json();
  
  try {
    // Get SST data
    const sstData = await fetchSSTData();
    
    // Get GRIB2 atmospheric data
    const gribData = await getCachedGRIB();
    
    // Calculate PI for each grid point
    const results = [];
    
    for (const point of gridPoints) {
      // Get atmospheric profile from GRIB2
      const atmoProfile = await parseGRIB2(gribData, point.lat, point.lon);
      
      // Add SST
      const sst = findNearestSST(sstData, point.lat, point.lon);
      atmoProfile.sst = sst;
      
      // Calculate PI
      const pi = calculatePI(atmoProfile);
      
      results.push({
        lat: point.lat,
        lon: point.lon,
        vmax: pi.vmax,
        pmin: pi.pmin,
        category: pi.category
      });
    }
    
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: 'PI calculation failed' },
      { status: 500 }
    );
  }
}
\`\`\`

### Testing Phase 3

**Test 1: File Download**
\`\`\`bash
# Download test file
curl -O https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.20251112/00/atmos/gfs.t00z.pgrb2.0p25.f000

# Verify size (~500MB)
ls -lh gfs.t00z.pgrb2.0p25.f000
\`\`\`

**Test 2: Index Parsing**
\`\`\`bash
# Get index
curl https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.20251112/00/atmos/gfs.t00z.pgrb2.0p25.f000.idx > test.idx

# Find temperature messages
grep "TMP:" test.idx | head -10

# Find byte ranges
grep "TMP:surface" test.idx
\`\`\`

**Test 3: Subset Download**
\`\`\`bash
# Download only TMP:surface (example byte range)
curl -r 0-100000 https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.20251112/00/atmos/gfs.t00z.pgrb2.0p25.f000 > subset.grb2

# Verify it's valid GRIB2
file subset.grb2
# Should output: "subset.grb2: GRIB message"
\`\`\`

**Test 4: Python Parsing**
\`\`\`python
# test_grib2.py
import pygrib

grbs = pygrib.open('gfs.t00z.pgrb2.0p25.f000')

# List first 10 messages
for i, grb in enumerate(grbs):
    if i >= 10:
        break
    print(f"{grb.name}, {grb.typeOfLevel}, {grb.level}")

# Extract value at specific location
grb = grbs.select(name='Temperature', typeOfLevel='surface')[0]
data, lats, lons = grb.data(lat1=25, lat2=25, lon1=-80, lon2=-80)
print(f"Temperature at 25N, 80W: {data[0][0] - 273.15:.1f}°C")

grbs.close()
\`\`\`

**Test 5: End-to-End Integration**
\`\`\`typescript
// scripts/test-grib2-integration.ts
import { fetchGRIB2Subset } from '../lib/grib2-subset-fetch';
import { parseGRIB2 } from '../lib/grib2-parser';

async function testIntegration() {
  const gribUrl = 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.20251112/00/atmos/gfs.t00z.pgrb2.0p25.f000';
  
  console.log('Fetching GRIB2 subset...');
  const data = await fetchGRIB2Subset(gribUrl, [
    'TMP:surface',
    'TMP:850 mb',
    'RH:surface'
  ]);
  
  console.log(`Downloaded ${data.byteLength} bytes`);
  
  console.log('Parsing GRIB2 data...');
  const profile = await parseGRIB2(data, 25, -80);
  
  console.log('Atmospheric profile at 25N, 80W:', profile);
}

testIntegration();
\`\`\`

### Phase 3 Benefits

1. **Complete data**: Full vertical resolution (50+ pressure levels)
2. **No rate limits**: Direct file access
3. **Reusable**: Can extract any variable for other projects
4. **Operational**: Real-time operational forecast data
5. **Cacheable**: Download once, use for 6 hours
6. **Scalable**: Subset downloads minimize bandwidth

---

## Technical Architecture

### File Structure
\`\`\`
app/
├── api/
│   ├── sst-data/
│   │   └── route.ts          # SST fetch from NOAA PSL (WORKING)
│   ├── atmospheric-grib2/
│   │   └── route.ts          # GRIB2 atmospheric data (Phase 3)
│   └── calculate-pi/
│       └── route.ts          # PI calculation endpoint
├── page.tsx                   # Main application page
components/
├── d3-sst-map.tsx            # D3-based SST visualization
├── d3-pi-maps.tsx            # D3-based PI visualization (Phase 2)
├── sst-color-legend.tsx      # Temperature legend (D3 axis)
└── pi-color-legend.tsx       # Hurricane category legend (D3)
lib/
├── api-client.ts             # Client-side API wrappers
├── potential-intensity.ts    # PI calculation logic
├── grib2-subset-fetch.ts     # GRIB2 HTTP range requests (Phase 3)
├── grib2-parser.ts           # GRIB2 binary parsing (Phase 3)
├── grib2-cache.ts            # GRIB2 file caching (Phase 3)
└── map-utils.ts              # D3 projection helpers
scripts/
├── extract_grib2.py          # Python GRIB2 extractor (Phase 3)
└── test-grib2-integration.ts # GRIB2 testing script
\`\`\`

### Data Flow

\`\`\`
User clicks "Fetch Data"
    ↓
1. Fetch SST data (Phase 1) ✓
   - Check 24h cache
   - If expired: fetch from NOAA PSL OPeNDAP
   - Parse ASCII format
   - Return ~45k grid points
    ↓
2. Display SST map with D3.js immediately
    ↓
3. Fetch atmospheric data (Phase 2/3)
   Phase 2: THREDDS/OPeNDAP per point
   Phase 3: GRIB2 subset (all points at once)
    ↓
4. Calculate PI for each point
   - Apply Emanuel's formula
   - Categorize by Saffir-Simpson scale
    ↓
5. Display PI maps with D3.js
   - Pressure map with D3 color scale
   - Wind speed map with D3 threshold scale
\`\`\`

---

## Color Scales (Scientific Accuracy)

### SST Color Scale (D3)
\`\`\`javascript
const sstColorScale = d3.scaleSequential()
  .domain([20, 30])
  .interpolator(d3.interpolateYlOrRd);
\`\`\`

### Pressure Color Scale (D3)
\`\`\`javascript
const pressureColorScale = d3.scaleSequential()
  .domain([880, 1000])
  .interpolator(d3.interpolateSpectral);
\`\`\`

### Wind Speed Color Scale (D3 Threshold)
\`\`\`javascript
const windScale = d3.scaleThreshold()
  .domain([34, 64, 83, 96, 113, 137])
  .range(['#5b7c99', '#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026', '#800026']);
\`\`\`

---

## Conclusion

This design document captures the **government-only, D3-based, server-side GRIB2** approach for recreating Maximum Potential Hurricane Intensity maps:

- **Phase 1 (SST)**: WORKING - NOAA PSL OPeNDAP with D3 visualization
- **Phase 2 (PI calc)**: Framework ready - needs atmospheric data integration
- **Phase 3 (GRIB2)**: Long-term solution - complete server-side implementation

All code samples use government data sources exclusively, D3.js for professional cartographic rendering, and server-side processing for scalability.
