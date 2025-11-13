'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { geoMercator } from 'd3-geo';
import * as topojson from 'topojson-client';
import type { Basin, GeographicBounds } from '../types/geographic';

/**
 * DEFAULT PROJECTION: Mercator (geoMercator)
 * This is the standard projection for tropical weather mapping and hurricane visualization.
 * All geographic features (data, coastlines, graticules) use this projection.
 */

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

/**
 * Generic grid point interface
 */
export interface MapGridPoint {
  lat: number;
  lon: number;
  [key: string]: number | string; // Allow additional properties
}

/**
 * Map rendering configuration
 */
export interface MapRenderConfig<T extends MapGridPoint> {
  // Color scale configuration
  colorScale: () => d3.ScaleLinear<string, string> | d3.ScaleSequential<string, never>;
  legendDomain: [number, number]; // [min, max] for legend
  legendFormat: (value: number) => string; // Format function for legend labels
  legendTitle: string; // Title for legend (e.g., "Temperature (°C)", "Pressure (mb)")
  
  // Value extraction and tooltip
  getValue: (point: T) => number; // Extract the value to visualize
  formatTooltip: (point: T) => string; // Format tooltip content
  
  // Filtering
  isValidValue: (value: number) => boolean; // Filter function for values
}

/**
 * Props for the base map renderer
 */
export interface D3MapBaseProps<T extends MapGridPoint> {
  svgRef: React.RefObject<SVGSVGElement>;
  filteredData: {
    gridPoints: T[];
    bounds: GeographicBounds;
    pointCount: number;
  } | null;
  selectedBasin: Basin;
  width: number;
  height: number;
  config: MapRenderConfig<T>;
  projectionRef: React.MutableRefObject<d3.GeoProjection | null>;
  pathGeneratorRef: React.MutableRefObject<d3.GeoPath | null>;
  isRenderingRef: React.MutableRefObject<boolean>;
  setTooltip: (tooltip: { show: boolean; x: number; y: number; content: string }) => void;
}

/**
 * Base map renderer - extracts all common rendering logic from SST map
 * This ensures both SST and Pressure maps have identical layout, projection, labels, and legend
 */
export function renderD3MapBase<T extends MapGridPoint>({
  svgRef,
  filteredData,
  selectedBasin,
  width,
  height,
  config,
  projectionRef,
  pathGeneratorRef,
  isRenderingRef,
  setTooltip
}: D3MapBaseProps<T>): void {
  if (!filteredData || !svgRef.current) {
    console.log('[Map Base] Skipping render - no filtered data or SVG ref');
    return;
  }
  
  // Prevent concurrent renders
  if (isRenderingRef.current) {
    console.log('[Map Base] Render already in progress, skipping...');
    return;
  }
  
  isRenderingRef.current = true;
  console.log(`[Map Base] Starting render for ${selectedBasin.basin} with ${filteredData.pointCount} points...`);

  const svg = d3.select(svgRef.current);
  svg.selectAll('*').remove(); // Clear previous render

  // Define padding for graticule labels (responsive - scales with map size)
  // Bottom for longitude labels, left for latitude labels, right for legend
  const basePadding = Math.min(width, height) * 0.03; // 3% of smaller dimension
  const padding = {
    top: 0,    // No top labels
    bottom: Math.max(20, basePadding), // Space for bottom longitude labels (min 20px)
    left: Math.max(35, basePadding * 1.5),   // Space for left latitude labels (min 35px)
    right: 0    // No padding on right - legend will be positioned outside SVG
  };
  
  // Calculate available space for the map (excluding padding)
  const mapWidth = width - padding.left - padding.right;
  const mapHeight = height - padding.top - padding.bottom;

  // Get bounds for selected basin (from filtered data)
  const clipBounds = filteredData.bounds;
  const centerLon = (clipBounds.minLon + clipBounds.maxLon) / 2;
  const centerLat = (clipBounds.minLat + clipBounds.maxLat) / 2;
  
  // Calculate appropriate scale based on basin size
  const lonRange = clipBounds.maxLon - clipBounds.minLon;
  const latRange = clipBounds.maxLat - clipBounds.minLat;
  const aspectRatio = mapWidth / mapHeight;
  const basinAspectRatio = lonRange / latRange;
  
  // Scale to fit the basin, accounting for aspect ratio
  let scale = 700; // Default scale
  if (basinAspectRatio > aspectRatio) {
    // Basin is wider than container - scale by longitude
    scale = (mapWidth * 0.95) / (lonRange * Math.PI / 180);
  } else {
    // Basin is taller than container - scale by latitude
    scale = (mapHeight * 0.95) / (latRange * Math.PI / 180);
  }
  
  // Set up Mercator projection - standard for tropical weather mapping
  // This is the DEFAULT projection for this project
  // Translate to account for padding - center the projection in the actual map area
  // (not the full SVG, but the area excluding padding)
  const mapCenterX = padding.left + mapWidth / 2;
  const mapCenterY = padding.top + mapHeight / 2;
  
  const projection = geoMercator()
    .center([centerLon, centerLat])
    .scale(scale)
    .translate([mapCenterX, mapCenterY]);
  
  // Store projection in ref for consistent use across async operations (coastlines)
  projectionRef.current = projection;
  
  // Create path generator ONCE with the projection - use for BOTH data and coastlines
  const pathGenerator = d3.geoPath(projection);
  
  // Store pathGenerator in ref for consistent use
  pathGeneratorRef.current = pathGenerator;

  // Create color scale
  const colorScale = config.colorScale();
  
  // Create clipping path in SCREEN coordinates (not geographic)
  // Project the corner points to get screen bounds
  const clipPathId = 'map-clip-path';
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
  
  // Render color legend directly in the SVG (right side, aligned with map border)
  // This matches the exact positioning from the SST map
  const legendGroup = svg.append('g').attr('class', 'map-legend');
  const legendWidth = 90;
  const legendX = clipX + clipWidth + 5; // 5px gap from map border
  const legendY = clipY;
  const legendHeight = clipHeight;
  
  // Create gradient for legend
  const legendGradient = defs.append('linearGradient')
    .attr('id', 'legend-gradient')
    .attr('x1', '0%')
    .attr('x2', '0%')
    .attr('y1', '100%')
    .attr('y2', '0%');
  
  // Add gradient stops - use configurable domain
  const [minValue, maxValue] = config.legendDomain;
  const step = (maxValue - minValue) / 100;
  const stops = d3.range(minValue, maxValue + step, step);
  legendGradient.selectAll('stop')
    .data(stops)
    .enter()
    .append('stop')
    .attr('offset', d => `${((d - minValue) / (maxValue - minValue)) * 100}%`)
    .attr('stop-color', d => {
      const scale = config.colorScale();
      return scale(d);
    });
  
  // Draw gradient rectangle
  const gradientRectWidth = 30;
  legendGroup.append('rect')
    .attr('x', legendX + 10)
    .attr('y', legendY)
    .attr('width', gradientRectWidth)
    .attr('height', legendHeight)
    .style('fill', 'url(#legend-gradient)')
    .style('stroke', '#333')
    .style('stroke-width', 1);
  
  // Add vertical axis for value labels
  const yScale = d3.scaleLinear()
    .domain([minValue, maxValue])
    .range([legendY + legendHeight, legendY]);
  
  const yAxis = d3.axisRight(yScale)
    .ticks(11)
    .tickFormat(d => config.legendFormat(d as number));
  
  const axisGroup = legendGroup.append('g')
    .attr('transform', `translate(${legendX + 10 + gradientRectWidth}, 0)`)
    .call(yAxis)
    .style('font-size', '11px')
    .style('font-weight', '500')
    .style('fill', '#000000');
  
  // Remove the axis domain line
  axisGroup.select('.domain').remove();
  
  // Ensure tick labels are visible
  axisGroup.selectAll('text')
    .style('fill', '#000000')
    .style('overflow', 'visible');
  
  // Update SVG width and viewBox to accommodate legend
  const totalWidth = legendX + legendWidth;
  svg.attr('width', totalWidth)
     .attr('viewBox', `0 0 ${totalWidth} ${height}`);
  
  // Add graticule labels (outside the map border)
  // Create a separate group for labels that won't be clipped
  const labelGroup = svg.append('g').attr('class', 'graticule-labels');
  
  // Generate latitude labels (on left side only, outside border)
  // Right side labels removed - legend will be placed there
  const latLines = d3.range(Math.ceil(clipBounds.minLat / 5) * 5, clipBounds.maxLat + 5, 5);
  latLines.forEach(lat => {
    const [x, y] = projection([clipBounds.minLon, lat]) || [0, 0];
    
    // Left side label (outside border, within padding area)
    if (x >= padding.left && y >= 0 && y <= height - padding.bottom) {
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
  
  // Generate longitude labels (on bottom only, outside border)
  const lonLines = d3.range(Math.ceil(clipBounds.minLon / 5) * 5, clipBounds.maxLon + 5, 5);
  lonLines.forEach(lon => {
    const [x, y] = projection([lon, clipBounds.minLat]) || [0, 0];
    
    // Bottom label only (outside border, within padding area)
    if (x >= padding.left && x <= width - padding.right && y >= 0) {
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
  });

  // Render grid cells - use exact same projection as coastlines
  // Create a mask to exclude land areas (much faster than filtering each point)
  const maskId = `ocean-mask-${Math.random().toString(36).substring(7)}`;
  const mask = defs.append('mask').attr('id', maskId);
  
  // Mask: white = visible, black = hidden
  // Start with white covering the ENTIRE SVG (not just clip bounds)
  // This ensures all ocean points are visible, and only land areas are hidden
  mask.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'white');
  
  // We'll add black land areas to the mask after coastlines load
  // This allows us to render all ocean points and let the mask hide land ones
  
  const validPoints = filteredData.gridPoints;
  const halfCell = 0.25; // 0.5° resolution
  
  const gridGroup = g.append('g')
    .attr('class', 'data-grid')
    .attr('mask', `url(#${maskId})`) // Apply mask to hide land areas
    .style('pointer-events', 'all'); // Ensure pointer events work through mask
  
  validPoints.forEach(d => {
    // Calculate cell boundaries in geographic coordinates
    // Add small overlap (0.01°) to eliminate gaps between pixels
    const overlap = 0.01;
    const lonMin = d.lon - halfCell - overlap;
    const lonMax = d.lon + halfCell + overlap;
    const latMin = d.lat - halfCell - overlap;
    const latMax = d.lat + halfCell + overlap;
    
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
      const cellWidth = Math.max(...xs) - x;
      const cellHeight = Math.max(...ys) - y;
      
      const value = config.getValue(d);
      
      // Skip rendering if value is invalid
      if (!config.isValidValue(value)) {
        return; // Skip this point
      }
      
      const rect = gridGroup.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', cellWidth)
        .attr('height', cellHeight)
        .attr('fill', colorScale(value))
        .attr('opacity', 0.95)
        .attr('stroke', 'none')
        .attr('class', 'hover-target')
        .style('pointer-events', 'all') // Ensure pointer events work even with mask
        .on('mouseenter', function(event) {
          // Log diagnostic info
          console.log(`[Map Base] Hover: ${config.formatTooltip(d).replace(/\n/g, ' | ')}`);
          
          // Use clientX/clientY (viewport-relative) instead of pageX/pageY (page-relative)
          // This prevents tooltip from appearing far away when page is scrolled
          const svgRect = svgRef.current?.getBoundingClientRect();
          if (svgRect) {
            setTooltip({
              show: true,
              x: event.clientX - svgRect.left,
              y: event.clientY - svgRect.top,
              content: config.formatTooltip(d)
            });
          }
        })
        .on('mouseleave', function() {
          setTooltip((prev: { show: boolean; x: number; y: number; content: string }) => ({ ...prev, show: false }));
        });
    }
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
      // IMPORTANT: At high latitudes (like Newfoundland ~47°N), Mercator distortion is significant
      // We use a slightly expanded bounding box to ensure we don't miss features near edges
      const expandedBounds = {
        minLon: clipBounds.minLon - 2, // Expand by 2 degrees
        maxLon: clipBounds.maxLon + 2,
        minLat: clipBounds.minLat - 2,
        maxLat: clipBounds.maxLat + 2
      };
      
      const filteredFeatures = features.filter(f => {
        if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
          // Check if feature might intersect our bounds
          // Simple bounding box check
          const coords = f.geometry.type === 'Polygon' 
            ? f.geometry.coordinates[0] 
            : f.geometry.coordinates.flat()[0];
          
          if (coords && coords.length > 0) {
            // GeoJSON/TopoJSON coordinates are [longitude, latitude]
            const lons = coords.map((c: number[]) => c[0]);
            const lats = coords.map((c: number[]) => c[1]);
            const minLon = Math.min(...lons);
            const maxLon = Math.max(...lons);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            
            // Check if bounding box overlaps with our expanded clip bounds
            // This ensures we capture features that might be slightly outside due to projection distortion
            return !(maxLon < expandedBounds.minLon || minLon > expandedBounds.maxLon ||
                     maxLat < expandedBounds.minLat || minLat > expandedBounds.maxLat);
          }
        }
        return false;
      });
      
      console.log(`[Map Base] Filtered ${filteredFeatures.length} coastline features from ${features.length} total (bounds: ${clipBounds.minLat}°N-${clipBounds.maxLat}°N, ${clipBounds.minLon}°-${clipBounds.maxLon}°)`);
      
      // Render coastlines using the SAME projection and clipping
      // Use the projection from ref to ensure it matches the data projection
      // Render AFTER grid cells so coastlines appear on top
      const currentPathGenerator = pathGeneratorRef.current;
      const currentProjection = projectionRef.current;
      
      if (!currentPathGenerator || !currentProjection) {
        console.error('[Map Base] Projection or pathGenerator not available for coastlines');
        return;
      }
      
      // Render coastlines (outlines)
      g.append('g')
        .attr('class', 'coastlines')
        .selectAll('path')
        .data(filteredFeatures)
        .enter()
        .append('path')
        .attr('d', d => {
          // Use the exact same pathGenerator from ref (uses same projection as data)
          return currentPathGenerator(d as GeoJSON.Feature);
        })
        .attr('fill', 'none') // No land fill - just outlines
        .attr('stroke', '#333')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.9)
        .attr('pointer-events', 'none');
      
      // Add land areas to mask (black = hidden)
      // This masks out data points over land
      mask.selectAll('path.land-mask')
        .data(filteredFeatures)
        .enter()
        .append('path')
        .attr('class', 'land-mask')
        .attr('d', d => {
          return currentPathGenerator(d as GeoJSON.Feature);
        })
        .attr('fill', 'black') // Black = hidden in mask
        .attr('fill-opacity', 1)
        .attr('pointer-events', 'none');
    })
    .catch(err => console.error('[Map Base] Error loading coastlines:', err));

  console.log('[Map Base] Rendering complete');
  isRenderingRef.current = false;
}

