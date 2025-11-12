export interface SSTGridPoint {
  lat: number;
  lon: number;
  sst: number; // Sea surface temperature in Celsius
}

export interface SSTDataResponse {
  date: string; // ISO date string
  gridPoints: SSTGridPoint[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  source: string;
  pointCount: number;
}

export interface CachedSSTData {
  data: SSTDataResponse;
  timestamp: number; // When the cache was written (milliseconds since epoch)
  lastChecked: number; // When we last checked NOAA for newer data (milliseconds since epoch)
  filename: string;
  dataDate: string; // The actual date of the SST data from NOAA (YYYY-MM-DD)
}

