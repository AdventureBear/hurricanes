export interface LatLon {
  lat: number;
  lon: number;
}

export interface GeographicBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface Basin {
  basin: string;
  coordinates: {
    topleft: [number, number]; // [lat, lon]
    topright: [number, number];
    bottomright: [number, number];
    bottomleft: [number, number];
  };
}

export interface BasinBounds {
  name: string;
  bounds: GeographicBounds;
}

