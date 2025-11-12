'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { geoMercator } from 'd3-geo';
import { contours } from 'd3-contour';
import * as topojson from 'topojson-client';
import type { SSTDataResponse } from '../types/sst';
import SSTColorLegend, { createOceanographicScale } from './sst-color-legend';

interface D3SSTMapProps {
  width?: number;
  height?: number;
}

type VisualizationMode = 'gridded' | 'contour';

export default function D3SSTMap({ width = 1200, height = 700 }: D3SSTMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<SSTDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>('gridded');
  const [showContourLines, setShowContourLines] = useState(true);
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

    console.log(`[Map] Rendering ${data.gridPoints.length} points as ${visualizationMode}...`);
    
    // Filter valid data
    const validPoints = data.gridPoints.filter(p => p.sst >= 10 && p.sst <= 35);
    
    if (visualizationMode === 'gridded') {
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
          
          gridGroup.append('rect')
            .attr('x', x)
            .attr('y', y)
            .attr('width', cellWidth)
            .attr('height', cellHeight)
            .attr('fill', colorScale(d.sst))
            .attr('opacity', 0.95)
            .attr('stroke', 'none');
        }
      });
    } else {
      // Contour mode
      // Build a 2D grid for contour generation
      // Create sorted arrays of unique lat/lon values
      const uniqueLats = Array.from(new Set(validPoints.map(p => p.lat))).sort((a, b) => a - b);
      const uniqueLons = Array.from(new Set(validPoints.map(p => p.lon))).sort((a, b) => a - b);
      
      // Create a Map for fast lookup: "lat,lon" -> sst
      const sstMap = new Map<string, number>();
      validPoints.forEach(p => {
        sstMap.set(`${p.lat},${p.lon}`, p.sst);
      });
      
      // Build flat array for d3-contour
      // d3-contour expects: values[i + j*n] where i is column (lon), j is row (lat)
      // n = gridWidth, so values[i + j*gridWidth] = value at position (i, j)
      const gridWidth = uniqueLons.length;
      const gridHeight = uniqueLats.length;
      const values: number[] = new Array(gridWidth * gridHeight);
      
      let minSST = Infinity;
      let maxSST = -Infinity;
      
      // Fill flat array: values[i + j*gridWidth] = SST at (lon[i], lat[j])
      for (let j = 0; j < gridHeight; j++) {
        for (let i = 0; i < gridWidth; i++) {
          const sst = sstMap.get(`${uniqueLats[j]},${uniqueLons[i]}`);
          const index = i + j * gridWidth;
          if (sst !== undefined && !isNaN(sst)) {
            values[index] = sst;
            minSST = Math.min(minSST, sst);
            maxSST = Math.max(maxSST, sst);
          } else {
            values[index] = NaN;
          }
        }
      }
      
      console.log(`[Map] Grid size: ${gridWidth}x${gridHeight}, SST range: ${minSST.toFixed(1)}°C to ${maxSST.toFixed(1)}°C`);
      console.log(`[Map] Flat array length: ${values.length}, expected: ${gridWidth * gridHeight}`);
      
      // Create contour generator
      // Generate contours every 0.5°C from 10°C to 32°C
      const contourThresholds = d3.range(10, 32.5, 0.5);
      const contourGenerator = contours()
        .size([gridWidth, gridHeight])
        .thresholds(contourThresholds);
      
      // Generate contours - pass flat array directly
      // d3-contour expects: values[i + j*n] where (i, j) is position (column, row)
      const contourData = contourGenerator(values) as Array<{
        type: string;
        value: number;
        coordinates: number[][][] | number[][][][];
      }>;
      
      console.log(`[Map] Generated ${contourData.length} contours`);
      
      if (contourData.length > 0) {
        const firstContour = contourData[0];
        console.log(`[Map] First contour sample:`, {
          value: firstContour.value,
          type: firstContour.type,
          hasCoordinates: 'coordinates' in firstContour,
          coordinatesType: Array.isArray(firstContour.coordinates) ? 'array' : typeof firstContour.coordinates,
          coordinatesLength: Array.isArray(firstContour.coordinates) ? firstContour.coordinates.length : 'N/A',
          firstCoordSample: Array.isArray(firstContour.coordinates) && firstContour.coordinates.length > 0 
            ? firstContour.coordinates[0] 
            : 'N/A',
          fullStructure: JSON.stringify(firstContour, null, 2).substring(0, 500)
        });
      }
      
      // Create scale functions to convert grid indices to geographic coordinates
      const lonScale = d3.scaleLinear()
        .domain([0, gridWidth - 1])
        .range([uniqueLons[0], uniqueLons[gridWidth - 1]]);
      
      const latScale = d3.scaleLinear()
        .domain([0, gridHeight - 1])
        .range([uniqueLats[0], uniqueLats[gridHeight - 1]]);
      
      console.log(`[Map] Coordinate scales: lon [${uniqueLons[0]}, ${uniqueLons[gridWidth - 1]}], lat [${uniqueLats[0]}, ${uniqueLats[gridHeight - 1]}]`);
      
      // Render contours as filled polygons
      const contourGroup = g.append('g').attr('class', 'sst-contours');
      
      let renderedCount = 0;
      let skippedCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contourData.forEach((contour: any) => {
        // d3-contour returns GeoJSON-like structures
        // The coordinates property should be an array of rings (for Polygon) or polygons (for MultiPolygon)
        const coords = contour.coordinates;
        
        // Check if coordinates exist and have data
        if (!coords) {
          skippedCount++;
          return;
        }
        
        // For Polygon: coordinates is array of rings, each ring is array of [x,y] pairs
        // For MultiPolygon: coordinates is array of polygons, each polygon is array of rings
        const hasData = Array.isArray(coords) && coords.length > 0;
        if (!hasData) {
          skippedCount++;
          return;
        }
        
        // Transform contour coordinates from grid space to geographic space
        const transformCoordinates = (coords: number[][]): number[][] => {
          return coords.map(([x, y]) => {
            const lon = lonScale(x);
            const lat = latScale(y);
            return [lon, lat];
          });
        };
        
        let geoContour: GeoJSON.Polygon | GeoJSON.MultiPolygon;
        
        // Check contour type - d3-contour returns "Polygon" or "MultiPolygon"
        const isMultiPolygon = contour.type === 'MultiPolygon';
        
        try {
          if (isMultiPolygon) {
            // MultiPolygon: coordinates is an array of polygons, each polygon is an array of rings
            const polygons = coords as number[][][][];
            if (polygons.length === 0 || polygons[0].length === 0) {
              skippedCount++;
              return;
            }
            geoContour = {
              type: 'MultiPolygon',
              coordinates: polygons.map(polygon =>
                polygon.map(ring => transformCoordinates(ring as number[][]))
              )
            };
          } else {
            // Polygon: coordinates is an array of rings, each ring is an array of [x,y] pairs
            const rings = coords as number[][][];
            if (rings.length === 0 || rings[0].length === 0) {
              skippedCount++;
              return;
            }
            geoContour = {
              type: 'Polygon',
              coordinates: rings.map(ring => 
                transformCoordinates(ring as number[][])
              )
            };
          }
          
          // Get the contour value
          const contourValue = contour.value;
          
          // Render the contour as a path with optional stroke
          const path = contourGroup.append('path')
            .datum(geoContour)
            .attr('d', pathGenerator)
            .attr('fill', colorScale(contourValue))
            .attr('opacity', 0.9)
            .attr('stroke', showContourLines ? '#000000' : 'none')
            .attr('stroke-width', showContourLines ? 1 : 0)
            .attr('stroke-opacity', showContourLines ? 0.6 : 0);
          
          // Check if path was actually rendered (not clipped out)
          const pathNode = path.node();
          const pathData = pathNode?.getAttribute('d');
          if (pathData && pathData !== '' && pathData !== 'M0,0' && pathNode) {
            renderedCount++;
            
            // Add label to contour (only if contour lines are enabled)
            if (showContourLines) {
              // Find a good position along the path (at 50% of path length)
              try {
                const pathLength = pathNode.getTotalLength();
                if (pathLength > 20) { // Only label if path is long enough
                  const labelPosition = pathNode.getPointAtLength(pathLength * 0.5);
                  const labelPosition2 = pathNode.getPointAtLength(pathLength * 0.5 + 1);
                  
                  // Calculate angle for text rotation to follow path
                  const angle = Math.atan2(
                    labelPosition2.y - labelPosition.y,
                    labelPosition2.x - labelPosition.x
                  ) * 180 / Math.PI;
                  
                  // Add text label
                  contourGroup.append('text')
                    .attr('x', labelPosition.x)
                    .attr('y', labelPosition.y)
                    .attr('text-anchor', 'middle')
                    .attr('alignment-baseline', 'middle')
                    .attr('transform', `rotate(${angle}, ${labelPosition.x}, ${labelPosition.y})`)
                    .style('font-size', '11px')
                    .style('font-weight', '600')
                    .style('fill', '#000000')
                    .style('stroke', '#ffffff')
                    .style('stroke-width', '3px')
                    .style('stroke-opacity', '0.8')
                    .style('paint-order', 'stroke')
                    .text(`${contourValue.toFixed(1)}°C`);
                }
              } catch (labelError) {
                // If label positioning fails, just skip it
                console.warn('[Map] Could not add label to contour:', labelError);
              }
            }
            
            if (renderedCount === 1) {
              console.log(`[Map] First rendered contour: value=${contourValue}°C, path length=${pathData.length}`);
            }
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error('[Map] Error rendering contour:', error, {
            value: contour.value,
            type: contour.type,
            coordinatesLength: Array.isArray(coords) ? coords.length : 'N/A',
            firstCoord: Array.isArray(coords) && coords.length > 0 ? coords[0] : 'N/A'
          });
          skippedCount++;
        }
      });
      
      console.log(`[Map] Rendered ${renderedCount} visible contours, skipped ${skippedCount} empty contours out of ${contourData.length} total`);
    }
    
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
  }, [data, width, height, visualizationMode, showContourLines]);

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
      {/* Visualization Controls */}
      {data && (
        <div className="mb-4 flex items-center gap-6 bg-white rounded-lg border border-gray-300 p-3 shadow-sm">
          {/* Visualization Mode Switch */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Visualization:</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={visualizationMode === 'contour'}
                onChange={(e) => setVisualizationMode(e.target.checked ? 'contour' : 'gridded')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              <span className="ml-3 text-sm font-medium text-gray-700">
                {visualizationMode === 'gridded' ? 'Gridded' : 'Contour'}
              </span>
            </label>
          </div>
          
          {/* Contour Lines Toggle (only show in contour mode) */}
          {visualizationMode === 'contour' && (
            <div className="flex items-center gap-3 border-l border-gray-300 pl-6">
              <span className="text-sm font-medium text-gray-700">Contour Lines:</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={showContourLines}
                  onChange={(e) => setShowContourLines(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-3 text-sm font-medium text-gray-700">
                  {showContourLines ? 'On' : 'Off'}
                </span>
              </label>
            </div>
          )}
        </div>
      )}
      
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

