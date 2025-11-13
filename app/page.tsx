'use client';

import { useState } from 'react';
import D3SSTMap from '@/components/d3-sst-map';
import D3PressureMap from '@/components/d3-pressure-map';

export default function Home() {
  const [dataDate, setDataDate] = useState<string | null>(null);
  const [pressureDataDate, setPressureDataDate] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 py-4 px-4">
      <main className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="text-center mb-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            Maximum Potential Hurricane Intensity Maps
          </h1>
          <p className="text-base text-gray-600 mb-1">
            Atlantic Basin Sea Surface Temperature & Minimum Central Pressure
          </p>
          <p className="text-xs text-gray-500">
            Data from NOAA NOMADS NSST (Near-surface Sea Surface Temperature, 0.5° resolution)
          </p>
        </header>

        {/* SST Map */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Sea Surface Temperature</h2>
          <div className="flex gap-4">
            <div className="flex-1">
              <D3SSTMap onDataDateChange={setDataDate} />
            </div>
          </div>
        </div>

        {/* Pressure Map */}
        <div className="mb-3">
          <h2 className="text-xl font-semibold mb-2">Minimum Central Pressure</h2>
          <div className="flex gap-4">
            <div className="flex-1">
              <D3PressureMap onDataDateChange={setPressureDataDate} />
            </div>
          </div>
        </div>

        {/* Info - Minimal */}
        <div className="bg-blue-100 border-2 border-blue-300 rounded-lg p-2 text-xs shadow-sm">
          <p className="text-blue-800">
            <strong>SST Date:</strong> {dataDate || 'Loading...'} &nbsp;|&nbsp;
            <strong>Pressure Date:</strong> {pressureDataDate || 'Loading...'} &nbsp;|&nbsp; 
            Map created by Suzanne Atkinson, Meteorology student, Penn State University. For comments, email <a href="mailto:sma101@psu.edu" className="underline">sma101@psu.edu</a>
          </p>
        </div>
      </main>
    </div>
  );
}
