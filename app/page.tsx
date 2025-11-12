import D3SSTMap from '@/components/d3-sst-map';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <main className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Maximum Potential Hurricane Intensity Maps
          </h1>
          <p className="text-lg text-gray-600 mb-1">
            Atlantic Basin Sea Surface Temperature
          </p>
          <p className="text-sm text-gray-500">
            Data from NOAA Physical Sciences Laboratory OISST v2.1 (0.25° resolution)
          </p>
        </header>

        {/* Map */}
        <div className="mb-6">
          <D3SSTMap width={1100} height={700} />
        </div>

        {/* Info */}
        <div className="bg-blue-100 border-2 border-blue-300 rounded-lg p-5 text-sm shadow-sm">
          <h3 className="font-bold text-blue-900 mb-3 text-base">About This Map</h3>
          <p className="text-blue-900 mb-3 font-medium">
            This map displays real-time sea surface temperature (SST) data for the Atlantic Basin,
            a critical factor in hurricane development and intensity.
          </p>
          <p className="text-blue-800 text-sm">
            <strong>Phase 1:</strong> SST Mapping ✓ &nbsp;|&nbsp; 
            <strong>Phase 2:</strong> MPI Calculation (Coming Soon) &nbsp;|&nbsp; 
            <strong>Phase 3:</strong> GRIB2 Integration (Planned)
          </p>
        </div>

        {/* Attribution */}
        <footer className="text-center mt-6 text-xs text-gray-500">
          Data: NOAA/OAR/ESRL PSL, Boulder, Colorado, USA &nbsp;|&nbsp; 
          <a href="https://psl.noaa.gov/" target="_blank" rel="noopener noreferrer" className="underline">
            psl.noaa.gov
          </a>
        </footer>
      </main>
    </div>
  );
}
