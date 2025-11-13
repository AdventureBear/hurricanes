'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { geoMercator } from 'd3-geo';
import * as topojson from 'topojson-client';
import type { PIDataResponse } from '../types/pi';
import type { Basin, GeographicBounds } from '../types/geographic';
import basinsDataRaw from '../rules/basins.json';
import { calculatePIData } from '../app/actions/calculate-pi';

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
  useEffect(() => {
    if (!data) {
      setFilteredData(null);
      return;
    }

    console.log(`[Pressure Map] Filtering ${data.pointCount} global points for ${selectedBasin.basin}...`);
    const clipBounds = basinToBounds(selectedBasin);
    
    // Filter data to selected basin bounds and valid pressure values
    // Pressure range: 880-1020 mb (includes normal surface pressure ~1013 mb)
    const filteredPoints = data.gridPoints.filter(p => {
      // Check pressure validity (reasonable atmospheric pressure range)
      if (p.pmin < 880 || p.pmin > 1020 || isNaN(p.pmin)) return false;
      
      // Check latitude
      if (p.lat < clipBounds.minLat || p.lat > clipBounds.maxLat) return false;
      
      // Check longitude (handle wraparound)
      if (clipBounds.minLon <= clipBounds.maxLon) {
        return p.lon >= clipBounds.minLon && p.lon <= clipBounds.maxLon;
      } else {
        return p.lon >= clipBounds.minLon || p.lon <= clipBounds.maxLon;
      }
    });
    
    console.log(`[Pressure Map] Filtered to ${filteredPoints.length} points within ${selectedBasin.basin} bounds`);
    
    // Additional filtering: Use TopoJSON land data to filter out points over land
    fetch('/data/countries-110m.json')
      .then(res => res.json())
      .then((world) => {
        const land = topojson.feature(world as any, (world as any).objects.countries);
        const features = (land as unknown as GeoJSON.FeatureCollection).features;
        
        // Filter out points that are over land using d3.geoContains
        const oceanOnlyPoints = filteredPoints.filter(p => {
          const point: GeoJSON.Position = [p.lon, p.lat];
          for (const feature of features) {
            if (d3.geoContains(feature, point)) {
              return false; // Point is over land
            }
          }
          return true; // Point is over ocean
        });
        
        console.log(`[Pressure Map] Filtered out ${filteredPoints.length - oceanOnlyPoints.length} land points`);
        
        setFilteredData({
          ...data,
          gridPoints: oceanOnlyPoints,
          pointCount: oceanOnlyPoints.length,
          bounds: clipBounds
        });
      })
      .catch(err => {
        console.warn('[Pressure Map] Could not load land data for filtering, using all points:', err);
        setFilteredData({
          ...data,
          gridPoints: filteredPoints,
          pointCount: filteredPoints.length,
          bounds: clipBounds
        });
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
    if (!filteredData || !svgRef.current) {
      console.log('[Pressure Map] Skipping render - no filtered data or SVG ref');
      return;
    }
    
    if (isRenderingRef.current) {
      console.log('[Pressure Map] Render already in progress, skipping...');
      return;
    }
    
    isRenderingRef.current = true;
    console.log(`[Pressure Map] Starting render for ${selectedBasin.basin} with ${filteredData.pointCount} points...`);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const basePadding = Math.min(width, height) * 0.03;
    const padding = {
      top: 0,
      bottom: Math.max(20, basePadding),
      left: Math.max(35, basePadding * 1.5),
      right: 0
    };
    
    const mapWidth = width - padding.left - padding.right;
    const mapHeight = height - padding.top - padding.bottom;

    const clipBounds = filteredData.bounds;
    const centerLon = (clipBounds.minLon + clipBounds.maxLon) / 2;
    const centerLat = (clipBounds.minLat + clipBounds.maxLat) / 2;
    
    const lonRange = clipBounds.maxLon - clipBounds.minLon;
    const latRange = clipBounds.maxLat - clipBounds.minLat;
    const aspectRatio = mapWidth / mapHeight;
    const basinAspectRatio = lonRange / latRange;
    
    let scale = 700;
    if (basinAspectRatio > aspectRatio) {
      scale = (mapWidth * 0.95) / (lonRange * Math.PI / 180);
    } else {
      scale = (mapHeight * 0.95) / (latRange * Math.PI / 180);
    }
    
    const mapCenterX = padding.left + mapWidth / 2;
    const mapCenterY = padding.top + mapHeight / 2;
    
    const projection = geoMercator()
      .center([centerLon, centerLat])
      .scale(scale)
      .translate([mapCenterX, mapCenterY]);

    projectionRef.current = projection;
    
    const pathGenerator = d3.geoPath().projection(projection);
    pathGeneratorRef.current = pathGenerator;

    // Clip path for map bounds
    const clipX = padding.left;
    const clipY = padding.top;
    const clipWidth = mapWidth;
    const clipHeight = mapHeight;

    const clipPathId = 'pressure-map-clip';
    const defs = svg.append('defs');
    defs.append('clipPath')
      .attr('id', clipPathId)
      .append('rect')
      .attr('x', clipX)
      .attr('y', clipY)
      .attr('width', clipWidth)
      .attr('height', clipHeight);

    const g = svg.append('g').attr('clip-path', `url(#${clipPathId})`);

    // Use pressure color scale (880-1020 mb)
    const colorScale = d3.scaleSequential<string>()
      .domain([880, 1020])
      .interpolator((t: number) => d3.interpolateSpectral(1 - t));

    // Render grid cells (similar to SST map)
    const gridGroup = g.append('g').attr('class', 'pressure-grid');
    const halfCell = 0.25; // 0.5° resolution
    
    filteredData.gridPoints.forEach(d => {
      const overlap = 0.01;
      const lonMin = d.lon - halfCell - overlap;
      const lonMax = d.lon + halfCell + overlap;
      const latMin = d.lat - halfCell - overlap;
      const latMax = d.lat + halfCell + overlap;
      
      const corners = [
        projection([lonMin, latMin]),
        projection([lonMax, latMin]),
        projection([lonMax, latMax]),
        projection([lonMin, latMax])
      ];
      
      if (corners.every(c => c !== null)) {
        const xs = corners.map(c => c![0]);
        const ys = corners.map(c => c![1]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const cellWidth = Math.max(...xs) - x;
        const cellHeight = Math.max(...ys) - y;
        
        gridGroup.append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', cellWidth)
          .attr('height', cellHeight)
          .attr('fill', colorScale(d.pmin))
          .attr('opacity', 0.95)
          .attr('stroke', 'none')
          .attr('class', 'hover-target')
          .on('mouseenter', function(event) {
            setTooltip({
              show: true,
              x: event.pageX + 10,
              y: event.pageY - 10,
              content: `Lat: ${d.lat.toFixed(2)}°, Lon: ${d.lon.toFixed(2)}°\nPressure: ${d.pmin.toFixed(1)} mb\nWind: ${d.vmax.toFixed(0)} kt (${d.category})`
            });
          })
          .on('mouseleave', function() {
            setTooltip(prev => ({ ...prev, show: false }));
          });
      }
    });

    // Load and render coastlines
    fetch('/data/countries-110m.json')
      .then(res => res.json())
      .then((world) => {
        const land = topojson.feature(world as any, (world as any).objects.countries);
        const features = (land as unknown as GeoJSON.FeatureCollection).features;
        
        const expandedBounds = {
          minLon: clipBounds.minLon - 2,
          maxLon: clipBounds.maxLon + 2,
          minLat: clipBounds.minLat - 2,
          maxLat: clipBounds.maxLat + 2
        };
        
        const filteredFeatures = features.filter(f => {
          if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
            const coords = f.geometry.type === 'Polygon' 
              ? f.geometry.coordinates[0] 
              : f.geometry.coordinates.flat()[0];
            
            if (coords && coords.length > 0) {
              const lons = coords.map((c: number[]) => c[0]);
              const lats = coords.map((c: number[]) => c[1]);
              const minLon = Math.min(...lons);
              const maxLon = Math.max(...lons);
              const minLat = Math.min(...lats);
              const maxLat = Math.max(...lats);
              
              return !(maxLon < expandedBounds.minLon || minLon > expandedBounds.maxLon ||
                       maxLat < expandedBounds.minLat || minLat > expandedBounds.maxLat);
            }
          }
          return false;
        });
        
        const currentPathGenerator = pathGeneratorRef.current;
        if (!currentPathGenerator) {
          console.error('[Pressure Map] PathGenerator not available for coastlines');
          return;
        }
        
        g.append('g')
          .attr('class', 'coastlines')
          .selectAll('path')
          .data(filteredFeatures)
          .enter()
          .append('path')
          .attr('d', d => currentPathGenerator(d as GeoJSON.Feature))
          .attr('fill', 'none')
          .attr('stroke', '#333')
          .attr('stroke-width', 1.5)
          .attr('opacity', 0.9)
          .attr('pointer-events', 'none');
      })
      .catch(err => console.error('[Pressure Map] Error loading coastlines:', err));

    // Add graticule
    const graticule = d3.geoGraticule()
      .extent([[clipBounds.minLon, clipBounds.minLat], [clipBounds.maxLon, clipBounds.maxLat]]);
    
    g.append('path')
      .datum(graticule())
      .attr('d', pathGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#ccc')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.5);

    // Add border
    g.append('rect')
      .attr('x', clipX)
      .attr('y', clipY)
      .attr('width', clipWidth)
      .attr('height', clipHeight)
      .attr('fill', 'none')
      .attr('stroke', '#000')
      .attr('stroke-width', 2);

    isRenderingRef.current = false;
    console.log('[Pressure Map] Rendering complete');
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
    <div className="relative">
      <svg ref={svgRef} width={width} height={height} className="bg-white border border-gray-300" />
      
      {/* Tooltip */}
      {tooltip.show && (
        <div
          className="absolute bg-black text-white px-3 py-2 rounded shadow-lg text-sm pointer-events-none z-50 whitespace-pre-line"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
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

