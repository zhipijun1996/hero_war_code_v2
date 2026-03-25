import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapConfig } from '../shared/types';
import { BUILTIN_MAPS } from '../shared/config/maps/mapIndex.ts';
interface MapSelectorProps {
  onSelect: (map: MapConfig) => void;
}

export default function MapSelector({ onSelect }: MapSelectorProps) {
  const [savedMaps, setSavedMaps] = useState<{name: string, config: MapConfig}[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const loadMaps = () => {
      const saved = localStorage.getItem('saved_maps');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setSavedMaps(parsed);
          }
        } catch (e) {
          console.error('Failed to parse saved maps', e);
        }
      }
    };

    loadMaps();
    // Listen for storage changes (if user saves in editor in another tab)
    window.addEventListener('storage', loadMaps);
    // Listen for custom event (if user saves in editor in the same tab)
    window.addEventListener('maps_updated', loadMaps);
    
    return () => {
      window.removeEventListener('storage', loadMaps);
      window.removeEventListener('maps_updated', loadMaps);
    };
  }, []);

  // Also refresh when opening
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('saved_maps');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setSavedMaps(parsed);
          }
        } catch (e) {
          console.error('Failed to parse saved maps', e);
        }
      }
    }
  }, [isOpen]);

  return (
    <div className="relative z-[5001]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 sm:px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] sm:text-xs rounded-md border border-zinc-700 transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap"
      >
        🗺️ <span className="hidden sm:inline">选择地图</span><span className="sm:hidden">地图</span>
        <span className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9998] bg-black/40 sm:bg-black/10" 
              onClick={() => setIsOpen(false)} 
            />
            
            {/* Dropdown Menu - Using fixed for both mobile and desktop to escape any clipping */}
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed top-1/2 sm:top-14 left-1/2 sm:left-32 -translate-x-1/2 sm:translate-x-0 sm:mt-1 w-[85vw] sm:w-56 bg-zinc-900 border border-zinc-800 rounded-xl sm:rounded-lg shadow-2xl z-[9999] py-1 overflow-hidden"
            >
              <div className="px-4 py-3 sm:py-2 border-b border-zinc-800 flex items-center justify-between sm:block">
                <span className="text-xs font-bold text-white">选择地图</span>
                <button onClick={() => setIsOpen(false)} className="sm:hidden text-zinc-500 p-1">✕</button>
              </div>

              {BUILTIN_MAPS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onSelect(m.config);
                    setIsOpen(false);
                  }}
                  className="..."
                >
                  <span className="text-lg sm:text-base">🗺️</span>
                  <div className="flex flex-col">
                    <span>{m.name}</span>
                    {m.description && (
                      <span className="text-[10px] text-zinc-500">{m.description}</span>
                    )}
                  </div>
                </button>
              ))}
              
              <div className="max-h-[50vh] sm:max-h-64 overflow-y-auto">
                {savedMaps.length === 0 ? (
                  <div className="px-4 py-8 sm:py-3 text-xs sm:text-[10px] text-zinc-500 italic text-center sm:text-left">
                    暂无保存地图，请在编辑器中保存。
                  </div>
                ) : (
                  savedMaps.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        onSelect(m.config);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-4 py-4 sm:py-2 text-sm sm:text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-3 border-b border-zinc-800/50 last:border-0"
                    >
                      <span className="text-lg sm:text-base">📂</span>
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
