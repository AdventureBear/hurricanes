import { NextResponse } from 'next/server';
import { isCacheValid, readCache, writeCache } from '@/lib/cache-manager';
import type { SSTDataResponse, SSTGridPoint } from '@/types/sst';

/**
 * Fetches SST data from NOAA PSL OISST v2.1
 * Atlantic Basin: 5°N-45°N, 95°W-10°W
 * Resolution: 0.25° x 0.25° (~45,000 grid points)
 */
async function fetchSSTDataFromNOAA(): Promise<SSTDataResponse> {
  console.log('[SST API] Fetching fresh data from NOAA (this should only happen when cache is invalid or expired)...');
  const startTime = Date.now();
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const previousYear = currentYear - 1;
  
  // Try current year first, but if it only has early year data, use previous year
  let dataYear = currentYear;
  // Query the full time dimension to get its size (not just one value)
  let metadataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${dataYear}.nc.ascii?time`;
  
  console.log('[SST API] Fetching time dimension metadata...');
  let metadataResponse = await fetch(metadataUrl);
  
  // If current year fails or has very little data, try previous year
  if (!metadataResponse.ok) {
    console.log(`[SST API] ${currentYear} data not available, trying ${previousYear}...`);
    dataYear = previousYear;
    metadataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${dataYear}.nc.ascii?time`;
    metadataResponse = await fetch(metadataUrl);
  }
  
  if (!metadataResponse.ok) {
    throw new Error(`Metadata fetch failed: ${metadataResponse.status}`);
  }
  
  const metadataText = await metadataResponse.text();
  
  // Parse the time dimension size from header: "time[time = 313]"
  // The size is the number of values, so max index is size - 1
  const timeSizeMatch = metadataText.match(/time\[time\s*=\s*(\d+)\]/);
  const timeSize = timeSizeMatch ? parseInt(timeSizeMatch[1]) : 0;
  const maxTimeIndex = timeSize > 0 ? timeSize - 1 : 0;
  
  console.log(`[SST API] Time dimension size: ${timeSize}, max index: ${maxTimeIndex}`);
  
  // Use latest available date (accounting for 2-day lag)
  const timeIndex = Math.max(0, maxTimeIndex - 2);
  console.log(`[SST API] Using time index: ${timeIndex} (max: ${maxTimeIndex}, accounting for 2-day lag)`);
  
  // Fetch actual time value from the data to get the real date
  const timeValueUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${dataYear}.nc.ascii?time[${timeIndex}:1:${timeIndex}]`;
  const timeValueResponse = await fetch(timeValueUrl);
  const timeValueText = await timeValueResponse.text();
  
  // Extract time value - OISST uses days since 1800-01-01 00:00:00 UTC
  const timeValueMatch = timeValueText.match(/time\[1\]\s+([\d.]+)/);
  const daysSince1800 = timeValueMatch ? parseFloat(timeValueMatch[1]) : null;
  
  // Calculate date properly: 1800-01-01 + days
  let dataDate: Date;
  if (daysSince1800 !== null && !isNaN(daysSince1800)) {
    // Use milliseconds to avoid precision issues
    const baseDate = new Date(Date.UTC(1800, 0, 1, 0, 0, 0, 0));
    const millisecondsSince1800 = daysSince1800 * 24 * 60 * 60 * 1000;
    dataDate = new Date(baseDate.getTime() + millisecondsSince1800);
    console.log(`[SST API] Time value: ${daysSince1800} days since 1800-01-01`);
    console.log(`[SST API] Calculated date: ${dataDate.toISOString()}`);
  } else {
    // Fallback: use current date minus 2 days (typical lag)
    dataDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    console.log(`[SST API] Could not parse time value, using fallback: ${dataDate.toISOString().split('T')[0]}`);
  }
  
  const dateString = dataDate.toISOString().split('T')[0];
  console.log(`[SST API] Final data date: ${dateString} from year ${dataYear}`);
  
  // Step 2: Fetch full Atlantic basin SST data
  // Grid coordinates:
  // Latitude: 5°N to 45°N = indices 379 to 539 (161 points)
  // Longitude: -95°W to -10°W = indices 1059 to 1399 (341 points)
  // Total: 161 * 341 = 54,901 points (some will be land/masked)
  
  const latStart = 379;  // 5°N
  const latEnd = 539;    // 45°N
  const lonStart = 1059; // -95°W (265°E in 0-360)
  const lonEnd = 1399;   // -10°W (350°E in 0-360)
  
  const dataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${dataYear}.nc.ascii?` +
    `lat[${latStart}:1:${latEnd}],` +
    `lon[${lonStart}:1:${lonEnd}],` +
    `sst[${timeIndex}:1:${timeIndex}][${latStart}:1:${latEnd}][${lonStart}:1:${lonEnd}]`;

  console.log('[SST API] Fetching SST data...');
  console.log(`[SST API] Expected points: ${(latEnd - latStart + 1) * (lonEnd - lonStart + 1)}`);
  
  const dataResponse = await fetch(dataUrl);
  if (!dataResponse.ok) {
    throw new Error(`OPeNDAP request failed: ${dataResponse.status}`);
  }
  
  const dataText = await dataResponse.text();
  console.log(`[SST API] Received ${dataText.length} bytes`);
  
  // Step 3: Parse OPeNDAP ASCII format
  const parsed = parseOPeNDAPAscii(dataText);
  
  const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[SST API] Successfully fetched ${parsed.gridPoints.length} points in ${fetchTime}s`);
  
  return {
    date: dataDate.toISOString().split('T')[0],
    gridPoints: parsed.gridPoints,
    bounds: {
      minLat: 5,
      maxLat: 45,
      minLon: -95,
      maxLon: -10
    },
    source: 'NOAA PSL OISST v2.1',
    pointCount: parsed.gridPoints.length
  };
}

/**
 * Parses OPeNDAP ASCII response format
 */
function parseOPeNDAPAscii(asciiData: string): { gridPoints: SSTGridPoint[] } {
  // OPeNDAP ASCII format has sections separated by dashed lines
  const sections = asciiData.split(/\n-{20,}\n/);
  
  // Extract lat, lon, and sst arrays
  let latitudes: number[] = [];
  let longitudes: number[] = [];
  let sstValues: number[] = [];
  
  for (const section of sections) {
    // Parse latitude array
    if (section.includes('lat[')) {
      const latMatch = section.match(/lat\[\d+\]\s+([\d\s.,\-]+)/);
      if (latMatch) {
        latitudes = latMatch[1].split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
      }
    }
    
    // Parse longitude array
    if (section.includes('lon[')) {
      const lonMatch = section.match(/lon\[\d+\]\s+([\d\s.,\-]+)/);
      if (lonMatch) {
        const values = lonMatch[1].split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
        // Convert from 0-360 to -180 to 180
        longitudes = values.map(lon => lon > 180 ? lon - 360 : lon);
      }
    }
    
    // Parse SST 3D array [time][lat][lon]
    // Format: [0][0], val1, val2, val3...
    if (section.includes('sst.sst[')) {
      const sstLines = section.split('\n').filter(line => line.includes('[0]['));
      for (const line of sstLines) {
        // Split by comma, skip first element (index), parse rest
        const values = line.split(',').slice(1).map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
        sstValues.push(...values);
      }
    }
  }
  
  console.log(`[Parser] Latitudes: ${latitudes.length}, Longitudes: ${longitudes.length}, SST values: ${sstValues.length}`);
  
  // Build grid points array
  const gridPoints: SSTGridPoint[] = [];
  let sstIndex = 0;
  
  for (let i = 0; i < latitudes.length; i++) {
    for (let j = 0; j < longitudes.length; j++) {
      const sst = sstValues[sstIndex++];
      // Filter out missing values (typically < -999 or very negative)
      if (sst && sst > -100) {
        gridPoints.push({
          lat: latitudes[i],
          lon: longitudes[j],
          sst: sst
        });
      }
    }
  }
  
  console.log(`[Parser] Parsed ${gridPoints.length} valid SST grid points (filtered from ${sstValues.length})`);
  
  return { gridPoints };
}

/**
 * GET /api/sst-data
 * Returns SST data for Atlantic basin
 * Uses file-based cache with 24-hour TTL
 */
export async function GET() {
  try {
    // Check cache first
    if (await isCacheValid()) {
      console.log('[SST API] Returning cached data');
      const cachedData = await readCache();
      
      if (cachedData) {
        return NextResponse.json(cachedData);
      }
    }
    
    // Fetch new data from NOAA
    console.log('[SST API] Cache miss or invalid, fetching from NOAA');
    const data = await fetchSSTDataFromNOAA();
    
    // Cache the result
    await writeCache(data);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('[SST API] Error:', error);
    
    // Try to return cached data even if expired
    try {
      console.log('[SST API] Attempting to use expired cache as fallback');
      const cachedData = await readCache();
      if (cachedData) {
        return NextResponse.json({
          ...cachedData,
          warning: 'Using cached data due to fetch error'
        });
      }
    } catch (cacheError) {
      console.error('[SST API] Cache fallback also failed:', cacheError);
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch SST data', details: String(error) },
      { status: 500 }
    );
  }
}

