'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { geoMercator } from 'd3-geo';
import * as topojson from 'topojson-client';
import type { SSTDataResponse } from '../types/sst';
import SSTColorLegend, { createOceanographicScale } from './sst-color-legend';

interface D3SSTMapProps {
  width?: number;
  height?: number;
}

export default function D3SSTMap({ width = 1200, height = 700 }: D3SSTMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<SSTDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tooltip, setTooltip] = useState<{
    show: boolean;
    x: number;
    y: number;
    content: string;
  }>({ show: false, x: 0, y: 0, content: '' });
  const [mapBounds, setMapBounds] = useState<{ top: number; bottom: number; height: number } | null>(null);

  // Fetch SST data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/sst-data');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const jsonData: SSTDataResponse = await response.json();
      console.log(`[Map] Loaded ${jsonData.pointCount} SST grid points`);
      setData(jsonData);
    } catch (err) {
      console.error('[Map] Error fetching SST data:', err);
      setError(String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Refresh handler
  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Render D3 map when data changes
  useEffect(() => {
    if (!data || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    // Define clipping bounds matching SST data bounds: 5°N-45°N, 95°W-10°W
    // This must be defined BEFORE the projection so we can use it for graticule extent
    const clipBounds = {
      minLat: 5,
      maxLat: 45,
      minLon: -95,
      maxLon: -10
    };

    // Set up Mercator projection - standard for tropical weather mapping
    // Atlantic basin: 5°N-45°N, 95°W-10°W
    // Center: ~25°N, ~52.5°W
    // Use a fixed scale that works well for this region
    const projection = geoMercator()
      .center([-52.5, 25]) // Center on Atlantic basin
      .scale(700) // Fixed scale for consistent sizing
      .translate([width / 2, height / 2]);
    
    // Create path generator ONCE with the projection - use for BOTH data and coastlines
    const pathGenerator = d3.geoPath(projection);

    // Use oceanographic color scale
    const colorScale = createOceanographicScale();
    
    // Create clipping path in SCREEN coordinates (not geographic)
    // Project the corner points to get screen bounds
    const clipPathId = 'sst-clip-path';
    const defs = svg.append('defs');
    const clipPath = defs.append('clipPath').attr('id', clipPathId);
    
    // Project the four corners of our geographic bounds to screen coordinates
    const corners = [
      projection([clipBounds.minLon, clipBounds.minLat]), // bottom-left
      projection([clipBounds.maxLon, clipBounds.minLat]), // bottom-right
      projection([clipBounds.maxLon, clipBounds.maxLat]), // top-right
      projection([clipBounds.minLon, clipBounds.maxLat])  // top-left
    ];
    
    // Get bounding box in screen coordinates
    const xs = corners.map(c => c?.[0] ?? 0).filter(x => !isNaN(x));
    const ys = corners.map(c => c?.[1] ?? 0).filter(y => !isNaN(y));
    const clipX = Math.min(...xs);
    const clipY = Math.min(...ys);
    const clipWidth = Math.max(...xs) - clipX;
    const clipHeight = Math.max(...ys) - clipY;
    
    // Create rectangular clipping path in screen coordinates
    clipPath.append('rect')
      .attr('x', clipX)
      .attr('y', clipY)
      .attr('width', clipWidth)
      .attr('height', clipHeight);

    // Create main group with clipping applied
    const g = svg.append('g').attr('clip-path', `url(#${clipPathId})`);

    // Add lat/lon grid lines (also clipped to bounds)
    const graticule = d3.geoGraticule()
      .extent([[clipBounds.minLon, clipBounds.minLat], [clipBounds.maxLon, clipBounds.maxLat]])
      .step([5, 5]); // Grid lines every 5 degrees

    g.append('path')
      .datum(graticule)
      .attr('class', 'graticule')
      .attr('d', pathGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#ddd')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.5);
    
    // Add black border around the map (using the clipping bounds)
    // Draw border first so labels can be positioned outside it
    const borderGroup = svg.append('g').attr('class', 'map-border');
    borderGroup.append('rect')
      .attr('x', clipX)
      .attr('y', clipY)
      .attr('width', clipWidth)
      .attr('height', clipHeight)
      .attr('fill', 'none')
      .attr('stroke', '#000000')
      .attr('stroke-width', 2);
    
    // Store the map bounds for legend alignment
    setMapBounds({
      top: clipY,
      bottom: clipY + clipHeight,
      height: clipHeight
    });
    
    // Add graticule labels (outside the map border)
    // Create a separate group for labels that won't be clipped
    const labelGroup = svg.append('g').attr('class', 'graticule-labels');
    
    // Generate latitude labels (on left side only, outside border)
    // Right side labels removed - legend will be placed there
    const latLines = d3.range(Math.ceil(clipBounds.minLat / 5) * 5, clipBounds.maxLat + 5, 5);
    latLines.forEach(lat => {
      const [x, y] = projection([clipBounds.minLon, lat]) || [0, 0];
      
      // Left side label (outside border)
      if (x >= 0 && y >= 0 && y <= height) {
        labelGroup.append('text')
          .attr('x', clipX - 8)
          .attr('y', y)
          .attr('text-anchor', 'end')
          .attr('alignment-baseline', 'middle')
          .style('font-size', '10px')
          .style('fill', '#000000')
          .style('font-weight', '500')
          .text(`${lat > 0 ? lat + '°N' : lat === 0 ? '0°' : Math.abs(lat) + '°S'}`);
      }
    });
    
    // Generate longitude labels (on top and bottom, outside border)
    const lonLines = d3.range(Math.ceil(clipBounds.minLon / 5) * 5, clipBounds.maxLon + 5, 5);
    lonLines.forEach(lon => {
      const [x, y] = projection([lon, clipBounds.minLat]) || [0, 0];
      const [xTop, yTop] = projection([lon, clipBounds.maxLat]) || [0, 0];
      
      // Bottom label (outside border)
      if (x >= 0 && x <= width && y >= 0) {
        labelGroup.append('text')
          .attr('x', x)
          .attr('y', clipY + clipHeight + 18)
          .attr('text-anchor', 'middle')
          .attr('alignment-baseline', 'hanging')
          .style('font-size', '10px')
          .style('fill', '#000000')
          .style('font-weight', '500')
          .text(`${lon < 0 ? Math.abs(lon) + '°W' : lon === 0 ? '0°' : lon + '°E'}`);
      }
      
      // Top label (outside border)
      if (xTop >= 0 && xTop <= width && yTop >= 0) {
        labelGroup.append('text')
          .attr('x', xTop)
          .attr('y', clipY - 8)
          .attr('text-anchor', 'middle')
          .attr('alignment-baseline', 'baseline')
          .style('font-size', '10px')
          .style('fill', '#000000')
          .style('font-weight', '500')
          .text(`${lon < 0 ? Math.abs(lon) + '°W' : lon === 0 ? '0°' : lon + '°E'}`);
      }
    });

    console.log(`[Map] Rendering ${data.gridPoints.length} points as filled grid cells...`);
    
    // Filter valid data
    const validPoints = data.gridPoints.filter(p => p.sst >= 10 && p.sst <= 35);
    
    // Render each grid cell as a rectangle
    // Each data point is the CENTER of a 0.25° x 0.25° grid cell
    // Cell boundaries are ±0.125° from center
    const halfCell = 0.125; // half of 0.25°
    
    // Render grid cells - use exact same projection as coastlines
    const gridGroup = g.append('g').attr('class', 'sst-grid');
    
    validPoints.forEach(d => {
      // Additional geographic bounds check (redundant with clipping but helps performance)
      if (d.lat < clipBounds.minLat || d.lat > clipBounds.maxLat ||
          d.lon < clipBounds.minLon || d.lon > clipBounds.maxLon) {
        return; // Skip points outside bounds
      }
      
      // Calculate cell boundaries in geographic coordinates
      const lonMin = d.lon - halfCell;
      const lonMax = d.lon + halfCell;
      const latMin = d.lat - halfCell;
      const latMax = d.lat + halfCell;
      
      // Project all four corners to ensure accurate cell boundaries
      const corners = [
        projection([lonMin, latMin]), // bottom-left
        projection([lonMax, latMin]), // bottom-right
        projection([lonMax, latMax]), // top-right
        projection([lonMin, latMax])  // top-left
      ];
      
      // Only render if all corners are valid
      if (corners.every(c => c !== null)) {
        const xs = corners.map(c => c![0]);
        const ys = corners.map(c => c![1]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const width = Math.max(...xs) - x;
        const height = Math.max(...ys) - y;
        
        gridGroup.append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', width)
          .attr('height', height)
          .attr('fill', colorScale(d.sst))
          .attr('opacity', 0.95)
          .attr('stroke', 'none');
      }
    });
    
    // Add invisible point overlay for tooltips
    g.selectAll('circle.hover-target')
      .data(data.gridPoints.filter(p => p.sst >= 10 && p.sst <= 35))
      .enter()
      .append('circle')
      .attr('class', 'hover-target')
      .attr('cx', d => projection([d.lon, d.lat])?.[0] ?? 0)
      .attr('cy', d => projection([d.lon, d.lat])?.[1] ?? 0)
      .attr('r', 4)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')
      .on('mouseenter', function(event, d) {
        setTooltip({
          show: true,
          x: event.pageX + 10,
          y: event.pageY - 10,
          content: `Lat: ${d.lat.toFixed(2)}°, Lon: ${d.lon.toFixed(2)}°\nSST: ${d.sst.toFixed(1)}°C`
        });
      })
      .on('mouseleave', function() {
        setTooltip(prev => ({ ...prev, show: false }));
      });

    // Load and render real coastlines (Natural Earth via TopoJSON)
    // Use the EXACT SAME projection instance as the data
    fetch('/data/countries-110m.json')
      .then(res => res.json())
      .then((world) => {
        // Extract land features - returns FeatureCollection
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const land = topojson.feature(world as any, (world as any).objects.countries);
        
        // topojson.feature returns FeatureCollection which has .features array
        const features = (land as unknown as GeoJSON.FeatureCollection).features;
        
        // Filter coastlines to only those that intersect with our bounds
        // This improves performance and ensures alignment
        const filteredFeatures = features.filter(f => {
          if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
            // Check if feature might intersect our bounds
            // Simple bounding box check
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
              
              // Check if bounding box overlaps with our clip bounds
              return !(maxLon < clipBounds.minLon || minLon > clipBounds.maxLon ||
                       maxLat < clipBounds.minLat || minLat > clipBounds.maxLat);
            }
          }
          return false;
        });
        
        // Render coastlines using the SAME projection and clipping
        // Render AFTER grid cells so coastlines appear on top
        g.append('g')
          .attr('class', 'coastlines')
          .selectAll('path')
          .data(filteredFeatures)
          .enter()
          .append('path')
          .attr('d', d => {
            // Use the exact same pathGenerator with the same projection
            return pathGenerator(d as GeoJSON.Feature);
          })
          .attr('fill', 'none') // No land fill - just outlines
          .attr('stroke', '#333')
          .attr('stroke-width', 1.5)
          .attr('opacity', 0.9)
          .attr('pointer-events', 'none');
      })
      .catch(err => console.error('[Map] Error loading coastlines:', err));

    console.log('[Map] Rendering complete');
  }, [data, width, height]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading SST data...</p>
          <p className="text-sm text-gray-500 mt-2">Fetching ~45,000 grid points from NOAA</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div className="text-center text-red-600">
          <p className="font-semibold">Error loading SST data</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Map and Legend Container */}
      <div className="flex gap-4 items-start bg-white rounded-lg border border-gray-300 p-4 shadow-lg">
        <div className="relative flex gap-0 items-stretch">
          <svg
            ref={svgRef}
            width={width}
            height={height}
            className="bg-white"
            style={{ display: 'block' }}
          />
          
          {/* Vertical Legend on Right - flush against map border, perfectly aligned */}
          {data && mapBounds && (
            <div className="flex-shrink-0" style={{ height: `${height}px`, position: 'relative', overflow: 'visible' }}>
              <div style={{ position: 'absolute', top: `${mapBounds.top}px`, height: `${mapBounds.height}px`, overflow: 'visible' }}>
                <SSTColorLegend width={80} height={mapBounds.height} />
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Tooltip */}
      {tooltip.show && (
        <div
          className="absolute pointer-events-none bg-black/90 text-white px-3 py-2 rounded text-sm whitespace-pre-line z-50 shadow-lg border border-gray-600"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)'
          }}
        >
          {tooltip.content}
        </div>
      )}

      {/* Data info and refresh - with better contrast */}
      {data && (
        <div className="mt-4 flex items-center justify-between bg-white rounded-lg border border-gray-300 p-4 shadow-sm">
          <div className="text-sm text-gray-900">
            <p><strong className="text-gray-700">Data Date:</strong> {data.date}</p>
            <p><strong className="text-gray-700">Grid Points:</strong> {data.pointCount.toLocaleString()}</p>
            <p><strong className="text-gray-700">Source:</strong> {data.source}</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
          >
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      )}
    </div>
  );
}

