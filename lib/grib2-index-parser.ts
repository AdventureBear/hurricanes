/**
 * GRIB2 Index Parser
 * Parses .idx files to find byte ranges for specific variables
 * 
 * Index file format:
 * message_number:byte_offset:date:variable:level:forecast_hour
 * Example: 1:0:20251112:TMP:surface:0
 */

export interface GRIB2Message {
  messageNum: number;
  startByte: number;
  endByte: number;
  variable: string;
  level: string;
  date?: string;
  forecastHour?: string;
}

/**
 * Parses a GRIB2 index file to find messages matching a variable pattern
 * @param idxText - Content of the .idx file
 * @param wantedVariable - Variable name to find (e.g., 'TMP', 'nsstf', 'nsst')
 * @param level - Optional level filter (e.g., 'surface', '2 m above ground')
 * @returns Array of matching GRIB2 messages with byte ranges
 */
export function parseGRIB2Index(
  idxText: string,
  wantedVariable: string,
  level?: string
): GRIB2Message[] {
  const lines = idxText.split('\n').filter(line => line.trim().length > 0);
  const messages: GRIB2Message[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(':');
    
    if (parts.length < 4) continue;
    
    const messageNum = parseInt(parts[0], 10);
    const startByte = parseInt(parts[1], 10);
    const variable = parts[3];
    const msgLevel = parts[4] || '';
    
    // Check if this message matches our criteria
    const variableMatch = variable.toLowerCase().includes(wantedVariable.toLowerCase());
    const levelMatch = !level || msgLevel.toLowerCase().includes(level.toLowerCase());
    
    if (variableMatch && levelMatch) {
      // Calculate end byte (start of next message, or file end)
      let endByte: number;
      if (i + 1 < lines.length) {
        const nextParts = lines[i + 1].split(':');
        if (nextParts.length >= 2) {
          endByte = parseInt(nextParts[1], 10) - 1;
        } else {
          // If we can't parse next line, estimate (GRIB2 messages are typically 100KB-10MB)
          endByte = startByte + 10000000; // 10MB estimate
        }
      } else {
        // Last message - estimate end
        endByte = startByte + 10000000;
      }
      
      messages.push({
        messageNum,
        startByte,
        endByte,
        variable,
        level: msgLevel,
        date: parts[2],
        forecastHour: parts[5]
      });
    }
  }
  
  return messages;
}

/**
 * Fetches and parses a GRIB2 index file
 * @param indexUrl - URL to the .idx file
 * @param wantedVariable - Variable name to find
 * @param level - Optional level filter
 * @returns Array of matching GRIB2 messages
 */
export async function fetchAndParseGRIB2Index(
  indexUrl: string,
  wantedVariable: string,
  level?: string
): Promise<GRIB2Message[]> {
  console.log(`[GRIB2] Fetching index from: ${indexUrl}`);
  const response = await fetch(indexUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch GRIB2 index: ${response.status} ${response.statusText}`);
  }
  
  const idxText = await response.text();
  const messages = parseGRIB2Index(idxText, wantedVariable, level);
  
  console.log(`[GRIB2] Found ${messages.length} matching messages for ${wantedVariable}${level ? ` at ${level}` : ''}`);
  
  return messages;
}

