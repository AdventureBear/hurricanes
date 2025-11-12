/**
 * GFS URL Builder
 * Builds URLs for NOMADS GFS (Global Forecast System) atmospheric data GRIB2 files
 * 
 * GFS files are available at:
 * https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.YYYYMMDD/HH/atmos/gfs.tHHz.pgrb2.RES.fFFF
 * 
 * Where:
 * - YYYYMMDD: Date
 * - HH: Run cycle (00, 06, 12, 18)
 * - RES: Resolution (0p25, 0p50, 1p00)
 * - FFF: Forecast hour (000, 003, 006, ...)
 * 
 * For atmospheric data, we typically use:
 * - Run cycle: 00 (00Z)
 * - Resolution: 0p25 (0.25 degree)
 * - Forecast hour: 000 (analysis) or 003 (3-hour forecast)
 */

/**
 * Formats a date as YYYYMMDD string
 */
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Builds the base URL for GFS data directory
 */
export function buildGFSBaseUrl(): string {
  return 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod';
}

/**
 * Builds the URL for a specific GFS GRIB2 file
 * 
 * @param date - Date for the GFS run
 * @param runCycle - Run cycle (00, 06, 12, 18), default '00'
 * @param resolution - Resolution ('0p25', '0p50', '1p00'), default '0p25'
 * @param forecastHour - Forecast hour ('000', '003', '006', ...), default '000'
 * @returns Full URL to the GRIB2 file
 */
export function buildGFSGrib2Url(
  date: Date = new Date(),
  runCycle: string = '00',
  resolution: string = '0p25',
  forecastHour: string = '000'
): string {
  const dateStr = formatDateString(date);
  const base = buildGFSBaseUrl();
  return `${base}/gfs.${dateStr}/${runCycle}/atmos/gfs.t${runCycle}z.pgrb2.${resolution}.f${forecastHour}`;
}

/**
 * Builds the URL for a specific GFS index file
 */
export function buildGFSIndexUrl(
  date: Date = new Date(),
  runCycle: string = '00',
  resolution: string = '0p25',
  forecastHour: string = '000'
): string {
  return `${buildGFSGrib2Url(date, runCycle, resolution, forecastHour)}.idx`;
}

/**
 * Finds the latest available GFS data date
 * 
 * Checks the last N days for available GFS data.
 * GFS data is typically available with a 1-2 day lag.
 * 
 * @param maxDaysBack - Maximum number of days to check (default: 3)
 * @returns Date of latest available data, or null if not found
 */
export async function findLatestAvailableGFSDate(maxDaysBack: number = 3): Promise<Date | null> {
  const now = new Date();
  
  for (let i = 0; i < maxDaysBack; i++) {
    const checkDate = new Date(now);
    checkDate.setUTCDate(checkDate.getUTCDate() - i);
    
    const url = buildGFSGrib2Url(checkDate, '00', '0p25', '000');
    const indexUrl = `${url}.idx`;
    
    try {
      const response = await fetch(indexUrl, { method: 'HEAD' });
      if (response.ok) {
        console.log(`[GFS] Found available data for: ${formatDateString(checkDate)}`);
        return checkDate;
      }
    } catch (error) {
      // Continue checking previous days
      continue;
    }
  }
  
  return null;
}

