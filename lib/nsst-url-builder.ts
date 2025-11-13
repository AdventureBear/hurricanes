/**
 * NSST URL Builder
 * Builds URLs for NOMADS NSST (Near-surface Sea Surface Temperature) GRIB2 files
 * 
 * NSST files are available at:
 * https://nomads.ncep.noaa.gov/pub/data/nccf/com/nsst/prod/nsst.YYYYMMDD/rtgssthr_grb_0.5.grib2
 * 
 * NOTE: Using 0.5° resolution file (rtgssthr_grb_0.5.grib2) which is appropriate for our use case
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
 * Builds the base URL for NSST data directory
 */
export function buildNSSTBaseUrl(): string {
  return 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/nsst/prod';
}

/**
 * Builds the URL for a specific NSST GRIB2 file
 * Uses 0.5° resolution file (rtgssthr_grb_0.5.grib2) which was working before
 * @param date - Date for the NSST file (defaults to today)
 * @returns Full URL to the GRIB2 file
 */
export function buildNSSTGrib2Url(date: Date = new Date()): string {
  const dateStr = formatDateString(date);
  const base = buildNSSTBaseUrl();
  // Using 0.5° resolution file (was working before)
  return `${base}/nsst.${dateStr}/rtgssthr_grb_0.5.grib2`;
}

/**
 * Builds the URL for a specific NSST index file
 * @param date - Date for the NSST file (defaults to today)
 * @returns Full URL to the .idx file
 */
export function buildNSSTIndexUrl(date: Date = new Date()): string {
  return `${buildNSSTGrib2Url(date)}.idx`;
}

/**
 * Determines the latest available NSST date
 * NSST is typically available with a 1-2 day lag
 * @returns Date object for the latest available NSST data
 */
export function getLatestNSSTDate(): Date {
  const now = new Date();
  // NSST typically has 1-2 day lag, try yesterday first
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday;
}

/**
 * Checks if an NSST file exists for a given date
 * @param date - Date to check
 * @returns true if file exists, false otherwise
 */
export async function checkNSSTFileExists(date: Date): Promise<boolean> {
  try {
    const url = buildNSSTGrib2Url(date);
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Finds the latest available NSST date by checking backwards from today
 * @param maxDaysBack - Maximum days to check backwards (default: 5)
 * @returns Date object for latest available NSST, or null if none found
 */
export async function findLatestAvailableNSSTDate(maxDaysBack: number = 5): Promise<Date | null> {
  const now = new Date();
  
  for (let i = 1; i <= maxDaysBack; i++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() - i);
    
    if (await checkNSSTFileExists(checkDate)) {
      console.log(`[NSST] Found latest available date: ${formatDateString(checkDate)}`);
      return checkDate;
    }
  }
  
  console.warn(`[NSST] No NSST file found in last ${maxDaysBack} days`);
  return null;
}

