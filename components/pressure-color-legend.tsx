'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface PressureColorLegendProps {
  width?: number;
  height?: number;
}

/**
 * Creates a color scale for pressure visualization
 * Lower pressure (stronger storms) = warmer colors (red/purple)
 * Higher pressure (weaker/no storms) = cooler colors (blue/green)
 * 
 * Domain: 880-1020 mb (includes normal surface pressure ~1013 mb)
 */
const createPressureScale = () => {
  return d3.scaleSequential<string>()
    .domain([880, 1020])  // Low pressure = stronger storm
    .interpolator((t: number) => d3.interpolateSpectral(1 - t));
  // interpolateSpectral: red → orange → yellow → green → cyan → blue → indigo → violet
  // Reversed (1-t): violet → indigo → blue → cyan → green → yellow → orange → red
  // So: 880mb (low, strong) = red/purple, 1000mb (high, weak) = blue/green
};

export default function PressureColorLegend({ width = 80, height = 400 }: PressureColorLegendProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Pressure color scale
    const colorScale = createPressureScale();

    // Create vertical gradient
    const defs = svg.append('defs');
    const linearGradient = defs.append('linearGradient')
      .attr('id', 'pressure-gradient-vertical')
      .attr('x1', '0%')
      .attr('y1', '100%')
      .attr('x2', '0%')
      .attr('y2', '0%');

    // Add gradient stops (low pressure at bottom, high pressure at top)
    const stops = d3.range(880, 1020.5, 1);
    linearGradient.selectAll('stop')
      .data(stops)
      .enter()
      .append('stop')
      .attr('offset', d => `${((d - 880) / (1020 - 880)) * 100}%`)
      .attr('stop-color', d => colorScale(d));

    // Draw gradient rectangle
    const margin = { top: 0, right: 25, bottom: 0, left: 10 };
    const gradientWidth = 30;
    const gradientHeight = height;

    svg.append('rect')
      .attr('x', margin.left)
      .attr('y', 0)
      .attr('width', gradientWidth)
      .attr('height', gradientHeight)
      .style('fill', 'url(#pressure-gradient-vertical)')
      .style('stroke', '#333')
      .style('stroke-width', 1);

    // Add vertical axis
    const yScale = d3.scaleLinear()
      .domain([880, 1020])
      .range([height, 0]); // Low pressure at bottom, high at top

    const yAxis = d3.axisRight(yScale)
      .ticks(13)
      .tickFormat(d => `${d} mb`);

    const axisGroup = svg.append('g')
      .attr('transform', `translate(${margin.left + gradientWidth}, 0)`)
      .call(yAxis)
      .style('font-size', '11px')
      .style('font-weight', '500')
      .style('fill', '#000000');
    
    // Remove the axis line
    axisGroup.select('.domain').remove();
    
    // Ensure tick labels are black and not clipped
    axisGroup.selectAll('text')
      .style('fill', '#000000')
      .style('overflow', 'visible');

    // Add label
    svg.append('text')
      .attr('x', margin.left + gradientWidth / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('fill', '#000000')
      .text('Pressure (mb)');

  }, [width, height]);

  return (
    <div className="flex flex-col items-stretch" style={{ height: `${height}px`, overflow: 'visible' }}>
      <svg ref={svgRef} width={width} height={height} className="bg-white" style={{ display: 'block', overflow: 'visible' }} />
    </div>
  );
}

// Export the color scale creator for use in the map component
export { createPressureScale };

