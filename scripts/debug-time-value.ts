/**
 * Debug script to see actual NOAA time value format
 */

async function debugTimeValue() {
  const currentYear = new Date().getFullYear();
  const metadataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${currentYear}.nc.ascii?time[0:1:0]`;
  
  const metadataResponse = await fetch(metadataUrl);
  const metadataText = await metadataResponse.text();
  
  const timeMatch = metadataText.match(/time\[(\d+)\]/);
  const maxTimeIndex = timeMatch ? parseInt(timeMatch[1]) : 0;
  const timeIndex = Math.max(0, maxTimeIndex - 2);
  
  console.log(`Fetching time value for index ${timeIndex}...`);
  const timeValueUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${currentYear}.nc.ascii?time[${timeIndex}:1:${timeIndex}]`;
  
  const timeValueResponse = await fetch(timeValueUrl);
  const timeValueText = await timeValueResponse.text();
  
  console.log('\n=== TIME VALUE RESPONSE ===');
  console.log(timeValueText);
  console.log('\n=== PARSING ATTEMPTS ===');
  
  // Try different regex patterns
  const patterns = [
    /time\[1\]\s+([\d.]+)/,
    /time\[1\]\s*([\d.]+)/,
    /time\[1\][\s\n]+([\d.]+)/,
    /time\[1\].*?([\d.]+)/,
    /([\d.]+)/,
  ];
  
  patterns.forEach((pattern, i) => {
    const match = timeValueText.match(pattern);
    console.log(`Pattern ${i + 1}: ${pattern} -> ${match ? match[1] : 'NO MATCH'}`);
  });
  
  // Also check if there's a time value in the SST data response
  console.log('\n=== CHECKING SST DATA FOR TIME ===');
  const dataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${currentYear}.nc.ascii?lat[379:1:379],lon[1059:1:1059],sst[${timeIndex}:1:${timeIndex}][379:1:379][1059:1:1059]`;
  const dataResponse = await fetch(dataUrl);
  const dataText = await dataResponse.text();
  
  // Look for time in SST response
  const timeInData = dataText.match(/sst\.time\[1\]\s+([\d.]+)/);
  console.log(`Time in SST data: ${timeInData ? timeInData[1] : 'NOT FOUND'}`);
}

debugTimeValue();

