import { NextResponse } from 'next/server';
import { isCacheValid, readCache, writeCache } from '@/lib/cache-manager';
import type { SSTDataResponse, SSTGridPoint } from '@/types/sst';
import type { GeographicBounds } from '@/types/geographic';

/**
 * Converts geographic bounds to NOAA OISST grid indices
 * OISST grid: -89.875° to 89.875° lat (720 points), 0.125° to 359.875° lon (1440 points)
 */
function boundsToIndices(bounds: GeographicBounds): { latStart: number; latEnd: number; lonStart: number; lonEnd: number } {
  // Latitude: -89.875 to 89.875 in 0.25° steps
  // Index = (lat + 89.875) / 0.25
  const latStart = Math.max(0, Math.floor((bounds.minLat + 89.875) / 0.25));
  const latEnd = Math.min(719, Math.ceil((bounds.maxLat + 89.875) / 0.25));
  
  // Longitude: 0-360 range in OISST, convert -180 to 180 to 0-360
  // Handle global case (-180 to 180) specially - fetch full 0-360 range
  let lonStart: number;
  let lonEnd: number;
  
  if (bounds.minLon <= -180 && bounds.maxLon >= 180) {
    // Global case: fetch all longitudes (0-360, which is all 1440 points)
    lonStart = 0;
    lonEnd = 1439;
  } else {
    // Convert -180 to 180 range to 0-360 range
    const lonMin360 = bounds.minLon < 0 ? bounds.minLon + 360 : bounds.minLon;
    const lonMax360 = bounds.maxLon < 0 ? bounds.maxLon + 360 : bounds.maxLon;
    
    // Handle wraparound (e.g., South Pacific: 160°E to 120°W = 160° to 240°)
    if (lonMax360 < lonMin360) {
      // Wraparound case - fetch full range
      lonStart = 0;
      lonEnd = 1439;
    } else {
      lonStart = Math.max(0, Math.floor(lonMin360 / 0.25));
      lonEnd = Math.min(1439, Math.ceil(lonMax360 / 0.25));
    }
  }
  
  return { latStart, latEnd, lonStart, lonEnd };
}

/**
 * Fetches SST data from NOAA PSL OISST v2.1 for specified bounds
 * Resolution: 0.25° x 0.25°
 */
async function fetchSSTDataFromNOAA(bounds: GeographicBounds): Promise<SSTDataResponse> {
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
  
  // Step 2: Convert bounds to grid indices
  const { latStart, latEnd, lonStart, lonEnd } = boundsToIndices(bounds);
  const expectedPoints = (latEnd - latStart + 1) * (lonEnd - lonStart + 1);
  
  console.log(`[SST API] Fetching SST data for bounds: ${bounds.minLat}°N-${bounds.maxLat}°N, ${bounds.minLon}°-${bounds.maxLon}°`);
  console.log(`[SST API] Grid indices: lat[${latStart}:${latEnd}], lon[${lonStart}:${lonEnd}]`);
  console.log(`[SST API] Expected points: ${expectedPoints}`);
  
  const dataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${dataYear}.nc.ascii?` +
    `lat[${latStart}:1:${latEnd}],` +
    `lon[${lonStart}:1:${lonEnd}],` +
    `sst[${timeIndex}:1:${timeIndex}][${latStart}:1:${latEnd}][${lonStart}:1:${lonEnd}]`;
  
  console.log(`[SST API] Fetching from: ${dataUrl.substring(0, 150)}...`);
  console.log(`[SST API] This will fetch ${expectedPoints} points - this may take a while...`);
  
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
    bounds: bounds,
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
  const sstValues: number[] = [];
  
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
 * Returns global SST data (covers all basins)
 * Uses file-based cache with 24-hour TTL
 */
export async function GET() {
  try {
    // Global bounds covering all hurricane basins:
    // Latitude: -40°S to 60°N (covers all basins from South Pacific to Western North Pacific)
    // Longitude: -180° to 180° (full globe, covers wraparound basins like South Pacific)
    const globalBounds: GeographicBounds = {
      minLat: -40,
      maxLat: 60,
      minLon: -180,
      maxLon: 180
    };
    
    console.log('[SST API] Fetching global SST data (covers all basins)');
    
    // Check cache first
    if (await isCacheValid()) {
      console.log('[SST API] Returning cached data');
      const cachedData = await readCache();
      
      if (cachedData) {
        return NextResponse.json(cachedData);
      }
    }
    
    // Fetch new global data from NOAA
    console.log('[SST API] Cache miss or invalid, fetching global data from NOAA');
    const data = await fetchSSTDataFromNOAA(globalBounds);
    console.log(`[SST API] Successfully fetched ${data.pointCount} points`);
    
    // Cache the global result
    await writeCache(data);
    console.log('[SST API] Data cached successfully');
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('[SST API] Error:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch SST data', details: String(error) },
      { status: 500 }
    );
  }
}

