'use client';

import { useState } from 'react';
import D3SSTMap from '@/components/d3-sst-map';

export default function Home() {
  const [dataDate, setDataDate] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 py-4 px-4">
      <main className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="text-center mb-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            Maximum Potential Hurricane Intensity Maps
          </h1>
          <p className="text-base text-gray-600 mb-1">
            Atlantic Basin Sea Surface Temperature
          </p>
          <p className="text-xs text-gray-500">
            Data from NOAA Physical Sciences Laboratory OISST v2.1 (0.25° resolution)
          </p>
        </header>

        {/* Map and Sidebar Layout */}
        <div className="flex gap-4 mb-3">
          {/* Map Column - 70% width */}
          <div className="w-[70%]">
            <D3SSTMap onDataDateChange={setDataDate} />
          </div>
          
          {/* Right Column - 30% width (blank for now) */}
          <div className="w-[30%] bg-white rounded-lg border border-gray-300 p-4 shadow-lg">
            {/* Reserved for future content */}
          </div>
        </div>

        {/* Info - Minimal */}
        <div className="bg-blue-100 border-2 border-blue-300 rounded-lg p-2 text-xs shadow-sm">
          <p className="text-blue-800">
            <strong>Data Date:</strong> {dataDate || 'Loading...'} &nbsp;|&nbsp; 
            Map created by Suzanne Atkinson, Meteorology student, Penn State University. For comments, email <a href="mailto:sma101@psu.edu" className="underline">sma101@psu.edu</a>
          </p>
        </div>
      </main>
    </div>
  );
}
