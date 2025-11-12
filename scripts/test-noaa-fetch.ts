/**
 * Test script to verify NOAA OISST data access
 * Run with: npx tsx scripts/test-noaa-fetch.ts
 */

async function testNOAADataAccess() {
  console.log('🌊 Testing NOAA OISST v2.1 Data Access...\n');
  
  const currentYear = new Date().getFullYear();
  
  try {
    // Step 1: Get metadata to find latest available date
    console.log('Step 1: Fetching metadata...');
    const metadataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${currentYear}.nc.ascii?time[0:1:0]`;
    console.log(`URL: ${metadataUrl}\n`);
    
    const metadataResponse = await fetch(metadataUrl);
    
    if (!metadataResponse.ok) {
      throw new Error(`Metadata fetch failed: ${metadataResponse.status} ${metadataResponse.statusText}`);
    }
    
    const metadataText = await metadataResponse.text();
    console.log('✅ Metadata received');
    console.log(`Response length: ${metadataText.length} bytes\n`);
    
    // Parse time dimension
    const timeMatch = metadataText.match(/time\[(\d+)\]/);
    const maxTimeIndex = timeMatch ? parseInt(timeMatch[1]) : 0;
    console.log(`Max time index: ${maxTimeIndex}`);
    console.log(`Latest available date index: ${Math.max(0, maxTimeIndex - 2)}\n`);
    
    // Step 2: Fetch small sample of SST data (10x10 grid)
    console.log('Step 2: Fetching sample SST data (10x10 grid)...');
    const timeIndex = Math.max(0, maxTimeIndex - 2);
    
    // Atlantic basin subset - just 10x10 grid for testing
    // Grid starts at -89.875°N with 0.25° increments
    // For 5°N: index = (5 - (-89.875)) / 0.25 = 379
    // For 45°N: index = (45 - (-89.875)) / 0.25 = 539
    // Longitude in 0-360 format starting at 0.125
    // For -95°W (265°E): index = (265 - 0.125) / 0.25 = 1059
    // For -10°W (350°E): index = (350 - 0.125) / 0.25 = 1399
    const latStart = 379;  // ~5°N
    const latEnd = 389;    // ~7.5°N (10 points)
    const lonStart = 1059; // ~-95°W
    const lonEnd = 1069;   // ~-92.5°W (10 points)
    
    const dataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${currentYear}.nc.ascii?` +
      `lat[${latStart}:1:${latEnd}],` +
      `lon[${lonStart}:1:${lonEnd}],` +
      `sst[${timeIndex}:1:${timeIndex}][${latStart}:1:${latEnd}][${lonStart}:1:${lonEnd}]`;
    
    console.log(`URL: ${dataUrl}\n`);
    
    const dataResponse = await fetch(dataUrl);
    
    if (!dataResponse.ok) {
      throw new Error(`Data fetch failed: ${dataResponse.status} ${dataResponse.statusText}`);
    }
    
    const dataText = await dataResponse.text();
    console.log('✅ Sample data received');
    console.log(`Response length: ${dataText.length} bytes\n`);
    
    // Step 3: Parse the data
    console.log('Step 3: Parsing OPeNDAP ASCII format...');
    const sections = dataText.split(/\n-{20,}\n/);
    
    let latitudes: number[] = [];
    let longitudes: number[] = [];
    let sstValues: number[] = [];
    
    for (const section of sections) {
      // Parse lat array
      if (section.includes('lat[')) {
        const latMatch = section.match(/lat\[\d+\]\s+([\d\s.,\-]+)/);
        if (latMatch) {
          latitudes = latMatch[1].split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
        }
      }
      
      // Parse lon array
      if (section.includes('lon[')) {
        const lonMatch = section.match(/lon\[\d+\]\s+([\d\s.,\-]+)/);
        if (lonMatch) {
          const values = lonMatch[1].split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
          // Convert from 0-360 to -180 to 180
          longitudes = values.map(lon => lon > 180 ? lon - 360 : lon);
        }
      }
      
      // Parse SST data (format: [0][0], val1, val2, val3...)
      if (section.includes('sst.sst[')) {
        const sstLines = section.split('\n').filter(line => line.includes('[0]['));
        for (const line of sstLines) {
          const values = line.split(',').slice(1).map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
          sstValues.push(...values);
        }
      }
    }
    
    console.log(`✅ Parsed ${latitudes.length} latitudes`);
    console.log(`✅ Parsed ${longitudes.length} longitudes`);
    console.log(`✅ Parsed ${sstValues.length} SST values\n`);
    
    // Display sample points
    console.log('Sample Grid Points:');
    console.log('-------------------');
    for (let i = 0; i < Math.min(5, latitudes.length); i++) {
      for (let j = 0; j < Math.min(5, longitudes.length); j++) {
        const sstIndex = i * longitudes.length + j;
        const sst = sstValues[sstIndex];
        if (sst && sst > -100) {
          console.log(`  Lat: ${latitudes[i].toFixed(2)}°, Lon: ${longitudes[j].toFixed(2)}°, SST: ${sst.toFixed(2)}°C`);
        }
      }
    }
    
    // Validation
    console.log('\n📊 Validation:');
    console.log('-------------------');
    const minSST = Math.min(...sstValues.filter(v => v > -100));
    const maxSST = Math.max(...sstValues.filter(v => v > -100));
    const avgSST = sstValues.filter(v => v > -100).reduce((a, b) => a + b, 0) / sstValues.filter(v => v > -100).length;
    
    console.log(`  Min SST: ${minSST.toFixed(2)}°C`);
    console.log(`  Max SST: ${maxSST.toFixed(2)}°C`);
    console.log(`  Avg SST: ${avgSST.toFixed(2)}°C`);
    
    // Check if values are reasonable
    const isValid = minSST >= 0 && minSST <= 40 && maxSST >= 0 && maxSST <= 40;
    
    if (isValid) {
      console.log('\n✅ SUCCESS: NOAA data is accessible and values are reasonable!');
      console.log('\n🚀 Ready to implement full Atlantic basin fetch (45k points)');
      return true;
    } else {
      console.log('\n⚠️  WARNING: SST values seem unusual. Check data source.');
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.error('\nPossible issues:');
    console.error('  - NOAA server is down');
    console.error('  - Network connectivity issue');
    console.error('  - Data format has changed');
    console.error('  - Current year data not yet available');
    return false;
  }
}

// Run the test
testNOAADataAccess().then(success => {
  process.exit(success ? 0 : 1);
});

