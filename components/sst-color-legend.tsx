'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface SSTColorLegendProps {
  width?: number;
  height?: number;
}

// Custom oceanographic color scale: blue → cyan → green → yellow → orange → red
const createOceanographicScale = () => {
  return d3.scaleLinear<string>()
    .domain([10, 15, 20, 24, 27, 30, 32])
    .range(['#2c7bb6', '#00cccc', '#00ff00', '#ffff00', '#ff9900', '#ff0000', '#800000'])
    .interpolate(d3.interpolateRgb);
};

export default function SSTColorLegend({ width = 80, height = 400 }: SSTColorLegendProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Oceanographic color scale
    const colorScale = createOceanographicScale();

    // Create vertical gradient
    const defs = svg.append('defs');
    const linearGradient = defs.append('linearGradient')
      .attr('id', 'sst-gradient-vertical')
      .attr('x1', '0%')
      .attr('y1', '100%')
      .attr('x2', '0%')
      .attr('y2', '0%');

    // Add gradient stops (reversed for vertical orientation - cold at bottom, warm at top)
    const stops = d3.range(10, 32.5, 0.5);
    linearGradient.selectAll('stop')
      .data(stops)
      .enter()
      .append('stop')
      .attr('offset', d => `${((d - 10) / 22) * 100}%`)
      .attr('stop-color', d => colorScale(d));

    // Draw gradient rectangle - no margins, full height
    const margin = { top: 0, right: 25, bottom: 0, left: 10 }; // More right margin for labels to prevent clipping
    const gradientWidth = 30;
    const gradientHeight = height; // Full height, no margins

    svg.append('rect')
      .attr('x', margin.left)
      .attr('y', 0)
      .attr('width', gradientWidth)
      .attr('height', gradientHeight)
      .style('fill', 'url(#sst-gradient-vertical)')
      .style('stroke', '#333')
      .style('stroke-width', 1);

    // Add vertical axis
    const yScale = d3.scaleLinear()
      .domain([10, 32])
      .range([height, 0]); // Full height range

    const yAxis = d3.axisRight(yScale)
      .ticks(11)
      .tickFormat(d => `${d}°C`);

    const axisGroup = svg.append('g')
      .attr('transform', `translate(${margin.left + gradientWidth}, 0)`)
      .call(yAxis)
      .style('font-size', '11px')
      .style('font-weight', '500')
      .style('fill', '#000000'); // Black text for better contrast
    
    // Remove the axis line (the thick black border on the right)
    axisGroup.select('.domain').remove();
    
    // Ensure tick labels are black and not clipped
    axisGroup.selectAll('text')
      .style('fill', '#000000')
      .style('overflow', 'visible');

  }, [width, height]);

  return (
    <div className="flex flex-col items-stretch" style={{ height: `${height}px`, overflow: 'visible' }}>
      <svg ref={svgRef} width={width} height={height} className="bg-white" style={{ display: 'block', overflow: 'visible' }} />
    </div>
  );
}

// Export the color scale creator for use in the map component
export { createOceanographicScale };

