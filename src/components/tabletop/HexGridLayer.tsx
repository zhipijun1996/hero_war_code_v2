import React from 'react';
import { Layer } from 'react-konva';
import { HEX_SIZE } from '../../shared/utils/hexUtils';
import { HexNode } from './HexNode';
import { DEFAULT_CASTLES, MAP_RADIUS } from '../../shared/config/maps/map'; 

interface HexGridLayerProps {
  onHexContextMenu: (e: any, x: number, y: number, clientX?: number, clientY?: number) => void;
  reachableCells?: { q: number, r: number }[];
  onHexClick?: (q: number, r: number) => void;
  selectedOption?: string | null;
  selectedHeroCardId?: string | null;
  playerIndex: number;
  phase?: string;
  pendingRevivals?: any[];
  mapConfig?: any;
  magicCircles?: any[];
  activeActionType?: string;
}

export const HexGridLayer: React.FC<HexGridLayerProps> = ({
  onHexContextMenu,
  reachableCells,
  onHexClick,
  selectedOption,
  selectedHeroCardId,
  playerIndex,
  phase,
  pendingRevivals,
  mapConfig,
  magicCircles,
  activeActionType
}) => {
  const hexes = [];
  const radius = MAP_RADIUS;
  
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const x = HEX_SIZE * 1.5 * q;
      const y = HEX_SIZE * Math.sqrt(3) * (r + q/2);
      
      let fill = "#ffffff";
      let icon = "";
      
      if (mapConfig) {
        if (mapConfig.crystal?.some((t: any) => t.q === q && t.r === r)) { fill = "#bfdbfe"; icon = "💎"; } // Crystal
        else if (mapConfig.magicCircles?.some((c: any) => c.q === q && c.r === r)) { 
          const mcState = magicCircles?.find(mc => mc.q === q && mc.r === r);
          if (mcState?.state === 'chanting') {
            fill = "#fef3c7"; // Light yellow background for chanting
            icon = "🔥"; // Fire icon for chanting
          } else {
            fill = "#bfdbfe";
            icon = "✨"; 
          }
        } // magicCircle
        else if (mapConfig.castles[0]?.some((c: any) => c.q === q && c.r === r)) { fill = "#fee2e2"; icon = "🏰"; } // P1 Castle
        else if (mapConfig.castles[1]?.some((c: any) => c.q === q && c.r === r)) { fill = "#dcfce7"; icon = "🏰"; } // P2 Castle
        else if (mapConfig.chests?.some((c: any) => c.q === q && c.r === r)) { fill = "#fef08a"; icon = "📦"; } // Chests
        else {
          const monster = mapConfig.monsters?.find((m: any) => m.q === q && m.r === r);
          if (monster) {
            if (monster.level === 1) { fill = "#fbcfe8"; icon = "👾"; }
            else if (monster.level === 2) { fill = "#f87171"; icon = "💀"; }
            else if (monster.level === 3) { fill = "#fca5a5"; icon = "🐉"; }
          } else if (mapConfig.traps?.some((t: any) => t.q === q && t.r === r)) {
            fill = "#fca5a5"; icon = "🕸️"; // Trap
          } else if (mapConfig.turrets?.some((t: any) => t.q === q && t.r === r)) {
            fill = "#cbd5e1"; icon = "🏹"; // Turret
          } else if (mapConfig.watchtowers?.some((t: any) => t.q === q && t.r === r)) {
            fill = "#fef3c7"; icon = "👁️"; // Watchtower
          } else if (mapConfig.obstacles?.some((o: any) => o.q === q && o.r === r)) {
            fill = "#94a3b8"; icon = "⛰️"; // Obstacle
          } else if (mapConfig.water?.some((w: any) => w.q === q && w.r === r)) {
            fill = "#93c5fd"; icon = "🌊"; // Water
          } else if (mapConfig.bushes?.some((b: any) => b.q === q && b.r === r)) {
            fill = "#86efac"; icon = "🌿"; // Bush
          }
        }
      } else {
        // Fallback if no mapConfig
        if (q === 0 && r === 0) { fill = "#bfdbfe"; icon = "💎"; } // Crystal
        else if ((q === 0 && r === 4) || (q === 4 && r === 0)) { fill = "#fee2e2"; icon = "🏰"; } // P1 Castle
        else if ((q === 0 && r === -4) || (q === -4 && r === 0)) { fill = "#dcfce7"; icon = "🏰"; } // P2 Castle
        else if ((q === -1 && r === 3) || (q === 1 && r === -3)) { fill = "#fef08a"; icon = "📦"; } // T1
        else if ((q === 1 && r === 1) || (q === -1 && r === -1)) { fill = "#fde68a"; icon = "👑"; } // T2
        else if ((q === -2 && r === 4) || (q === 2 && r === 2) || (q === -2 && r === -2) || (q === 2 && r === -4)) { fill = "#fbcfe8"; icon = "👾"; } // M1
        else if ((q === -3 && r === 1) || (q === -1 && r === 1) || (q === 3 && r === -1) || (q === 1 && r === -1)) { fill = "#f87171"; icon = "💀"; } // M2
        else if ((q === -3 && r === 3) || (q === 3 && r === -3)) { fill = "#fca5a5"; icon = "🐉"; } // M3
      }
      
      const isReachable = reachableCells?.some(c => c.q === q && c.r === r);
      const isAttack = selectedOption === 'attack' || selectedOption === 'turret_attack' || (phase === 'action_resolve' && activeActionType === 'attack');
      let highlightColor = isReachable ? (isAttack ? "rgba(239, 68, 68, 0.4)" : "rgba(253, 224, 71, 0.4)") : undefined;

      // Highlight castles for deployment/hiring/revival
      const isCastle = mapConfig ? 
        (mapConfig.castles[0]?.some((c: any) => c.q === q && c.r === r) || mapConfig.castles[1]?.some((c: any) => c.q === q && c.r === r)) :
        ((q === 0 && r === 4) || (q === 4 && r === 0) || (q === 0 && r === -4) || (q === -4 && r === 0));
      if (isCastle) {
        const playerCastles = mapConfig ? mapConfig.castles[playerIndex as 0 | 1] : (DEFAULT_CASTLES as any)[playerIndex as 0 | 1];
        const isMyCastle = playerCastles?.some((c: any) => c.q === q && c.r === r);
        
        if (isMyCastle) {
          if (selectedHeroCardId || selectedOption === 'hire') {
            highlightColor = "rgba(168, 85, 247, 0.4)"; // Purple highlight
          } else if (phase === 'revival' && pendingRevivals?.some(r => r.playerIndex === playerIndex)) {
            highlightColor = "rgba(139, 92, 246, 0.6)"; // Violet highlight
          }
        }
      }

      hexes.push(
        <HexNode 
          key={`${q}-${r}`} 
          q={q} 
          r={r} 
          x={x} 
          y={y} 
          fill={fill} 
          icon={icon} 
          onContextMenu={onHexContextMenu} 
          highlightColor={highlightColor}
          onClick={onHexClick}
        />
      );
    }
  }

  return <Layer>{hexes}</Layer>;
};
