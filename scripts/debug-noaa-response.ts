/**
 * Debug script to see actual NOAA response format
 */

async function debugResponse() {
  const currentYear = new Date().getFullYear();
  const metadataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${currentYear}.nc.ascii?time[0:1:0]`;
  
  const metadataResponse = await fetch(metadataUrl);
  const metadataText = await metadataResponse.text();
  
  const timeMatch = metadataText.match(/time\[(\d+)\]/);
  const maxTimeIndex = timeMatch ? parseInt(timeMatch[1]) : 0;
  const timeIndex = Math.max(0, maxTimeIndex - 2);
  
  // Fetch smaller sample
  const dataUrl = `https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.day.mean.${currentYear}.nc.ascii?` +
    `lat[100:1:102],` +  // Just 3 latitudes
    `lon[420:1:422],` +   // Just 3 longitudes
    `sst[${timeIndex}:1:${timeIndex}][100:1:102][420:1:422]`;
  
  const dataResponse = await fetch(dataUrl);
  const dataText = await dataResponse.text();
  
  console.log('=== RAW RESPONSE ===');
  console.log(dataText);
  console.log('\n=== SECTIONS ===');
  
  const sections = dataText.split(/\n-{20,}\n/);
  sections.forEach((section, i) => {
    console.log(`\n--- Section ${i} (${section.length} chars) ---`);
    console.log(section.substring(0, 500));
  });
}

debugResponse();

