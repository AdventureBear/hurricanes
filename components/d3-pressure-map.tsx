'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { geoMercator } from 'd3-geo';
import * as topojson from 'topojson-client';
import type { PIDataResponse } from '../types/pi';
import type { Basin, GeographicBounds } from '../types/geographic';
import basinsDataRaw from '../rules/basins.json';
import { calculatePIData } from '../app/actions/calculate-pi';
import { renderD3MapBase } from './d3-map-base';

/**
 * DEFAULT PROJECTION: Mercator (geoMercator)
 * This is the standard projection for tropical weather mapping and hurricane visualization.
 * All geographic features (pressure data, coastlines, graticules) use this projection.
 */

// Type assertion for imported JSON (tuples are inferred as number[])
const basinsData = basinsDataRaw as Basin[];

interface D3PressureMapProps {
  width?: number;
  height?: number;
  onDataDateChange?: (date: string | null) => void;
}

// Convert basin coordinates to GeographicBounds
function basinToBounds(basin: Basin): GeographicBounds {
  const coords = basin.coordinates;
  const lats = [coords.topleft[0], coords.topright[0], coords.bottomright[0], coords.bottomleft[0]];
  const lons = [coords.topleft[1], coords.topright[1], coords.bottomright[1], coords.bottomleft[1]];
  
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons)
  };
}

export default function D3PressureMap({ width: propWidth, height: propHeight, onDataDateChange }: D3PressureMapProps) {
  // Responsive sizing
  const [dimensions, setDimensions] = useState({
    width: propWidth || 1200,
    height: propHeight || 700
  });
  
  const { width, height } = dimensions;
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<PIDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBasin, setSelectedBasin] = useState<Basin>(
    basinsData.find(b => b.basin === 'North Atlantic') || basinsData[1]
  );
  const [tooltip, setTooltip] = useState<{
    show: boolean;
    x: number;
    y: number;
    content: string;
  }>({ show: false, x: 0, y: 0, content: '' });
  const [filteredData, setFilteredData] = useState<PIDataResponse | null>(null);
  const isRenderingRef = useRef(false);
  const hasFetchedRef = useRef(false);
  // Store Mercator projection in ref to ensure consistency across async operations
  const projectionRef = useRef<d3.GeoProjection | null>(null);
  const pathGeneratorRef = useRef<d3.GeoPath | null>(null);

  // Update dimensions when basin changes or window resizes
  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('map-container');
      if (!container) return;
      
      const containerWidth = container.clientWidth;
      const maxWidth = 1400;
      const padding = 16;
      const legendSpace = 100;
      const availableWidth = Math.min(containerWidth - padding - legendSpace, maxWidth);
      
      // Calculate aspect ratio based on selected basin's geographic bounds
      let aspectRatio = 0.583; // Default aspect ratio
      if (selectedBasin) {
        const clipBounds = basinToBounds(selectedBasin);
        const lonRange = clipBounds.maxLon - clipBounds.minLon;
        const latRange = clipBounds.maxLat - clipBounds.minLat;
        
        const avgLat = (clipBounds.minLat + clipBounds.maxLat) / 2;
        const latCorrection = Math.cos((avgLat * Math.PI) / 180);
        
        aspectRatio = (lonRange * latCorrection) / latRange;
      }
      
      const calculatedHeight = availableWidth / aspectRatio;
      const maxHeight = 800;
      const finalHeight = Math.min(calculatedHeight, maxHeight);
      const finalWidth = finalHeight * aspectRatio;
      
      setDimensions({
        width: finalWidth,
        height: finalHeight
      });
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [selectedBasin]);

  // Fetch PI data
  const fetchData = useCallback(async () => {
    if (hasFetchedRef.current && !refreshing) {
      console.log('[Pressure Map] Already fetched, skipping...');
      return;
    }
    
    // Prevent concurrent fetches
    if (isRenderingRef.current) {
      console.log('[Pressure Map] Fetch already in progress, skipping...');
      return;
    }
    
    hasFetchedRef.current = true; // Set immediately to prevent duplicate calls
    setLoading(true);
    setError(null);
    
    try {
      console.log('[Pressure Map] Fetching PI data...');
      const piData = await calculatePIData();
      console.log(`[Pressure Map] Loaded ${piData.pointCount} PI grid points`);
      
      setData(piData);
      
      if (onDataDateChange) {
        onDataDateChange(piData.sstDate);
      }
    } catch (err) {
      console.error('[Pressure Map] Error fetching PI data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pressure data');
      hasFetchedRef.current = false; // Reset on error so we can retry
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onDataDateChange, refreshing]);

  // Initial data fetch
  useEffect(() => {
    if (!hasFetchedRef.current) {
      fetchData();
    }
  }, [fetchData]);

  // Filter data when basin or global data changes
  // Note: Land filtering is now handled by SVG masking in the base renderer (much faster)
  useEffect(() => {
    if (!data) {
      setFilteredData(null);
      return;
    }

    console.log(`[Pressure Map] Filtering ${data.pointCount} global points for ${selectedBasin.basin}...`);
    const clipBounds = basinToBounds(selectedBasin);
    
    // Filter data to selected basin bounds
    // Note: We trust the PI calculation equations - only filter obviously invalid values (NaN, negative, extreme)
    // Land filtering is now done via SVG masking in the base renderer (much faster than point-by-point)
    const filteredPoints = data.gridPoints.filter(p => {
      // Only filter obviously invalid values - let the equations determine what's realistic
      // Filter NaN, negative values, or extremely high values (>2000mb = likely unit error)
      if (isNaN(p.pmin) || p.pmin < 0 || p.pmin > 2000) {
        return false;
      }
      
      // Check latitude
      if (p.lat < clipBounds.minLat || p.lat > clipBounds.maxLat) return false;
      
      // Check longitude (handle wraparound)
      if (clipBounds.minLon <= clipBounds.maxLon) {
        return p.lon >= clipBounds.minLon && p.lon <= clipBounds.maxLon;
      } else {
        return p.lon >= clipBounds.minLon || p.lon <= clipBounds.maxLon;
      }
    });
    
    // Diagnostic: Log pressure value distribution
    if (filteredPoints.length > 0) {
      const pressures = filteredPoints.map(p => p.pmin);
      const minP = Math.min(...pressures);
      const maxP = Math.max(...pressures);
      const avgP = pressures.reduce((a, b) => a + b, 0) / pressures.length;
      const lowPressures = pressures.filter(p => p < 900).length;
      const veryLowPressures = pressures.filter(p => p < 880);
      
      console.log(`[Pressure Map] Filtered to ${filteredPoints.length} points within ${selectedBasin.basin} bounds`);
      console.log(`[Pressure Map] Pressure range: ${minP.toFixed(1)} - ${maxP.toFixed(1)} mb (avg: ${avgP.toFixed(1)} mb)`);
      console.log(`[Pressure Map] Points with pmin < 900mb: ${lowPressures} (these are the intense storm regions)`);
      
      // Troubleshooting: Log values < 880mb
      if (veryLowPressures.length > 0) {
        console.warn(`[Pressure Map] ⚠️ Found ${veryLowPressures.length} points with pmin < 880mb (troubleshooting)`);
        const sampleLow = veryLowPressures.slice(0, 10).sort((a, b) => a - b);
        console.warn(`[Pressure Map] Sample low pressures: ${sampleLow.map(p => p.toFixed(1)).join(', ')} mb`);
        
        // Find actual points with these low pressures for inspection
        const lowPressurePoints = filteredPoints
          .filter(p => p.pmin < 880)
          .slice(0, 5)
          .map(p => `(${p.lat.toFixed(2)}°N, ${p.lon.toFixed(2)}°W): ${p.pmin.toFixed(1)}mb, vmax=${p.vmax.toFixed(0)}kt, SST=${p.sst.toFixed(1)}°C`);
        console.warn(`[Pressure Map] Sample locations with pmin < 880mb:`, lowPressurePoints);
      }
      
      console.log(`[Pressure Map] Land filtering will be handled by SVG masking (no point-by-point checks needed)`);
    }
    
    setFilteredData({
      ...data,
      gridPoints: filteredPoints, // Include all points - mask will hide land ones
      pointCount: filteredPoints.length,
      bounds: clipBounds
    });
  }, [data, selectedBasin]);

  // Refresh handler
  const handleRefresh = () => {
    hasFetchedRef.current = false;
    setRefreshing(true);
    fetchData();
  };

  // Render D3 map when filtered data changes
  useEffect(() => {
    if (!filteredData) return;
    
    // Use base renderer - ensures identical layout, projection, labels, and legend alignment with SST map
    renderD3MapBase({
      svgRef,
      filteredData,
      selectedBasin,
      width,
      height,
      config: {
        colorScale: () => {
          // Use fixed domain for consistent color mapping and legend alignment
          // The equations should produce values in a reasonable range
          return d3.scaleSequential<string>()
            .domain([880, 1030])
            .interpolator((t: number) => d3.interpolateSpectral(1 - t));
        },
        legendDomain: [880, 1030] as [number, number], // Fixed legend range - matches color scale domain
        legendFormat: (value: number) => `${value} mb`,
        legendTitle: 'Pressure (mb)',
        getValue: (point) => point.pmin,
        formatTooltip: (point) => {
          // Add diagnostic info to tooltip
          return `Lat: ${point.lat.toFixed(2)}°, Lon: ${point.lon.toFixed(2)}°\nPressure: ${point.pmin.toFixed(1)} mb\nWind: ${point.vmax.toFixed(0)} kt (${point.category})\nSST: ${point.sst.toFixed(1)}°C`;
        },
        isValidValue: (value) => !isNaN(value) && value > 0 && value < 2000 // Only filter obviously invalid values
      },
      projectionRef,
      pathGeneratorRef,
      isRenderingRef,
      setTooltip
    });
  }, [filteredData, selectedBasin, width, height]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading pressure data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div className="text-center text-red-600">
          <p className="font-semibold">Error loading pressure data</p>
          <p className="text-sm mt-2">{error}</p>
          <button
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-full" id="map-container">
      {/* Map and Legend Container - Single SVG contains both */}
      <div className="bg-white rounded-lg border border-gray-300 p-2 shadow-lg" style={{ overflow: 'visible', maxWidth: '100%' }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="bg-white"
          style={{ display: 'block', width: '100%', maxWidth: '100%', height: 'auto', overflow: 'visible' }}
          preserveAspectRatio="xMidYMid meet"
        />
      </div>
      
      {/* Tooltip - positioned relative to SVG container */}
      {tooltip.show && (
        <div
          className="absolute pointer-events-none bg-black/90 text-white px-3 py-2 rounded text-sm whitespace-pre-line z-50 shadow-lg border border-gray-600"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: 'translate(-50%, -100%)',
            marginTop: '-8px' // Small offset above cursor
          }}
        >
          {tooltip.content}
        </div>
      )}
      
      {/* Data info */}
      {filteredData && (
        <div className="absolute top-2 left-2 bg-white bg-opacity-90 px-3 py-2 rounded shadow text-xs">
          <div className="font-semibold">Minimum Central Pressure</div>
          <div>SST Date: {filteredData.sstDate}</div>
          <div>Atmospheric Date: {filteredData.atmosphericDate}</div>
          <div>Points: {filteredData.pointCount.toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}
