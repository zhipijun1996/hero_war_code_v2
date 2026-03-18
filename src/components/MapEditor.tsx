import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, RegularPolygon, Text, Group, Line } from 'react-konva';
import { MapConfig, HexCoord } from '../shared/types';
import { DEFAULT_MAP } from '../shared/config/mapConstants';
import { HEX_SIZE, hexToPixel, pixelToHex } from '../shared/utils/hexUtils';

type Tool = 'crystal' | 'castle_0' | 'castle_1' | 'chest_t1' | 'chest_t2' | 'monster_1' | 'monster_2' | 'monster_3' | 'magic_circle' | 'trap' | 'turret' | 'watchtower' | 'obstacle' | 'water' | 'bush' | 'eraser';

interface MapEditorProps {
  onClose: () => void;
  onSave: (map: MapConfig) => void;
}

export default function MapEditor({ onClose, onSave }: MapEditorProps) {
  const [mapConfig, setMapConfig] = useState<MapConfig>(JSON.parse(JSON.stringify(DEFAULT_MAP)));
  const [selectedTool, setSelectedTool] = useState<Tool>('obstacle');
  const [savedMaps, setSavedMaps] = useState<{name: string, config: MapConfig}[]>([]);
  const [mapName, setMapName] = useState('Custom Map');
  
  const [stageScale, setStageScale] = useState(0.8);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const handleResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      setStageSize({
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight
      });
      // Center the map initially
      setStagePos({
        x: containerRef.current.offsetWidth / 2,
        y: containerRef.current.offsetHeight / 2
      });
    }
  }, [size]);

  useEffect(() => {
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
  }, []);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const saveMapToLocal = () => {
    const newMap = { ...mapConfig, name: mapName };
    const newSavedMaps = [...savedMaps.filter(m => m.name !== mapName), { name: mapName, config: newMap }];
    setSavedMaps(newSavedMaps);
    localStorage.setItem('saved_maps', JSON.stringify(newSavedMaps));
    
    // Dispatch custom event to notify other components (like MapSelector)
    window.dispatchEvent(new Event('maps_updated'));
  };

  const loadMap = (config: MapConfig) => {
    setMapConfig(JSON.parse(JSON.stringify(config)));
    setMapName(config.name);
  };

  const handleHexClick = (q: number, r: number) => {
    if (Math.abs(q) > 4 || Math.abs(r) > 4 || Math.abs(q + r) > 4) return;

    const newConfig = { ...mapConfig };
    
    // Remove existing items at this hex
    if (newConfig.crystal.q === q && newConfig.crystal.r === r) newConfig.crystal = { q: 99, r: 99 }; // Move off-screen
    newConfig.castles[0] = newConfig.castles[0].filter(c => c.q !== q || c.r !== r);
    newConfig.castles[1] = newConfig.castles[1].filter(c => c.q !== q || c.r !== r);
    newConfig.chests = newConfig.chests.filter(c => c.q !== q || c.r !== r);
    newConfig.monsters = newConfig.monsters.filter(m => m.q !== q || m.r !== r);
    newConfig.magicCircles = newConfig.magicCircles.filter(m => m.q !== q || m.r !== r);
    newConfig.traps = (newConfig.traps || []).filter(t => t.q !== q || t.r !== r);
    newConfig.turrets = (newConfig.turrets || []).filter(t => t.q !== q || t.r !== r);
    newConfig.watchtowers = (newConfig.watchtowers || []).filter(t => t.q !== q || t.r !== r);
    newConfig.obstacles = (newConfig.obstacles || []).filter(o => o.q !== q || o.r !== r);
    newConfig.water = (newConfig.water || []).filter(w => w.q !== q || w.r !== r);
    newConfig.bushes = (newConfig.bushes || []).filter(b => b.q !== q || b.r !== r);

    // Add new item
    if (selectedTool === 'crystal') newConfig.crystal = { q, r };
    else if (selectedTool === 'castle_0') newConfig.castles[0].push({ q, r });
    else if (selectedTool === 'castle_1') newConfig.castles[1].push({ q, r });
    else if (selectedTool === 'chest_t1') newConfig.chests.push({ q, r, type: 'T1' });
    else if (selectedTool === 'chest_t2') newConfig.chests.push({ q, r, type: 'T2' });
    else if (selectedTool === 'monster_1') newConfig.monsters.push({ q, r, level: 1 });
    else if (selectedTool === 'monster_2') newConfig.monsters.push({ q, r, level: 2 });
    else if (selectedTool === 'monster_3') newConfig.monsters.push({ q, r, level: 3 });
    else if (selectedTool === 'magic_circle') newConfig.magicCircles.push({ q, r });
    else if (selectedTool === 'trap') { newConfig.traps = newConfig.traps || []; newConfig.traps.push({ q, r }); }
    else if (selectedTool === 'turret') { newConfig.turrets = newConfig.turrets || []; newConfig.turrets.push({ q, r }); }
    else if (selectedTool === 'watchtower') { newConfig.watchtowers = newConfig.watchtowers || []; newConfig.watchtowers.push({ q, r }); }
    else if (selectedTool === 'obstacle') { newConfig.obstacles = newConfig.obstacles || []; newConfig.obstacles.push({ q, r }); }
    else if (selectedTool === 'water') { newConfig.water = newConfig.water || []; newConfig.water.push({ q, r }); }
    else if (selectedTool === 'bush') { newConfig.bushes = newConfig.bushes || []; newConfig.bushes.push({ q, r }); }

    setMapConfig(newConfig);
  };

  const renderHexes = () => {
    const hexes = [];
    for (let q = -4; q <= 4; q++) {
      for (let r = -4; r <= 4; r++) {
        if (Math.abs(q + r) <= 4) {
          const { x, y } = hexToPixel(q, r);
          
          let fill = "#27272a"; // Default empty
          let icon = "";
          
          if (mapConfig.crystal.q === q && mapConfig.crystal.r === r) { fill = "#a78bfa"; icon = "💎"; }
          else if (mapConfig.castles[0].some(c => c.q === q && c.r === r)) { fill = "#60a5fa"; icon = "🏰"; }
          else if (mapConfig.castles[1].some(c => c.q === q && c.r === r)) { fill = "#f87171"; icon = "🏰"; }
          else if (mapConfig.chests.some(c => c.q === q && c.r === r && c.type === 'T1')) { fill = "#fef08a"; icon = "📦"; }
          else if (mapConfig.chests.some(c => c.q === q && c.r === r && c.type === 'T2')) { fill = "#fde047"; icon = "🎁"; }
          else if (mapConfig.monsters.some(m => m.q === q && m.r === r && m.level === 1)) { fill = "#fbcfe8"; icon = "👾"; }
          else if (mapConfig.monsters.some(m => m.q === q && m.r === r && m.level === 2)) { fill = "#f87171"; icon = "💀"; }
          else if (mapConfig.monsters.some(m => m.q === q && m.r === r && m.level === 3)) { fill = "#fca5a5"; icon = "🐉"; }
          else if (mapConfig.magicCircles.some(m => m.q === q && m.r === r)) { fill = "#c084fc"; icon = "✨"; }
          else if (mapConfig.traps?.some(t => t.q === q && t.r === r)) { fill = "#ef4444"; icon = "🕸️"; }
          else if (mapConfig.turrets?.some(t => t.q === q && t.r === r)) { fill = "#f97316"; icon = "🗼"; }
          else if (mapConfig.watchtowers?.some(t => t.q === q && t.r === r)) { fill = "#eab308"; icon = "👁️"; }
          else if (mapConfig.obstacles?.some(o => o.q === q && o.r === r)) { fill = "#52525b"; icon = "⛰️"; }
          else if (mapConfig.water?.some(w => w.q === q && w.r === r)) { fill = "#3b82f6"; icon = "💧"; }
          else if (mapConfig.bushes?.some(b => b.q === q && b.r === r)) { fill = "#22c55e"; icon = "🌿"; }

          const points = [];
          for (let i = 0; i < 6; i++) {
            const angle_deg = 60 * i;
            const angle_rad = Math.PI / 180 * angle_deg;
            points.push(HEX_SIZE * Math.cos(angle_rad));
            points.push(HEX_SIZE * Math.sin(angle_rad));
          }

          hexes.push(
            <Group key={`${q},${r}`} x={x} y={y} onClick={() => handleHexClick(q, r)} onTap={() => handleHexClick(q, r)}>
              <Line
                points={points}
                fill={fill}
                stroke="#3f3f46"
                strokeWidth={2}
                closed
              />
              {icon && (
                <Text
                  text={icon}
                  fontSize={24}
                  x={-12}
                  y={-12}
                />
              )}
            </Group>
          );
        }
      }
    }
    return hexes;
  };

  const tools: { id: Tool, label: string, icon: string }[] = [
    { id: 'eraser', label: '擦除', icon: '🧹' },
    { id: 'crystal', label: '水晶', icon: '💎' },
    { id: 'castle_0', label: 'P1王城', icon: '🏰' },
    { id: 'castle_1', label: 'P2王城', icon: '🏰' },
    { id: 'chest_t1', label: 'T1宝箱', icon: '📦' },
    { id: 'chest_t2', label: 'T2宝箱', icon: '🎁' },
    { id: 'monster_1', label: 'Lv1怪', icon: '👾' },
    { id: 'monster_2', label: 'Lv2怪', icon: '💀' },
    { id: 'monster_3', label: 'Lv3怪', icon: '🐉' },
    { id: 'magic_circle', label: '魔法阵', icon: '✨' },
    { id: 'trap', label: '陷阱', icon: '🕸️' },
    { id: 'turret', label: '炮台', icon: '🗼' },
    { id: 'watchtower', label: '瞭望塔', icon: '👁️' },
    { id: 'obstacle', label: '障碍物', icon: '⛰️' },
    { id: 'water', label: '水域', icon: '💧' },
    { id: 'bush', label: '草丛', icon: '🌿' },
  ];

  return (
    <div className="absolute inset-0 bg-zinc-900 z-[300] flex flex-col overflow-hidden">
      <div className="h-16 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
        <h1 className="text-lg font-bold text-white truncate mr-2">地图编辑器</h1>
        <div className="flex items-center gap-2">
          <input 
            type="text" 
            value={mapName}
            onChange={e => setMapName(e.target.value)}
            className="bg-zinc-800 text-white px-2 py-1 rounded border border-zinc-700 w-24 sm:w-32 text-xs sm:text-sm"
            placeholder="地图名称"
          />
          <button onClick={saveMapToLocal} className="px-2 sm:px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs sm:text-sm font-bold">保存</button>
          <button onClick={() => onSave(mapConfig)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-bold">使用</button>
          <button onClick={onClose} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm font-bold">关闭</button>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Toolbar - Bottom on mobile, Side on desktop */}
        <div className="w-full md:w-64 bg-zinc-950 border-b md:border-b-0 md:border-r border-zinc-800 p-2 md:p-4 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-2 shrink-0 no-scrollbar">
          <div className="hidden md:block text-zinc-400 font-bold mb-2 text-xs uppercase tracking-wider">工具 (Tools)</div>
          <div className="flex md:flex-col gap-2">
            {tools.map(tool => (
              <button
                key={tool.id}
                onClick={() => setSelectedTool(tool.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded text-left transition-colors shrink-0 ${selectedTool === tool.id ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
              >
                <span className="text-lg">{tool.icon}</span>
                <span className="text-xs font-medium whitespace-nowrap">{tool.label}</span>
              </button>
            ))}
          </div>
          
          <div className="text-zinc-400 font-bold mt-4 md:mt-6 mb-2 text-[10px] md:text-xs uppercase tracking-wider">已保存地图</div>
          <div className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-y-visible pb-2 md:pb-0">
            {savedMaps.length === 0 && <div className="text-zinc-500 text-[10px] md:text-xs italic">暂无保存地图</div>}
            {savedMaps.map((m, i) => (
              <div key={i} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => loadMap(m.config)}
                  className="flex-1 text-left px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] md:text-xs truncate max-w-[100px] md:max-w-none"
                >
                  {m.name}
                </button>
                <button 
                  onClick={() => {
                    const newSaved = savedMaps.filter((_, idx) => idx !== i);
                    setSavedMaps(newSaved);
                    localStorage.setItem('saved_maps', JSON.stringify(newSaved));
                    window.dispatchEvent(new Event('maps_updated'));
                  }}
                  className="p-1 bg-red-900/30 hover:bg-red-800 text-red-400 rounded"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button 
            onClick={() => loadMap(DEFAULT_MAP)}
            className="mt-4 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs text-center border border-zinc-700 transition-colors"
          >
            ✨ 恢复默认地图 (Load Default)
          </button>
        </div>
        
        {/* Canvas Area */}
        <div ref={containerRef} className="flex-1 bg-zinc-900 flex items-center justify-center relative overflow-hidden touch-none">
          <Stage 
            width={stageSize.width} 
            height={stageSize.height} 
            draggable 
            onWheel={handleWheel}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            onDragEnd={e => {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }}
          >
            <Layer>
              {renderHexes()}
            </Layer>
          </Stage>
          
          {/* Zoom Controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-2">
            <button 
              onClick={() => setStageScale(s => s * 1.2)}
              className="w-10 h-10 bg-zinc-800/80 backdrop-blur text-white rounded-full flex items-center justify-center border border-zinc-700 shadow-lg"
            >
              +
            </button>
            <button 
              onClick={() => setStageScale(s => s / 1.2)}
              className="w-10 h-10 bg-zinc-800/80 backdrop-blur text-white rounded-full flex items-center justify-center border border-zinc-700 shadow-lg"
            >
              -
            </button>
            <button 
              onClick={() => {
                setStageScale(0.8);
                setStagePos({ x: stageSize.width / 2, y: stageSize.height / 2 });
              }}
              className="w-10 h-10 bg-zinc-800/80 backdrop-blur text-white rounded-full flex items-center justify-center border border-zinc-700 shadow-lg text-xs"
            >
              Reset
            </button>
          </div>

          <div className="absolute top-4 right-4 text-zinc-500 text-[10px] pointer-events-none bg-black/20 px-2 py-1 rounded">
            双指缩放或滚轮缩放，拖动平移
          </div>
        </div>
      </div>
    </div>
  );
}
