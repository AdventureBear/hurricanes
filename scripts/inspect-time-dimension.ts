/**
 * Inspect the time dimension to understand the actual structure
 */

async function inspectTimeDimension() {
  const year = 2024;
  console.log(`\n=== Inspecting ${year} time dimension ===\n`);
  
  // First, get the full metadata to see time dimension size
  const metadataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${year}.nc.ascii?time[0:1:0]`;
  const metadataResponse = await fetch(metadataUrl);
  const metadataText = await metadataResponse.text();
  
  console.log('=== METADATA RESPONSE ===');
  console.log(metadataText);
  console.log('\n');
  
  // Try to get a range of time values
  console.log('=== Trying to get time[0:10:364] (first 10 of last 365) ===');
  const rangeUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${year}.nc.ascii?time[0:10:364]`;
  try {
    const rangeResponse = await fetch(rangeUrl);
    const rangeText = await rangeResponse.text();
    console.log(rangeText.substring(0, 2000));
  } catch (e) {
    console.log('Error:', e);
  }
  
  // Try getting the last time value
  console.log('\n=== Trying to get last time value ===');
  // First, we need to know the size. Let's try a large index
  for (const testIndex of [364, 300, 200, 100, 50]) {
    console.log(`\nTrying index ${testIndex}...`);
    const testUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${year}.nc.ascii?time[${testIndex}:1:${testIndex}]`;
    try {
      const testResponse = await fetch(testUrl);
      const testText = await testResponse.text();
      if (testText.includes('time[1]')) {
        const match = testText.match(/time\[1\]\s+([\d.]+)/);
        if (match) {
          const days = parseFloat(match[1]);
          const base = new Date(Date.UTC(1800, 0, 1, 0, 0, 0, 0));
          const date = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
          console.log(`  Success! Date: ${date.toISOString().split('T')[0]}`);
          break;
        }
      } else {
        console.log(`  Response: ${testText.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`  Error: ${e}`);
    }
  }
}

inspectTimeDimension();

