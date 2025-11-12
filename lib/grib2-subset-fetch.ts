/**
 * GRIB2 Subset Fetcher
 * Downloads only specific byte ranges from GRIB2 files using HTTP Range requests
 * This avoids downloading entire multi-GB files when we only need one variable
 */

import type { GRIB2Message } from './grib2-index-parser';

/**
 * Fetches a subset of a GRIB2 file using HTTP Range requests
 * @param gribUrl - URL to the GRIB2 file
 * @param messages - Array of GRIB2 messages with byte ranges
 * @returns ArrayBuffer containing the concatenated byte ranges
 */
export async function fetchGRIB2Subset(
  gribUrl: string,
  messages: GRIB2Message[]
): Promise<ArrayBuffer> {
  if (messages.length === 0) {
    throw new Error('No GRIB2 messages provided for subset download');
  }
  
  console.log(`[GRIB2] Downloading ${messages.length} message(s) from ${gribUrl}`);
  
  // For single message, use simple Range request
  if (messages.length === 1) {
    const msg = messages[0];
    const rangeHeader = `bytes=${msg.startByte}-${msg.endByte}`;
    
    console.log(`[GRIB2] Fetching bytes ${msg.startByte}-${msg.endByte} (${(msg.endByte - msg.startByte) / 1024 / 1024} MB)`);
    
    const response = await fetch(gribUrl, {
      headers: { 'Range': rangeHeader }
    });
    
    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch GRIB2 subset: ${response.status} ${response.statusText}`);
    }
    
    return await response.arrayBuffer();
  }
  
  // For multiple messages, we need to fetch each separately and concatenate
  // (HTTP Range with multiple ranges is complex, so fetch individually)
  console.log(`[GRIB2] Fetching ${messages.length} messages individually...`);
  
  const buffers: ArrayBuffer[] = [];
  
  for (const msg of messages) {
    const rangeHeader = `bytes=${msg.startByte}-${msg.endByte}`;
    const sizeMB = ((msg.endByte - msg.startByte) / 1024 / 1024).toFixed(2);
    
    console.log(`[GRIB2] Fetching message ${msg.messageNum}: bytes ${msg.startByte}-${msg.endByte} (${sizeMB} MB)`);
    
    const response = await fetch(gribUrl, {
      headers: { 'Range': rangeHeader }
    });
    
    if (!response.ok && response.status !== 206) {
      console.warn(`[GRIB2] Failed to fetch message ${msg.messageNum}, skipping...`);
      continue;
    }
    
    const buffer = await response.arrayBuffer();
    buffers.push(buffer);
  }
  
  // Concatenate all buffers
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  
  console.log(`[GRIB2] Downloaded ${(totalLength / 1024 / 1024).toFixed(2)} MB total`);
  
  return result.buffer;
}

/**
 * Downloads a GRIB2 file subset and saves it to disk
 * @param gribUrl - URL to the GRIB2 file
 * @param messages - Array of GRIB2 messages with byte ranges
 * @param outputPath - Path to save the file
 * @returns Path to the saved file
 */
export async function downloadGRIB2SubsetToFile(
  gribUrl: string,
  messages: GRIB2Message[],
  outputPath: string
): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });
  
  // Download subset
  const buffer = await fetchGRIB2Subset(gribUrl, messages);
  
  // Write to file
  await fs.writeFile(outputPath, Buffer.from(buffer));
  
  console.log(`[GRIB2] Saved subset to: ${outputPath}`);
  
  return outputPath;
}

