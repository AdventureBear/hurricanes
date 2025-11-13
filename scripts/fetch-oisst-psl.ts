/**
 * Fetch OISST data from PSL OPeNDAP for a specific date
 * This uses the same method as the original implementation
 */

interface SSTPoint {
  lat: number;
  lon: number;
  sst: number;
}

interface OISSTData {
  date: string;
  source: string;
  gridPoints: SSTPoint[];
  pointCount: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

/**
 * Parse OPeNDAP ASCII format
 */
function parseOPeNDAPAscii(asciiData: string): { gridPoints: SSTPoint[] } {
  const gridPoints: SSTPoint[] = [];
  
  // Split by section markers
  const sections = asciiData.split(/\n-{20,}\n/);
  
  // Find the SST data section
  let sstSection = '';
  for (const section of sections) {
    if (section.includes('sst =') || section.includes('sst[')) {
      sstSection = section;
      break;
    }
  }
  
  if (!sstSection) {
    throw new Error('Could not find SST data section in OPeNDAP response');
  }
  
  // Extract lat and lon arrays first
  const latMatch = asciiData.match(/lat = \[([^\]]+)\]/s);
  const lonMatch = asciiData.match(/lon = \[([^\]]+)\]/s);
  
  if (!latMatch || !lonMatch) {
    throw new Error('Could not find lat/lon arrays');
  }
  
  const lats = latMatch[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  const lons = lonMatch[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  
  // Extract SST values
  // SST data is typically in a 2D array format
  const sstMatch = sstSection.match(/sst = \[([^\]]+)\]/s);
  if (!sstMatch) {
    throw new Error('Could not find SST values');
  }
  
  // Parse SST values - they might be in a flattened array
  const sstValues = sstMatch[1]
    .split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n));
  
  // Create grid points
  let valueIndex = 0;
  for (const lat of lats) {
    for (const lon of lons) {
      if (valueIndex < sstValues.length) {
        const sst = sstValues[valueIndex];
        // Skip missing values (typically -9.96921e+36 or very large negative)
        if (sst > -100 && sst < 100) {
          // Convert lon from 0-360 to -180-180 if needed
          const lon180 = lon > 180 ? lon - 360 : lon;
          gridPoints.push({ lat, lon: lon180, sst });
        }
        valueIndex++;
      }
    }
  }
  
  return { gridPoints };
}

/**
 * Fetch OISST data from PSL OPeNDAP for a specific date
 */
export async function fetchOISSTFromPSL(
  date: Date,
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }
): Promise<OISSTData> {
  const year = date.getFullYear();
  
  // PSL OPeNDAP URL
  const baseUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${year}.nc.ascii`;
  
  // Calculate time index
  // OISST time is days since 1800-01-01
  const baseDate = new Date(1800, 0, 1);
  const daysSinceBase = Math.floor((date.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Get time dimension to find the correct index
  const timeMetadataUrl = `${baseUrl}?time[0:1:0]`;
  const timeResponse = await fetch(timeMetadataUrl);
  const timeText = await timeResponse.text();
  
  // Parse time dimension to find matching index
  // This is a simplified approach - in practice, we'd parse the full time array
  // For now, estimate based on day of year
  const dayOfYear = Math.floor((date.getTime() - new Date(year, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
  const timeIndex = dayOfYear; // Approximate - may need adjustment
  
  // Calculate grid indices for bounds
  // OISST grid: starts at -89.875°N with 0.25° increments
  // Longitude: 0-360 format starting at 0.125
  const latStart = Math.floor((bounds.minLat - (-89.875)) / 0.25);
  const latEnd = Math.floor((bounds.maxLat - (-89.875)) / 0.25);
  
  // Convert longitude to 0-360
  // For -100°W to 0°W: that's 260°E to 360°E
  const minLon360 = bounds.minLon < 0 ? bounds.minLon + 360 : bounds.minLon;
  const maxLon360 = bounds.maxLon < 0 ? bounds.maxLon + 360 : bounds.maxLon;
  
  const lonStart = Math.floor((minLon360 - 0.125) / 0.25);
  const lonEnd = Math.floor((maxLon360 - 0.125) / 0.25);
  
  // OPeNDAP format: [start:stride:end] where stride is 1
  // For longitude, if we cross 360°, we need to handle it differently
  // For now, use a simpler approach: fetch the range
  const dataUrl = `${baseUrl}?` +
    `lat[${latStart}:1:${latEnd}],` +
    `lon[${lonStart}:1:${lonEnd}],` +
    `sst[${timeIndex}:1:${timeIndex}][${latStart}:1:${latEnd}][${lonStart}:1:${lonEnd}]`;
  
  console.log(`Fetching OISST from PSL: ${dataUrl}`);
  
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`OPeNDAP request failed: ${response.status} ${response.statusText}`);
  }
  
  const dataText = await response.text();
  const parsed = parseOPeNDAPAscii(dataText);
  
  return {
    date: date.toISOString().split('T')[0],
    source: 'NOAA PSL OISST v2.1 (OPeNDAP)',
    gridPoints: parsed.gridPoints,
    pointCount: parsed.gridPoints.length,
    bounds
  };
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const date = new Date('2025-11-11');
  const bounds = {
    minLat: 5,
    maxLat: 50,
    minLon: -100,
    maxLon: 0
  };
  
  fetchOISSTFromPSL(date, bounds)
    .then(data => {
      console.log('\n✅ OISST Data:');
      console.log(`  Date: ${data.date}`);
      console.log(`  Source: ${data.source}`);
      console.log(`  Points: ${data.pointCount}`);
      console.log(`  SST range: ${Math.min(...data.gridPoints.map(p => p.sst)).toFixed(2)} to ${Math.max(...data.gridPoints.map(p => p.sst)).toFixed(2)}°C`);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

