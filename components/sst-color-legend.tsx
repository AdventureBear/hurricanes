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

    // Draw gradient rectangle
    const margin = { top: 40, right: 10, bottom: 40, left: 10 };
    const gradientWidth = 30;
    const gradientHeight = height - margin.top - margin.bottom;

    svg.append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', gradientWidth)
      .attr('height', gradientHeight)
      .style('fill', 'url(#sst-gradient-vertical)')
      .style('stroke', '#333')
      .style('stroke-width', 1);

    // Add vertical axis
    const yScale = d3.scaleLinear()
      .domain([10, 32])
      .range([margin.top + gradientHeight, margin.top]);

    const yAxis = d3.axisRight(yScale)
      .ticks(11)
      .tickFormat(d => `${d}°C`);

    svg.append('g')
      .attr('transform', `translate(${margin.left + gradientWidth}, 0)`)
      .call(yAxis)
      .style('font-size', '11px')
      .style('font-weight', '500');

    // Add title at top
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .text('SST (°C)');

  }, [width, height]);

  return (
    <div className="flex flex-col items-center bg-white/90 backdrop-blur rounded-lg border border-gray-300 p-2 shadow-sm">
      <svg ref={svgRef} width={width} height={height} />
    </div>
  );
}

// Export the color scale creator for use in the map component
export { createOceanographicScale };

