import React from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface ZoomControlsProps {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({ zoomIn, zoomOut, resetZoom }) => {
  return (
    <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-auto">
      <button onClick={zoomIn} className="w-10 h-10 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm border border-zinc-700 transition-colors">
        <ZoomIn size={20} />
      </button>
      <button onClick={resetZoom} className="w-10 h-10 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm border border-zinc-700 transition-colors" title="Reset View">
        <Maximize size={18} />
      </button>
      <button onClick={zoomOut} className="w-10 h-10 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm border border-zinc-700 transition-colors">
        <ZoomOut size={20} />
      </button>
    </div>
  );
};

export default ZoomControls;
