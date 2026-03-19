import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group, Rect, Line } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { Socket } from 'socket.io-client';
import { GameState, TableCard, Token, Counter, Card, GameLog } from '../shared/types';
import { HEROES_DATABASE } from '../shared/config/heroes.ts';
import { HEX_SIZE, hexToPixel, pixelToHex, hexRound } from '../shared/utils/hexUtils';
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TabletopProps {
  socket: Socket;
  gameState: GameState;
  setZoomedCard: (card: Card | null) => void;
  playerId: string;
  isHistoryVisible: boolean;
  selectedHeroCardId: string | null;
  setSelectedHeroCardId: (id: string | null) => void;
  selectedHireCardId: string | null;
  setSelectedHireCardId: (id: string | null) => void;
}

const CASTLES = {
  0: [{ q: 0, r: 4 }, { q: 4, r: 0 }],
  1: [{ q: 0, r: -4 }, { q: -4, r: 0 }]
};

function HexNode({ q, r, x, y, fill, icon, onContextMenu, highlightColor, onClick, magicCircleState }: { q: number, r: number, x: number, y: number, fill: string, icon: string, onContextMenu: any, highlightColor?: string, onClick?: (q: number, r: number) => void, magicCircleState?: string }) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i;
    const angle_rad = Math.PI / 180 * angle_deg;
    points.push(x + HEX_SIZE * Math.cos(angle_rad));
    points.push(y + HEX_SIZE * Math.sin(angle_rad));
  }

  const isSpecial = fill !== "#ffffff" || magicCircleState !== undefined;
  const timerRef = useRef<any>(null);
  const longPressTriggered = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e: any) => {
    if (!isSpecial) return;
    longPressTriggered.current = false;
    if (e.evt && e.evt.touches) {
      touchStartPos.current = { x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY };
    }
    timerRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      onContextMenu(e, x, y, touchStartPos.current.x, touchStartPos.current.y);
    }, 500);
  };

  const handleTouchMove = (e: any) => {
    if (!isSpecial) return;
    if (!e.evt || !e.evt.touches) return;
    const dx = e.evt.touches[0].clientX - touchStartPos.current.x;
    const dy = e.evt.touches[0].clientY - touchStartPos.current.y;
    if (Math.sqrt(dx*dx + dy*dy) > 10) {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  const handleTouchEnd = () => {
    if (!isSpecial) return;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleClick = (e: any) => {
    if (longPressTriggered.current) {
      e.cancelBubble = true;
      return;
    }
    if (onClick) {
      onClick(q, r);
    }
  };

  let finalFill = highlightColor || fill;
  let finalStroke = highlightColor ? (highlightColor.includes('239') ? "#ef4444" : "#facc15") : "#a1a1aa";
  let finalStrokeWidth = highlightColor ? 4 : 1;

  if (magicCircleState) {
    if (magicCircleState === 'chanting') {
      finalFill = "#bfdbfe"; // Highlight blue
      finalStroke = "#3b82f6";
      finalStrokeWidth = 4;
    } else {
      finalFill = "#e0e7ff"; // Light blue for idle
    }
  }

  return (
    <Group 
      onContextMenu={(e) => {
        if (isSpecial) {
          e.cancelBubble = true;
          if (e.evt) e.evt.preventDefault();
          onContextMenu(e, x, y);
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      onTap={handleClick}
    >
      <Line 
        points={points} 
        fill={finalFill} 
        stroke={finalStroke} 
        strokeWidth={finalStrokeWidth} 
        closed 
      />
      {icon && <Text x={x - HEX_SIZE/2} y={y - 12} width={HEX_SIZE} text={icon} fontSize={24} align="center" />}
    </Group>
  );
}

function HexGridLayer({ onHexContextMenu, reachableCells, onHexClick, selectedOption, magicCircles, selectedHeroCardId, selectedHireCardId, playerIndex, phase, pendingRevivals, mapConfig, activeActionType }: { onHexContextMenu: (e: any, x: number, y: number, clientX?: number, clientY?: number) => void, reachableCells?: { q: number, r: number }[], onHexClick?: (q: number, r: number) => void, selectedOption?: string | null, magicCircles?: { q: number, r: number, state: string }[], selectedHeroCardId?: string | null, selectedHireCardId?: string | null, playerIndex: number, phase?: string, pendingRevivals?: any[], mapConfig?: any, activeActionType?: string }) {
  const hexes = [];
  const radius = 4;
  
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const x = HEX_SIZE * 1.5 * q;
      const y = HEX_SIZE * Math.sqrt(3) * (r + q/2);
      
      let fill = "#ffffff";
      let icon = "";
      
      const magicCircle = magicCircles?.find(mc => mc.q === q && mc.r === r);
      if (magicCircle) {
        icon = "✨";
      } else if (mapConfig) {
        if (mapConfig.crystal && q === mapConfig.crystal.q && r === mapConfig.crystal.r) { fill = "#bfdbfe"; icon = "💎"; } // Crystal
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
        const playerCastles = mapConfig ? mapConfig.castles[playerIndex as 0 | 1] : CASTLES[playerIndex as 0 | 1];
        const isMyCastle = playerCastles?.some((c: any) => c.q === q && c.r === r);
        
        if (isMyCastle) {
          if (selectedHeroCardId || selectedHireCardId || selectedOption === 'hire') {
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
          magicCircleState={magicCircle?.state}
        />
      );
    }
  }

  return <Layer>{hexes}</Layer>;
}

function DeckNode({ x, y, type, count, label, backImage, onContextMenu, socket }: { x: number, y: number, type: string, count: number, label: string, backImage?: string, onContextMenu: (e: any, type: string) => void, socket: Socket }) {
  const [image] = useImage(backImage || '');
  const timerRef = useRef<any>(null);
  const longPressTriggered = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e: any) => {
    longPressTriggered.current = false;
    if (e.evt && e.evt.touches) {
      touchStartPos.current = { x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY };
    }
    timerRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      onContextMenu(e, type);
    }, 500);
  };

  const handleTouchMove = (e: any) => {
    if (!e.evt || !e.evt.touches) return;
    const dx = e.evt.touches[0].clientX - touchStartPos.current.x;
    const dy = e.evt.touches[0].clientY - touchStartPos.current.y;
    if (Math.sqrt(dx*dx + dy*dy) > 10) {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleClick = (e: any) => {
    e.cancelBubble = true;
    if (longPressTriggered.current) return;
    if (type === 'action') {
      socket.emit('draw_card', type);
    } else {
      socket.emit('draw_card_to_table', type, x + 120, y);
    }
  };

  return (
    <Group 
      x={x} 
      y={y} 
      onClick={handleClick}
      onTap={handleClick}
      onContextMenu={(e) => onContextMenu(e, type)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <Rect width={100} height={150} fill="#27272a" cornerRadius={8} stroke="#52525b" strokeWidth={2} shadowColor="black" shadowBlur={10} shadowOpacity={0.5} />
      {count > 0 && image && (
        <KonvaImage image={image} width={100} height={150} cornerRadius={8} />
      )}
      <Group y={image && count > 0 ? 155 : 60}>
        <Rect width={100} height={40} fill="rgba(0,0,0,0.6)" cornerRadius={4} />
        <Text text={label} fill="white" width={100} align="center" y={5} fontStyle="bold" />
        <Text text={count.toString()} fill="#a1a1aa" width={100} align="center" y={22} fontSize={10} />
      </Group>
    </Group>
  );
}

const BASE_URL = 'https://raw.githubusercontent.com/zhipijun1996/heros_war/main/';
const getHeroTokenImage = (heroClass: string) => {
  return `${BASE_URL}token_${encodeURIComponent(heroClass)}.png`;
};

function ActionTokenNode({ token, onClick, isMyTurn, isSelected }: { token: any, onClick: (id: string) => void, isMyTurn: boolean, isSelected: boolean }) {
  const [image] = useImage(token.heroClass ? getHeroTokenImage(token.heroClass) : 'https://image.pollinations.ai/prompt/A%20glowing%20golden%20star%20token%20fantasy%20anime%20art?nologo=true');
  return (
    <Group 
      x={token.x} 
      y={token.y} 
      onClick={() => isMyTurn && !token.used && onClick(token.id)} 
      onTap={() => isMyTurn && !token.used && onClick(token.id)}
      listening={isMyTurn && !token.used}
      onMouseEnter={(e: any) => {
        const container = e.target.getStage().container();
        container.style.cursor = 'pointer';
      }}
      onMouseLeave={(e: any) => {
        const container = e.target.getStage().container();
        container.style.cursor = 'default';
      }}
    >
      <Circle 
        radius={30} 
        fill={token.used ? '#555' : (isSelected ? '#fef08a' : '#fff')} 
        stroke={token.used ? '#333' : (isSelected ? '#fbbf24' : '#FFD700')} 
        strokeWidth={isSelected ? 6 : 3} 
        shadowBlur={isSelected ? 15 : 0}
        shadowColor="#fbbf24"
      />
      {image && (
        <KonvaImage
          image={image}
          x={-25}
          y={-25}
          width={50}
          height={50}
          opacity={token.used ? 0.3 : 1}
          cornerRadius={25}
        />
      )}
      {!token.heroCardId && (
        <Text text="万能" x={-15} y={-8} fill={token.used ? '#888' : '#000'} fontSize={14} fontStyle="bold" />
      )}
    </Group>
  );
}

function TokenNode({ token, socket, onClick, isSelected, draggable, lastEvolvedId, onHexClick, isMyToken }: { token: Token; socket: Socket, onClick?: (id: string) => void, isSelected?: boolean, draggable?: boolean, lastEvolvedId?: string | null, onHexClick?: (q: number, r: number) => void, isMyToken?: boolean }) {
  const [image] = useImage(token.heroClass ? getHeroTokenImage(token.heroClass) : 'https://image.pollinations.ai/prompt/A%20glowing%20golden%20star%20token%20fantasy%20anime%20art?nologo=true');
  const groupRef = useRef<any>(null);

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.to({
        x: token.x,
        y: token.y,
        duration: 0.3,
        easing: Konva.Easings.EaseInOut
      });
    }
  }, [token.x, token.y]);
  
  return (
    <Group
      ref={groupRef}
      x={token.x}
      y={token.y}
      draggable={draggable}
      listening={true}
      onClick={(e) => { 
        e.cancelBubble = true; 
        if (isMyToken) {
          onClick?.(token.id); 
        } else {
          const hex = pixelToHex(token.x, token.y);
          onHexClick?.(hex.q, hex.r);
        }
      }}
      onTap={(e) => { 
        e.cancelBubble = true; 
        if (isMyToken) {
          onClick?.(token.id); 
        } else {
          const hex = pixelToHex(token.x, token.y);
          onHexClick?.(hex.q, hex.r);
        }
      }}
      onDragEnd={(e) => {
        const newX = e.target.x();
        const newY = e.target.y();
        
        // Exclusion Zone check
        if (newX > 800 && newY > 400) {
          socket.emit('move_item', { type: 'token', id: token.id, x: newX, y: newY });
          return;
        }

        const hex = pixelToHex(newX, newY);
        if (Math.abs(hex.q) <= 4 && Math.abs(hex.r) <= 4 && Math.abs(-hex.q - hex.r) <= 4) {
          const snapped = hexToPixel(hex.q, hex.r);
          e.target.position({ x: snapped.x, y: snapped.y });
          e.target.getLayer()?.batchDraw();
          socket.emit('move_item', { type: 'token', id: token.id, x: snapped.x, y: snapped.y });
        } else {
          socket.emit('move_item', { type: 'token', id: token.id, x: newX, y: newY });
        }
      }}
      onMouseEnter={(e: any) => {
        const container = e.target.getStage().container();
        container.style.cursor = 'pointer';
      }}
      onMouseLeave={(e: any) => {
        const container = e.target.getStage().container();
        container.style.cursor = 'default';
      }}
    >
      <Circle 
        radius={30} 
        fill={isSelected ? "#4f46e5" : "#27272a"} 
        stroke={isSelected || lastEvolvedId === token.boundToCardId ? "#fbbf24" : "#52525b"} 
        strokeWidth={isSelected || lastEvolvedId === token.boundToCardId ? 5 : 2} 
        shadowColor={lastEvolvedId === token.boundToCardId ? "#fbbf24" : "black"}
        shadowBlur={lastEvolvedId === token.boundToCardId ? 30 : 10} 
        shadowOpacity={0.9} 
        shadowOffset={{ x: 2, y: 2 }} 
      />
      {lastEvolvedId === token.boundToCardId && (
        <Circle radius={40} stroke="#fbbf24" strokeWidth={3} dash={[5, 5]} opacity={0.8} />
      )}
      {image && (
        <Circle radius={28} fillPatternImage={image} fillPatternScale={{ x: 56 / image.width, y: 56 / image.height }} fillPatternOffset={{ x: image.width / 2, y: image.height / 2 }} />
      )}
      {token.label && (
        <Text text={token.label} fill="white" y={35} x={-40} width={80} align="center" fontSize={12} fontStyle="bold" shadowColor="black" shadowBlur={2} />
      )}
    </Group>
  );
}

function CardNode({ card, socket, onContextMenu, onZoom, onClick, isSelected, lastEvolvedId }: { card: TableCard; socket: Socket, onContextMenu: (e: any, id: string) => void, onZoom: (card: TableCard) => void, onClick?: (id: string) => void, isSelected?: boolean, lastEvolvedId?: string | null }) {
  const [frontImage, frontStatus] = useImage(card.frontImage);
  const [backImage, backStatus] = useImage(card.backImage);
  
  const image = card.faceUp ? frontImage : backImage;
  const imageStatus = card.faceUp ? frontStatus : backStatus;
  const isHeroOnTable = card.type === 'hero' && (card.y === 550 || card.y === -700);

  const timerRef = useRef<any>(null);
  const longPressTriggered = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e: any) => {
    longPressTriggered.current = false;
    if (e.evt && e.evt.touches) {
      touchStartPos.current = { x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY };
    }
    timerRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      onContextMenu(e, card.id);
    }, 500);
  };

  const handleTouchMove = (e: any) => {
    if (!e.evt || !e.evt.touches) return;
    const dx = e.evt.touches[0].clientX - touchStartPos.current.x;
    const dy = e.evt.touches[0].clientY - touchStartPos.current.y;
    if (Math.sqrt(dx*dx + dy*dy) > 10) {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!longPressTriggered.current && onClick) {
      onClick(card.id);
    }
  };

  const handleClick = (e: any) => {
    if (longPressTriggered.current) {
      e.cancelBubble = true;
      return;
    }
    if (onClick) {
      onClick(card.id);
    }
  };

  const handleDblClick = (e: any) => {
    e.cancelBubble = true;
    if (longPressTriggered.current) return;
    onZoom(card);
  };

  return (
    <Group
      x={card.x}
      y={card.y}
      draggable={!isHeroOnTable}
      onDragStart={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
      }}
      onDragEnd={(e) => {
        const newX = e.target.x();
        const newY = e.target.y();
        
        // Exclusion Zone check
        if (newX > 800 && newY > 400) {
          socket.emit('move_item', { type: 'card', id: card.id, x: newX, y: newY });
          return;
        }

        if (newX > 400 && newX < 550 && newY > 50 && newY < 250) {
          socket.emit('discard_card', card.id);
        } else {
          socket.emit('move_item', { type: 'card', id: card.id, x: newX, y: newY });
        }
      }}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onClick={handleClick}
      onTap={handleClick}
      onContextMenu={(e) => onContextMenu(e, card.id)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onMouseEnter={(e: any) => {
        const container = e.target.getStage().container();
        container.style.cursor = 'pointer';
      }}
      onMouseLeave={(e: any) => {
        const container = e.target.getStage().container();
        container.style.cursor = 'default';
      }}
    >
      <Rect
        width={100}
        height={150}
        fill="#18181b"
        cornerRadius={8}
        shadowColor={lastEvolvedId === card.id ? "#fbbf24" : "black"}
        shadowBlur={lastEvolvedId === card.id ? 40 : 10}
        shadowOpacity={0.9}
        shadowOffset={{ x: 2, y: 2 }}
        stroke={lastEvolvedId === card.id ? "#fbbf24" : (isSelected ? "#fbbf24" : "#3f3f46")}
        strokeWidth={lastEvolvedId === card.id || isSelected ? 5 : 1}
      />
      {lastEvolvedId === card.id && (
        <Rect 
          width={120} 
          height={170} 
          x={-10} 
          y={-10} 
          stroke="#fbbf24" 
          strokeWidth={3} 
          dash={[10, 5]} 
          cornerRadius={12}
          opacity={0.8}
        />
      )}
      {image && imageStatus === 'loaded' ? (
        <KonvaImage
          image={image}
          width={100}
          height={150}
          cornerRadius={8}
        />
      ) : (
        <Group>
          <Rect width={100} height={150} fill="#27272a" cornerRadius={8} />
          <Text 
            text={card.faceUp ? (card.name || card.heroClass || '卡牌') : '???'} 
            fill="white" 
            width={100} 
            height={150} 
            align="center" 
            verticalAlign="middle" 
            fontSize={14}
            padding={10}
          />
          <Text 
            text={card.type === 'hero' ? '👤' : card.type.startsWith('treasure') ? '💰' : '📜'} 
            x={0} 
            y={20} 
            width={100} 
            align="center" 
            fontSize={30} 
          />
        </Group>
      )}
    </Group>
  );
}

function CounterNode({ counter, socket }: { counter: Counter; socket: Socket }) {
  const colors = {
    gold: '#fbbf24',
    exp: '#34d399',
    damage: '#f87171',
    time: '#60a5fa',
    level: '#a78bfa'
  };
  
  const labels = {
    gold: '',
    exp: '',
    damage: '',
    time: 'T',
    level: 'Lv'
  };

  return (
    <Group
      x={counter.x}
      y={counter.y}
      draggable
      onDragEnd={(e) => {
        const newX = e.target.x();
        const newY = e.target.y();

        // Exclusion Zone check
        if (newX > 800 && newY > 400) {
          socket.emit('move_item', { type: 'counter', id: counter.id, x: newX, y: newY });
          return;
        }

        const hex = pixelToHex(newX, newY);
        if (Math.abs(hex.q) <= 4 && Math.abs(hex.r) <= 4 && Math.abs(-hex.q - hex.r) <= 4) {
          const snapped = hexToPixel(hex.q, hex.r);
          e.target.position({ x: snapped.x, y: snapped.y });
          e.target.getLayer()?.batchDraw();
          socket.emit('move_item', { type: 'counter', id: counter.id, x: snapped.x, y: snapped.y });
        } else {
          socket.emit('move_item', { type: 'counter', id: counter.id, x: newX, y: newY });
        }
      }}
    >
      <Circle radius={25} fill={colors[counter.type]} shadowColor="black" shadowBlur={5} shadowOpacity={0.3} shadowOffset={{ x: 1, y: 1 }} />
      <Text
        text={`${labels[counter.type]}${counter.value}`}
        fontSize={20}
        fontStyle="bold"
        fill="#18181b"
        x={-25}
        y={-10}
        width={50}
        align="center"
      />
      
      {/* Minus button */}
      <Group x={-35} y={0} onClick={(e) => { e.cancelBubble = true; socket.emit('update_counter', { id: counter.id, delta: -1 }); }} onTap={(e) => { e.cancelBubble = true; socket.emit('update_counter', { id: counter.id, delta: -1 }); }}>
        <Circle radius={15} fill="#3f3f46" />
        <Text text="-" fill="white" x={-4} y={-6} fontSize={14} fontStyle="bold" />
      </Group>

      {/* Plus button */}
      <Group x={35} y={0} onClick={(e) => { e.cancelBubble = true; socket.emit('update_counter', { id: counter.id, delta: 1 }); }} onTap={(e) => { e.cancelBubble = true; socket.emit('update_counter', { id: counter.id, delta: 1 }); }}>
        <Circle radius={15} fill="#3f3f46" />
        <Text text="+" fill="white" x={-4} y={-6} fontSize={14} fontStyle="bold" />
      </Group>
    </Group>
  );
}

function HistoryLogGroup({ logs, isVisible, position, onDragEnd }: { logs: GameLog[], isVisible: boolean, position: { x: number, y: number }, onDragEnd: (pos: { x: number, y: number }) => void }) {
  if (!isVisible) return null;
  const displayLogs = logs.slice(-18); // Show last 18 logs
  return (
    <Group x={position.x} y={position.y} draggable onDragEnd={(e) => onDragEnd({ x: e.target.x(), y: e.target.y() })}>
      <Rect 
        width={350} 
        height={450} 
        fill="rgba(24, 24, 27, 0.7)" 
        stroke="#3f3f46" 
        strokeWidth={2} 
        cornerRadius={12} 
        shadowColor="black"
        shadowBlur={10}
        shadowOpacity={0.3}
      />
      <Rect 
        width={350} 
        height={40} 
        fill="rgba(39, 39, 42, 0.8)" 
        cornerRadius={[12, 12, 0, 0]} 
      />
      <Text 
        text="历史记录 (History)" 
        fill="#e4e4e7" 
        fontSize={16} 
        fontStyle="bold" 
        x={15} 
        y={12} 
      />
      {displayLogs.map((log, i) => log && (
        <Group key={log.id} y={55 + i * 20}>
           <Text 
             text={`[${log.round}]`} 
             fill="#a1a1aa" 
             fontSize={12} 
             fontStyle="bold"
             x={15} 
           />
           <Text 
             text={log.message} 
             fill={log.playerIndex === 0 ? '#60a5fa' : log.playerIndex === 1 ? '#f87171' : '#d4d4d8'} 
             fontSize={13} 
             x={55}
             width={280}
             wrap="word"
           />
        </Group>
      ))}
    </Group>
  );
}

export default function Tabletop({ socket, gameState, setZoomedCard, playerId, isHistoryVisible, selectedHeroCardId, setSelectedHeroCardId, selectedHireCardId, setSelectedHireCardId }: TabletopProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const calculateInitialScale = (w: number, h: number) => {
    const targetWidth = 1000;
    const targetHeight = 1600;
    return Math.min(w / targetWidth, h / targetHeight, 1);
  };

  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [stagePos, setStagePos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [stageScale, setStageScale] = useState(() => calculateInitialScale(window.innerWidth, window.innerHeight));
  const [menu, setMenu] = useState<{ x: number, y: number, type: 'deck' | 'card' | 'hex', targetId: string, targetX?: number, targetY?: number } | null>(null);
  const [hirePopup, setHirePopup] = useState<{ cardId: string } | null>(null);
  const [showExplosion, setShowExplosion] = useState<{ x: number, y: number } | null>(null);
  const [historyPos, setHistoryPos] = useState({ x: -850, y: -450 });

  useEffect(() => {
    if (gameState.lastEvolvedId) {
      const card = gameState.tableCards.find(c => c.id === gameState.lastEvolvedId);
      if (card) {
        setShowExplosion({ x: card.x + 50, y: card.y + 75 });
        setTimeout(() => setShowExplosion(null), 1000);
      }
    }
  }, [gameState.lastEvolvedId, gameState.tableCards]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPromptHidden, setIsPromptHidden] = useState(false);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [showJoinOverlay, setShowJoinOverlay] = useState(false);
  const lastCenter = useRef<{ x: number, y: number } | null>(null);
  const lastDist = useRef<number>(0);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
        setStagePos({
          x: containerRef.current.offsetWidth / 2,
          y: containerRef.current.offsetHeight / 2
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const handleErrorMessage = (msg: string) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 3000);
    };
    socket.on('error_message', handleErrorMessage);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.off('error_message', handleErrorMessage);
    };
  }, [socket]);

  const getDistance = (p1: any, p2: any) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  const getCenter = (p1: any, p2: any) => {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
  };

  const handleTouchMove = (e: any) => {
    e.evt.preventDefault();
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];

    if (touch1 && touch2) {
      const stage = e.target.getStage();
      if (!stage) return;

      if (stage.isDragging()) {
        stage.stopDrag();
      }

      const p1 = { x: touch1.clientX, y: touch1.clientY };
      const p2 = { x: touch2.clientX, y: touch2.clientY };

      if (!lastCenter.current) {
        lastCenter.current = getCenter(p1, p2);
        lastDist.current = getDistance(p1, p2);
        stage.setAttr('startScale', stage.scaleX());
        stage.setAttr('startPos', stage.position());
        return;
      }

      const newCenter = getCenter(p1, p2);
      const dist = getDistance(p1, p2);

      const startScale = stage.getAttr('startScale');
      const startPos = stage.getAttr('startPos');
      const startCenter = lastCenter.current;
      const startDist = lastDist.current;

      if (!startScale || !startPos || !startDist) return;

      const scale = startScale * (dist / startDist);

      const pointTo = {
        x: (startCenter.x - startPos.x) / startScale,
        y: (startCenter.y - startPos.y) / startScale,
      };

      const newPos = {
        x: newCenter.x - pointTo.x * scale,
        y: newCenter.y - pointTo.y * scale,
      };

      stage.scaleX(scale);
      stage.scaleY(scale);
      stage.position(newPos);
      stage.batchDraw();

      setStageScale(scale);
      setStagePos(newPos);
    }
  };

  const handleTouchEnd = (e: any) => {
    lastDist.current = 0;
    lastCenter.current = null;
    
    const stage = e.target.getStage();
    if (stage) {
      setStageScale(stage.scaleX());
      setStagePos(stage.position());
    }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const mousePointTo = {
      x: stage.getPointerPosition().x / oldScale - stage.x() / oldScale,
      y: stage.getPointerPosition().y / oldScale - stage.y() / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setStageScale(newScale);
    setStagePos({
      x: -(mousePointTo.x - stage.getPointerPosition().x / newScale) * newScale,
      y: -(mousePointTo.y - stage.getPointerPosition().y / newScale) * newScale,
    });
  };

  const zoomIn = () => setStageScale(s => s * 1.2);
  const zoomOut = () => setStageScale(s => s / 1.2);
  const resetZoom = () => {
    setStageScale(calculateInitialScale(size.width, size.height));
    setStagePos({ x: size.width / 2, y: size.height / 2 });
  };

  const handleDeckContextMenu = (e: any, type: string) => {
    e.cancelBubble = true;
    if (e.evt) e.evt.preventDefault();
    
    const pointerPos = e.target.getStage().getPointerPosition();
    
    setMenu({ x: pointerPos.x, y: pointerPos.y, type: 'deck', targetId: type });
  };

  const handleCardContextMenu = (e: any, id: string) => {
    e.cancelBubble = true;
    if (e.evt) e.evt.preventDefault();
    
    const pointerPos = e.target.getStage().getPointerPosition();
    
    setMenu({ x: pointerPos.x, y: pointerPos.y, type: 'card', targetId: id });
  };

  const handleHexContextMenu = (e: any, x: number, y: number, clientX?: number, clientY?: number) => {
    e.cancelBubble = true;
    try {
      if (e.evt && typeof e.evt.preventDefault === 'function') e.evt.preventDefault();
    } catch (err) {}
    
    let pointerPos = e.target.getStage().getPointerPosition();
    
    if (!pointerPos && clientX !== undefined && clientY !== undefined) {
      const container = e.target.getStage().container();
      if (container) {
        const rect = container.getBoundingClientRect();
        pointerPos = {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
      }
    }
    
    if (pointerPos) {
      setMenu({ x: pointerPos.x, y: pointerPos.y, type: 'hex', targetId: `${x},${y}`, targetX: x, targetY: y });
    }
  };

  const BASE_URL = 'https://raw.githubusercontent.com/zhipijun1996/heros_war/main/';

  const isPlayer1 = gameState.seats[0] === playerId;
  const isPlayer2 = gameState.seats[1] === playerId;
  const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
  const isActivePlayer = playerIndex === gameState.activePlayerIndex;

  const getPromptText = () => {
    if (gameState.phase === 'setup') {
      const playedCount = gameState.heroPlayedCount[playerId] || 0;
      if (playerIndex !== -1 && playedCount < 2) {
        if (selectedHeroCardId) {
          return "准备阶段：请点击地图上的王城🏰以部署英雄";
        }
        return `准备阶段：请从手牌选择第 ${playedCount + 1} 个初始英雄`;
      } else if (playerIndex !== -1 && playedCount >= 2) {
        return "准备阶段：等待对手选择初始英雄";
      }
      return "准备阶段：等待双方选择初始英雄";
    }

    const activePlayerStr = `玩家${gameState.activePlayerIndex + 1}`;
    const inactivePlayerStr = `玩家${1 - gameState.activePlayerIndex + 1}`;
    
    if (gameState.phase === 'action_play') {
      return `行动阶段：请${activePlayerStr}点击行动Token`;
    }
    if (gameState.phase === 'action_options') {
      return `请选择行动方式 (Select action type)`;
    }
    if (gameState.phase === 'action_common') {
      return `请选择通用动作 (Select common action)`;
    }
    if (gameState.phase === 'action_select_card') {
      return `请选择一张手牌进行行动 (Select a card for action)`;
    }
    if (gameState.phase === 'action_select_hero') {
      return `请选择一个英雄进行行动 (Select a hero for action)`;
    }
    if (gameState.phase === 'action_select_action') {
      return `请选择英雄的行动 (Select hero action)`;
    }
    if (gameState.phase === 'action_play_enhancement') {
      return `请打出一张强化卡或跳过 (Play an enhancement card or pass)`;
    }
    if (gameState.phase === 'action_select_substitute') {
      return `请选择替身英雄 (Select substitute hero)`;
    }
    if (gameState.phase === 'action_resolve') {
      if (gameState.activePlayerIndex !== playerIndex) return `等待对方结算行动 (Waiting for opponent to resolve action)`;
      if (gameState.activeActionType === 'move') {
        return `请选择移动目标格子 (Select target hex for movement)`;
      } else if (gameState.activeActionType === 'attack') {
        return `请选择攻击目标 (Select attack target)`;
      } else if (gameState.activeActionType === 'skill') {
        return `请结算技能 (Resolve skill)`;
      } else if (gameState.activeActionType === 'evolve') {
        return `请结算进化 (Resolve evolve)`;
      }
      return `请结算行动 (Resolve action)`;
    }
    if (gameState.phase === 'action_select_option') {
      if (gameState.activePlayerIndex !== playerIndex) return `等待对方选择行动 (Waiting for opponent to select action)`;
      if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
        if (!gameState.selectedTokenId) return "请选择一个英雄Token进行移动 (Select a hero token to move)";
        const token = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
        return `正在移动 ${token?.label || '英雄'} (剩余移动力: ${gameState.remainingMv}) | Moving ${token?.label || 'Hero'} (Remaining MV: ${gameState.remainingMv})`;
      }
      if (!gameState.selectedOption) {
        return `请选择行动选项 (Select Action Option)`;
      } else if (gameState.selectedOption === 'heal') {
        if (!gameState.selectedTargetId) {
          return `回复：请在桌面上选择一个要回复的英雄 (Heal: Select a hero on the table)`;
        } else {
          return `已选择回复目标，请点击完成结算 (Target selected, click Finish Resolve)`;
        }
      } else if (gameState.selectedOption === 'evolve') {
        if (!gameState.selectedTargetId) {
          return `进化：请在桌面上选择一个要进化的英雄 (Evolve: Select a hero on the table)`;
        } else {
          return `已选择进化目标，请点击完成结算 (Target selected, click Finish Resolve)`;
        }
      } else if (gameState.selectedOption === 'spy') {
        return `间谍：点击完成结算以随机弃掉对手一张手牌 (Spy: Click Finish Resolve to discard opponent's card)`;
      } else if (gameState.selectedOption === 'seize') {
        return `抢先手：点击完成结算以获得下回合先手 (Seize: Click Finish Resolve to get initiative)`;
      } else if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
        if (gameState.selectedTokenId) {
          return `已选择英雄，请点击高亮的格子以移动 (Hero selected, click a highlighted cell to move)`;
        }
        return `移动：请选择一个己方英雄 (Move: Select a hero)`;
      } else if (gameState.selectedOption === 'attack') {
        if (gameState.selectedTokenId) {
          return `已选择英雄，请点击高亮的攻击目标 (Hero selected, click a highlighted target)`;
        }
        return `攻击：请选择一个己方英雄 (Attack: Select a hero)`;
      } else if (gameState.selectedOption === 'buy') {
        return `购买：请点击商店区的装备卡进行购买 (Buy: Click an equipment card in the shop area)`;
      } else if (gameState.selectedOption === 'hire') {
        if (gameState.selectedTargetId && gameState.selectedHireCost) {
          return "请点击地图上的王城🏰以部署雇佣的英雄";
        }
        return `雇佣：请选择一个英雄并支付金币 (Hire: Select a hero and pay gold)`;
      } else if (gameState.selectedOption === 'chant') {
        return `咏唱：请选择在魔法阵上的己方英雄 (Chant: Select a hero on a magic circle)`;
      } else if (gameState.selectedOption === 'fire') {
        return `开火：请选择正在咏唱的己方英雄 (Fire: Select a chanting hero)`;
      } else if (gameState.selectedOption === 'turret_attack') {
        if (gameState.selectedTokenId) {
          return `已选择英雄，请点击高亮的攻击目标 (Hero selected, click a highlighted target)`;
        }
        return `炮台攻击：请选择在炮台上的己方英雄 (Turret Attack: Select a hero on a turret)`;
      }
      return `结算阶段：请${activePlayerStr}结算场面`;
    }
    if (gameState.phase === 'action_defend') {
      const hasDefenseCard = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
      if (hasDefenseCard) {
        return `防御阶段：已打出防御卡，请选择确认防御或反击 (Defense card played, choose Confirm or Counter)`;
      }
      return `防御阶段：请${activePlayerStr}打出防御卡或Pass (Play a defense card or Pass)`;
    }
    if (gameState.phase === 'action_resolve_attack') {
      return `攻击结算：请${activePlayerStr}结算攻击`;
    }
    if (gameState.phase === 'action_resolve_attack_counter') {
      return `攻击结算：请${activePlayerStr}结算攻击 (Settle attack)`;
    }
    if (gameState.phase === 'action_resolve_counter') {
      return `反击结算：请${activePlayerStr}结算反击 (Settle counter-attack)`;
    }
    if (gameState.phase === 'shop') {
      if ((selectedHireCardId || gameState.selectedTargetId) && gameState.selectedHireCost) {
        return "请点击地图上的王城🏰以部署雇佣的英雄";
      } else if (selectedHireCardId || gameState.selectedTargetId) {
        return "请选择雇佣成本 (Select hire cost)";
      }
      return `商店阶段：请${activePlayerStr}购买装备或雇佣英雄`;
    }
    if (gameState.phase === 'revival') {
      const pending = gameState.pendingRevivals?.find(r => r.playerIndex === playerIndex);
      if (pending) {
        const hero = gameState.tableCards.find(c => c.id === pending.heroCardId);
        return `复活阶段：请点击地图上的王城🏰以复活 ${hero?.heroClass || '英雄'}`;
      }
      return `复活阶段：等待对方复活英雄...`;
    }
    if (gameState.phase === 'supply') {
      return `补给阶段：双方抽取卡牌（英雄数+1）`;
    }
    if (gameState.phase === 'discard') {
      return `弃牌阶段：请检查手牌并弃掉多余卡牌`;
    }
    if (gameState.phase === 'end') {
      return `结束阶段：时间计数+1`;
    }
    return "";
  };

  const getPromptButtons = () => {
    if (!isActivePlayer && gameState.phase !== 'supply' && gameState.phase !== 'end' && gameState.phase !== 'discard') return null;

    if (gameState.phase === 'action_play') {
      return (
        <button onClick={() => socket.emit('pass_action')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
          Pass
        </button>
      );
    }
    
    if (gameState.phase === 'action_select_action') {
      return (
        <div className="flex gap-4 flex-wrap justify-center">
          <button onClick={() => socket.emit('select_hero_action', 'move')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
            移动 (Move)
          </button>
          <button onClick={() => socket.emit('select_hero_action', 'attack')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">
            攻击 (Attack)
          </button>
          <button onClick={() => socket.emit('select_hero_action', 'skill')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold">
            技能 (Skill)
          </button>
          <button onClick={() => socket.emit('select_hero_action', 'evolve')} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold">
            进化 (Evolve)
          </button>
        </div>
      );
    }

    if (gameState.phase === 'action_play_enhancement') {
      return (
        <button onClick={() => socket.emit('pass_enhancement')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
          跳过强化 (Pass Enhancement)
        </button>
      );
    }

    if (gameState.phase === 'action_resolve') {
      return (
        <button onClick={() => socket.emit('finish_action')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
          完成结算 (Finish Resolve)
        </button>
      );
    }

    if (gameState.phase === 'action_select_option') {
      let playedCard = null;
      if (gameState.lastPlayedCardId) {
        playedCard = gameState.playAreaCards.find(c => c.id === gameState.lastPlayedCardId) || 
                     gameState.tableCards.find(c => c.id === gameState.lastPlayedCardId);
      }

      if (!gameState.selectedOption) {
        const isFirstPlayer = gameState.seats[gameState.firstPlayerIndex] === playerId;
        const canSeize = !isFirstPlayer && !gameState.hasSeizedInitiative;

        return (
          <div className="flex gap-4 flex-wrap justify-center">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
            {canSeize && (
              <button onClick={() => socket.emit('select_option', 'seize')} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold">
                抢先手
              </button>
            )}
            {gameState.canEvolve && (
              <button onClick={() => socket.emit('select_option', 'evolve')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
                进化
              </button>
            )}
            {gameState.canHire && (
              <button onClick={() => socket.emit('select_option', 'hire')} className="px-4 py-2 bg-pink-600 hover:bg-pink-600 text-white rounded-lg font-bold">
                雇佣
              </button>
            )}
            <button onClick={() => socket.emit('select_option', 'buy')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold">
              购买
            </button>
            {gameState.tokens.some(t => t && (() => {
              const c = gameState.tableCards.find(tc => tc && tc.id === t.boundToCardId);
              const isMine = c && ((gameState.seats[0] === playerId && c.y > 0) || (gameState.seats[1] === playerId && c.y < 0));
              if (!isMine) return false;
              const isAlive = !gameState.counters.some(counter => counter && counter.type === 'time' && counter.boundToCardId === t.boundToCardId);
              if (!isAlive) return false;
              const hex = pixelToHex(t.x, t.y);
              const mc = gameState.magicCircles?.find(m => m.q === hex.q && m.r === hex.r);
              return mc && mc.state === 'idle';
            })()) && (
              <button onClick={() => socket.emit('select_option', 'chant')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
                咏唱
              </button>
            )}
            
            {playedCard && playedCard.type === 'action' && playedCard.name !== '防御' && (
              <>
                {playedCard.name === '间谍' ? (
                  <button onClick={() => socket.emit('select_option', 'spy')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold">
                    间谍
                  </button>
                ) : playedCard.name === '冲刺' ? (
                  <button onClick={() => socket.emit('select_option', 'sprint')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
                    冲刺
                  </button>
                ) : playedCard.name === '回复' ? (
                  <button onClick={() => socket.emit('select_option', 'heal')} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold">
                    回复
                  </button>
                ) : (
                  <>
                    <button onClick={() => socket.emit('select_option', 'move')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold">
                      移动
                    </button>
                    <button onClick={() => socket.emit('select_option', 'attack')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">
                      攻击
                    </button>
                    <button onClick={() => socket.emit('select_option', 'skill')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold">
                      技能
                    </button>
                    {gameState.tokens.some(t => t && (() => {
                      const c = gameState.tableCards.find(tc => tc && tc.id === t.boundToCardId);
                      const isMine = c && ((gameState.seats[0] === playerId && c.y > 0) || (gameState.seats[1] === playerId && c.y < 0));
                      if (!isMine) return false;
                      const isAlive = !gameState.counters.some(counter => counter && counter.type === 'time' && counter.boundToCardId === t.boundToCardId);
                      if (!isAlive) return false;
                      const hex = pixelToHex(t.x, t.y);
                      const mc = gameState.magicCircles?.find(m => m.q === hex.q && m.r === hex.r);
                      return mc && mc.state === 'chanting' && mc.chantingTokenId === t.id;
                    })()) && (
                      <button onClick={() => socket.emit('select_option', 'fire')} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold">
                        开火
                      </button>
                    )}
                    {gameState.tokens.some(t => t && (() => {
                      const c = gameState.tableCards.find(tc => tc && tc.id === t.boundToCardId);
                      const isMine = c && ((gameState.seats[0] === playerId && c.y > 0) || (gameState.seats[1] === playerId && c.y < 0));
                      if (!isMine) return false;
                      const isAlive = !gameState.counters.some(counter => counter && counter.type === 'time' && counter.boundToCardId === t.boundToCardId);
                      if (!isAlive) return false;
                      const hex = pixelToHex(t.x, t.y);
                      return gameState.map?.turrets?.some(tu => tu.q === hex.q && tu.r === hex.r);
                    })()) && (
                      <button onClick={() => socket.emit('select_option', 'turret_attack')} className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg font-bold">
                        炮台攻击
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        );
      } else if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
        return (
          <div className="flex gap-4">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
            <button onClick={() => socket.emit('finish_resolve')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
              结束结算
            </button>
          </div>
        );
      } else if (gameState.selectedOption === 'evolve') {
        const evolvableHeroes = gameState.tableCards.filter(c => c && gameState.evolvableHeroIds?.includes(c.id));
        
        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="flex gap-2 flex-wrap justify-center">
              {evolvableHeroes.map(hero => (
                <button 
                  key={hero.id}
                  onClick={() => socket.emit('select_target', hero.id)}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${gameState.selectedTargetId === hero.id ? 'bg-blue-500 text-white ring-2 ring-white' : 'bg-blue-900/50 text-blue-200 hover:bg-blue-800'}`}
                >
                  {hero.heroClass} (Lv{hero.level} {'->'} Lv{hero.level! + 1})
                </button>
              ))}
            </div>
            <div className="flex gap-4 flex-wrap justify-center">
              <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
                撤回
              </button>
            </div>
          </div>
        );
      } else if (gameState.selectedOption === 'hire') {
        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择雇佣费用 (Select hire cost)</div>
            <div className="flex gap-2 flex-wrap justify-center">
              {[2, 3, 4, 5, 6, 7, 8, 9].map(cost => (
                <button 
                  key={cost}
                  onClick={() => socket.emit('select_hire_cost', cost)}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${!gameState.selectedTargetId ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : gameState.selectedHireCost === cost ? 'bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-500/50' : 'bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800'}`}
                  disabled={!gameState.selectedTargetId}
                >
                  {cost} 金币
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
                撤回
              </button>
            </div>
          </div>
        );
      } else if (gameState.selectedOption === 'heal') {
        const healableHeroes = gameState.tableCards.filter(c => c && gameState.healableHeroIds?.includes(c.id));
        
        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="flex gap-2 flex-wrap justify-center">
              {healableHeroes.map(hero => (
                <button 
                  key={hero.id}
                  onClick={() => socket.emit('select_target', hero.id)}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${gameState.selectedTargetId === hero.id ? 'bg-green-500 text-white ring-2 ring-white' : 'bg-green-900/50 text-green-200 hover:bg-green-800'}`}
                >
                  {hero.heroClass} (HP: {hero.damage && hero.damage > 0 ? `-${hero.damage}` : 'Full'})
                </button>
              ))}
            </div>
            <div className="flex gap-4 flex-wrap justify-center">
              <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
                撤回
              </button>
            </div>
          </div>
        );
      } else if (gameState.selectedOption === 'chant' || gameState.selectedOption === 'fire') {
        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">
              {gameState.selectedOption === 'chant' ? '请选择在魔法阵上的己方英雄 (Select your hero on a magic circle)' : '请选择正在咏唱的己方英雄 (Select your chanting hero)'}
            </div>
            <div className="flex gap-4">
              <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
                撤回
              </button>
            </div>
          </div>
        );
      } else if (gameState.selectedOption === 'attack' || gameState.selectedOption === 'turret_attack') {
        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">
              {gameState.selectedTokenId ? '请点击高亮的攻击目标 (Click a highlighted target)' : '请选择己方英雄 (Select your hero)'}
            </div>
            <div className="flex gap-4">
              <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
                撤回
              </button>
            </div>
          </div>
        );
      } else {
        return (
          <div className="flex gap-4">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
            <button onClick={() => socket.emit('finish_resolve')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
              完成结算
            </button>
          </div>
        );
      }
    }
    if ((gameState.phase as string) === 'action_select_card') {
      return (
        <div className="flex flex-col gap-4 items-center">
          <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择一张手牌增强行动 (Select a card to enhance action)</div>
          <div className="flex gap-4">
            <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              返回 (Back)
            </button>
          </div>
        </div>
      );
    }
    if ((gameState.phase as string) === 'action_options') {
      return (
        <div className="flex flex-col gap-4 items-center w-full max-w-md">
          <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-center">请选择行动方式 (Select action type)</div>
          <div className="grid grid-cols-2 gap-2 w-full">
            <button onClick={() => socket.emit('select_action_category', 'play_card')} className="px-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm">打出手牌增强</button>
            <button onClick={() => socket.emit('select_action_category', 'direct_action')} className="px-2 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm">直接行动</button>
            <button onClick={() => socket.emit('select_action_category', 'common_action')} className="px-2 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-sm">通用动作</button>
            <button onClick={() => socket.emit('select_action_category', 'pass')} className="px-2 py-3 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold text-sm">跳过 (Pass)</button>
          </div>
          <button onClick={() => socket.emit('cancel_action_token')} className="w-full py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg font-bold border border-red-500/30 text-sm">取消 (Cancel)</button>
        </div>
      );
    }
    if ((gameState.phase as string) === 'action_select_hero') {
      return (
        <div className="flex flex-col gap-4 items-center">
          <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择一个英雄进行行动 (Select a hero)</div>
          <div className="flex gap-2 flex-wrap justify-center">
            {gameState.tokens
              .filter(t => t.boundToCardId && ((playerIndex === 0 && t.y > 0) || (playerIndex === 1 && t.y < 0)))
              .map(hero => {
                const heroCard = gameState.tableCards.find(c => c.id === hero.boundToCardId);
                return (
                  <button 
                    key={hero.id}
                    onClick={() => socket.emit('select_hero_for_action', hero.id)} 
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold"
                  >
                    {heroCard?.heroClass || '英雄'}
                  </button>
                );
              })}
            <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg font-bold border border-red-500/30">取消 (Cancel)</button>
          </div>
        </div>
      );
    }
    if ((gameState.phase as string) === 'action_select_substitute') {
      return (
        <div className="flex flex-col gap-4 items-center">
          <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择另一个英雄替代行动 (Select substitute hero)</div>
          <div className="flex gap-2 flex-wrap justify-center">
            {gameState.tokens
              .filter(t => t.boundToCardId && ((playerIndex === 0 && t.y > 0) || (playerIndex === 1 && t.y < 0)) && t.id !== gameState.activeHeroTokenId)
              .map(hero => {
                const heroCard = gameState.tableCards.find(c => c.id === hero.boundToCardId);
                return (
                  <button 
                    key={hero.id}
                    onClick={() => socket.emit('select_hero_for_action', hero.id)} 
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold"
                  >
                    {heroCard?.heroClass || '英雄'}
                  </button>
                );
              })}
            <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg font-bold border border-red-500/30">取消 (Cancel)</button>
          </div>
        </div>
      );
    }
    if ((gameState.phase as string) === 'action_select_action') {
      const selectedToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
      const boundCard = selectedToken?.boundToCardId ? 
        Object.values(gameState.players).flatMap(p => p.hand).find(c => c.id === selectedToken.boundToCardId) ||
        gameState.tableCards.find(c => c.id === selectedToken.boundToCardId)
        : null;
      const heroClass = boundCard?.heroClass || selectedToken?.label?.split(' ')[0];
      const level = boundCard?.level || selectedToken?.lv || 1;
      const heroData = heroClass ? HEROES_DATABASE.heroes.find(h => h.name === heroClass) : null;
      const levelData = heroData ? heroData.levels[level.toString()] : null;

      return (
        <div className="flex flex-col gap-4 items-center w-full max-w-md">
          <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-center">
            请选择 {heroClass} (Lv.{level}) 的行动类型
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <button onClick={() => socket.emit('select_hero_action', 'move')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm">移动 (Move)</button>
            <button onClick={() => socket.emit('select_hero_action', 'attack')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-sm">攻击 (Attack)</button>
            <button onClick={() => socket.emit('select_hero_action', 'skill')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm">技能 (Skill)</button>
            <button onClick={() => socket.emit('select_hero_action', 'evolve')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-sm">进化 (Evolve)</button>
            <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold text-sm">返回 (Back)</button>
          </div>
          {levelData && levelData.skills.length > 0 && (
            <div className="bg-black/60 p-3 rounded-lg border border-purple-500/30 w-full">
              <div className="text-purple-300 text-xs font-bold mb-2 uppercase tracking-wider">当前技能 (Current Skills)</div>
              <div className="flex flex-col gap-2">
                {levelData.skills.map((skill, idx) => (
                  <div key={idx} className="text-white text-xs">
                    <span className="font-bold text-purple-400">【{skill.name}】</span>: {skill.description}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    if ((gameState.phase as string) === 'action_common') {
      return (
        <div className="flex flex-col gap-4 items-center w-full max-w-md">
          <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-center">请选择通用动作 (Select common action)</div>
          <div className="flex gap-2 flex-wrap justify-center">
            <button onClick={() => socket.emit('select_common_action', 'open_chest')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-sm">开启宝箱</button>
            <button onClick={() => socket.emit('select_common_action', 'early_buy')} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold text-sm">提前购买</button>
            <button onClick={() => socket.emit('select_common_action', 'seize_initiative')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm">抢占先手</button>
            <button onClick={() => socket.emit('select_common_action', 'recruit')} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-bold text-sm">招募英雄</button>
            <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold text-sm">返回 (Back)</button>
          </div>
        </div>
      );
    }
    if (gameState.phase === 'action_defend') {
      const hasDefenseCard = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
      if (hasDefenseCard) {
        return (
          <div className="flex gap-4">
            <button onClick={() => socket.emit('declare_defend')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
              确认防御
            </button>
            <button onClick={() => socket.emit('declare_counter')} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold">
              确认反击
            </button>
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
          </div>
        );
      }
      return (
        <div className="flex gap-4">
          <button onClick={() => socket.emit('declare_defend')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
            防御
          </button>
          <button onClick={() => socket.emit('pass_defend')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
            Pass
          </button>
        </div>
      );
    }
    if (gameState.phase === 'action_play_defense' || gameState.phase === 'action_play_counter') {
      return (
        <button onClick={() => socket.emit('cancel_defend_or_counter')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
          撤回 (Cancel)
        </button>
      );
    }
    if (gameState.phase === 'action_resolve_attack') {
      return (
        <button onClick={() => socket.emit('end_resolve_attack')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
          结束结算
        </button>
      );
    }
    if (gameState.phase === 'action_resolve_attack_counter') {
      return (
        <button onClick={() => socket.emit('end_resolve_attack_counter')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
          结束结算
        </button>
      );
    }
    if (gameState.phase === 'action_resolve_counter') {
      return (
        <button onClick={() => socket.emit('end_resolve_counter')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
          结束结算
        </button>
      );
    }
    if (gameState.phase === 'shop') {
      if (gameState.selectedOption === 'hire') {
        const goldY = isPlayer1 ? 550 : -700;
        const goldCounter = gameState.counters.find(c => c.type === 'gold' && Math.abs(c.y - goldY) < 100);
        const maxGold = goldCounter ? goldCounter.value : 0;
        const costs = [2, 3, 4, 5].filter(c => c <= maxGold);

        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="text-white font-bold">请选择雇佣成本 (Select hire cost)</div>
            <div className="flex gap-2">
              {costs.map(cost => (
                <button 
                  key={cost} 
                  onClick={() => socket.emit('select_hire_cost', cost)}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${gameState.selectedHireCost === cost ? 'bg-pink-500 text-white scale-110 shadow-lg shadow-pink-500/50' : 'bg-pink-900/50 text-pink-200 hover:bg-pink-800'}`}
                >
                  {cost} 金币
                </button>
              ))}
            </div>
            <button onClick={() => socket.emit('select_option', null)} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              取消 (Cancel)
            </button>
          </div>
        );
      }
      return (
        <div className="flex gap-4">
          <button onClick={() => socket.emit('select_option', 'buy')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold">
            购买
          </button>
          <button onClick={() => socket.emit('select_option', 'hire')} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-bold">
            雇佣
          </button>
          <button onClick={() => socket.emit('pass_shop')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
            Pass
          </button>
        </div>
      );
    }
    if (gameState.phase === 'discard') {
      const myPlayer = gameState.players[playerId];
      if (myPlayer) {
        return (
          <div className="flex flex-col gap-4 items-center">
            {myPlayer.hand.length > 5 ? (
              <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请弃牌至5张以下 (Discard down to 5 cards)</div>
            ) : (
              <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">手牌已就绪，请点击结束弃牌</div>
            )}
            <div className="flex gap-4">
              <button 
                onClick={() => socket.emit('undo_discard')} 
                disabled={myPlayer.discardFinished}
                className={`px-4 py-2 rounded-lg font-bold ${myPlayer.discardFinished ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-zinc-600 hover:bg-zinc-500 text-white'}`}
              >
                撤回弃牌
              </button>
              <button 
                onClick={() => socket.emit('finish_discard')} 
                disabled={myPlayer.hand.length > 5 || myPlayer.discardFinished}
                className={`px-4 py-2 rounded-lg font-bold ${myPlayer.hand.length > 5 || myPlayer.discardFinished ? 'bg-zinc-500 text-zinc-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
              >
                结束弃牌
              </button>
            </div>
          </div>
        );
      } else {
        return (
          <div className="text-white font-bold bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">等待对方弃牌... (Waiting for opponent...)</div>
        );
      }
    }
    if (gameState.phase === 'supply' || gameState.phase === 'end') {
      return (
        <button onClick={() => socket.emit('proceed_phase')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold">
          继续 (Proceed)
        </button>
      );
    }
    return null;
  };

  const handleHexClick = (q: number, r: number) => {
    if (gameState.phase === 'setup' && isActivePlayer) {
      if (selectedHeroCardId) {
        const playerCastles = gameState.map?.castles[playerIndex as 0 | 1] || CASTLES[playerIndex as 0 | 1];
        const castleIdx = playerCastles.findIndex(c => c.q === q && c.r === r);
        if (castleIdx !== -1) {
          socket.emit('play_card', { cardId: selectedHeroCardId, targetCastleIndex: castleIdx });
          setSelectedHeroCardId(null);
        }
      }
      return;
    }

    if ((gameState.phase === 'shop' || gameState.phase === 'action_select_option') && isActivePlayer) {
      if ((gameState.phase === 'shop' && (selectedHireCardId || gameState.selectedTargetId) && gameState.selectedHireCost) || 
          (gameState.phase === 'action_select_option' && gameState.selectedOption === 'hire' && gameState.selectedTargetId && gameState.selectedHireCost)) {
        const playerCastles = gameState.map?.castles[playerIndex as 0 | 1] || CASTLES[playerIndex as 0 | 1];
        const castleIdx = playerCastles.findIndex(c => c.q === q && c.r === r);
        if (castleIdx !== -1) {
          const hireCardId = selectedHireCardId || gameState.selectedTargetId;
          const goldAmount = gameState.selectedHireCost;
          socket.emit('hire_hero', { cardId: hireCardId, goldAmount, targetCastleIndex: castleIdx });
          if (gameState.phase === 'shop') setSelectedHireCardId(null);
          return;
        }
      }
      if (gameState.phase === 'shop') return;
    }

    if (gameState.phase === 'revival' && isActivePlayer) {
      const pending = gameState.pendingRevivals?.find(r => r.playerIndex === playerIndex);
      if (pending) {
        const playerCastles = gameState.map?.castles[playerIndex as 0 | 1] || CASTLES[playerIndex as 0 | 1];
        const castleIdx = playerCastles.findIndex(c => c.q === q && c.r === r);
        if (castleIdx !== -1) {
          socket.emit('revive_hero', { heroCardId: pending.heroCardId, targetCastleIndex: castleIdx });
        }
      }
      return;
    }

    if (gameState.phase === 'action_resolve' && isActivePlayer && gameState.activeActionType === 'move' && gameState.selectedTokenId) {
      socket.emit('move_token_to_cell', { q, r });
      return;
    }

    if (gameState.phase === 'action_resolve' && isActivePlayer && gameState.activeActionType === 'attack' && gameState.selectedTokenId) {
      console.log(`handleHexClick (attack): q=${q}, r=${r}`);
      // Find target at this hex
      const monster = gameState.map?.monsters?.find(m => m.q === q && m.r === r);
      if (monster) {
        console.log(`Emitting select_target for monster at ${q},${r}`);
        socket.emit('select_target', `monster_${monster.q}_${monster.r}`);
        return;
      }

      const isCastle = gameState.map ? 
        (gameState.map.castles[0]?.some((c: any) => c.q === q && c.r === r) || gameState.map.castles[1]?.some((c: any) => c.q === q && c.r === r)) :
        ((q === 0 && r === 4) || (q === 4 && r === 0) || (q === 0 && r === -4) || (q === -4 && r === 0));
      
      if (isCastle) {
        console.log(`Emitting select_target for castle at ${q},${r}`);
        socket.emit('select_target', `castle_${q}_${r}`);
        return;
      }

      const targetToken = gameState.tokens.find(t => {
        const hex = pixelToHex(t.x, t.y);
        return hex.q === q && hex.r === r;
      });
      if (targetToken && targetToken.boundToCardId) {
        console.log(`Emitting select_target for token ${targetToken.id} (card ${targetToken.boundToCardId})`);
        socket.emit('select_target', targetToken.boundToCardId);
      } else {
        const targetCard = gameState.tableCards.find(c => {
          const hex = pixelToHex(c.x, c.y);
          return hex.q === q && hex.r === r;
        });
        if (targetCard) {
          console.log(`Emitting select_target for card ${targetCard.id}`);
          socket.emit('select_target', targetCard.id);
        }
      }
      return;
    }

    if (gameState.phase === 'action_select_option' && isActivePlayer && gameState.selectedTokenId) {
      if (gameState.selectedOption === 'attack' || gameState.selectedOption === 'turret_attack') {
        console.log(`handleHexClick (attack option): q=${q}, r=${r}`);
        // Find target at this hex
        const monster = gameState.map?.monsters?.find(m => m.q === q && m.r === r);
        if (monster) {
          console.log(`Emitting select_target for monster at ${q},${r}`);
          socket.emit('select_target', `monster_${monster.q}_${monster.r}`);
          return;
        }

        const isCastle = gameState.map ? 
          (gameState.map.castles[0]?.some((c: any) => c.q === q && c.r === r) || gameState.map.castles[1]?.some((c: any) => c.q === q && c.r === r)) :
          ((q === 0 && r === 4) || (q === 4 && r === 0) || (q === 0 && r === -4) || (q === -4 && r === 0));
        
        if (isCastle) {
          console.log(`Emitting select_target for castle at ${q},${r}`);
          socket.emit('select_target', `castle_${q}_${r}`);
          return;
        }

        const targetToken = gameState.tokens.find(t => {
          const hex = pixelToHex(t.x, t.y);
          return hex.q === q && hex.r === r;
        });
        if (targetToken && targetToken.boundToCardId) {
          console.log(`Emitting select_target for token ${targetToken.id} (card ${targetToken.boundToCardId})`);
          socket.emit('select_target', targetToken.boundToCardId);
        } else {
          const targetCard = gameState.tableCards.find(c => {
            const hex = pixelToHex(c.x, c.y);
            return hex.q === q && hex.r === r;
          });
          if (targetCard) {
            console.log(`Emitting select_target for card ${targetCard.id}`);
            socket.emit('select_target', targetCard.id);
          }
        }
      } else {
        socket.emit('move_token_to_cell', { q, r });
      }
    }
  };

  const handleTokenClick = (id: string) => {
    if (isActivePlayer) {
      if (gameState.phase === 'action_select_hero' || gameState.phase === 'action_select_substitute') {
        socket.emit('select_hero_for_action', id);
        return;
      }
      if (gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack') {
        const token = gameState.tokens.find(t => t.id === id);
        if (token && token.boundToCardId) {
          console.log(`handleTokenClick (attack): token ${id}, card ${token.boundToCardId}`);
          socket.emit('select_target', token.boundToCardId);
          return;
        }
      }
      if (gameState.phase === 'action_select_option') {
        if ((gameState.selectedOption === 'attack' || gameState.selectedOption === 'turret_attack') && gameState.selectedTokenId) {
          const token = gameState.tokens.find(t => t.id === id);
          if (token && token.boundToCardId) {
            const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
            const isEnemy = card && ((playerIndex === 0 && card.y < 0) || (playerIndex === 1 && card.y > 0));
            if (isEnemy) {
              console.log(`handleTokenClick (attack option): emitting select_target for enemy token ${id}, card ${token.boundToCardId}`);
              socket.emit('select_target', token.boundToCardId);
              return;
            }
          }
        }

        if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint' || gameState.selectedOption === 'attack' || gameState.selectedOption === 'chant' || gameState.selectedOption === 'fire' || gameState.selectedOption === 'turret_attack') {
          socket.emit('select_token', id);
        }
      }
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-[#1e1e24] relative touch-none" onContextMenu={(e) => e.preventDefault()}>
      {errorMsg && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl z-[300] font-bold animate-bounce pointer-events-none">
          {errorMsg}
        </div>
      )}

      {/* Prompt Area */}
      {gameState.gameStarted && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto flex flex-col items-center gap-2">
          {!isPromptHidden ? (
            <div className="bg-zinc-800/90 border border-zinc-700 rounded-xl p-4 shadow-2xl flex flex-col items-center gap-2 backdrop-blur-sm min-w-[300px] max-w-[80vw] text-center relative">
              <button 
                onClick={() => setIsPromptHidden(true)}
                className="absolute top-2 right-2 text-zinc-400 hover:text-white"
                title="隐藏提示 (Hide Prompt)"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
              <div className={`text-lg font-bold whitespace-pre-line ${gameState.activePlayerIndex === 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {gameState.notification ? (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-indigo-300">{gameState.notification}</p>
                    <button 
                      onClick={() => socket.emit('clear_notification')}
                      className="px-8 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
                    >
                      确定 (Confirm)
                    </button>
                  </div>
                ) : getPromptText()}
              </div>
              {!gameState.notification && (
                <div className="flex gap-4 mt-2">
                  {getPromptButtons()}
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={() => setIsPromptHidden(false)}
              className="bg-zinc-800/90 border border-zinc-700 rounded-full px-4 py-2 shadow-lg backdrop-blur-sm text-zinc-300 hover:text-white font-bold text-sm"
            >
              显示提示 (Show Prompt)
            </button>
          )}
        </div>
      )}

      {/* Spectator Join Button */}
      {gameState.gameStarted && playerIndex === -1 && !showJoinOverlay && (
        <button 
          onClick={() => setShowJoinOverlay(true)}
          className="absolute top-20 right-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg z-50 pointer-events-auto"
        >
          加入游戏 (Join Game)
        </button>
      )}

      {/* Start Game Overlay */}
      {(!gameState.gameStarted || showJoinOverlay) && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[200] pointer-events-auto backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-6 relative">
            {gameState.notification && !gameState.gameStarted && (
              <div className="text-xl font-bold text-emerald-400 text-center mb-4 animate-pulse">
                {gameState.notification}
              </div>
            )}
            {gameState.gameStarted && (
              <button 
                onClick={() => setShowJoinOverlay(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
            <h2 className="text-2xl font-bold text-white text-center">欢迎进行勇者之争桌游1.0测试</h2>
            
            <div className="w-full flex flex-col gap-3">
              <div className="flex flex-col gap-2 mb-2">
                <label className="text-zinc-400 text-sm">输入名称 (Enter Name):</label>
                <input 
                  type="text" 
                  value={playerNameInput}
                  onChange={(e) => setPlayerNameInput(e.target.value)}
                  placeholder="Your Name"
                  className="bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-lg outline-none focus:border-indigo-500"
                />
              </div>
              {[0, 1, 2, 3].map((seatIndex) => {
                const occupantId = gameState.seats?.[seatIndex];
                const isMe = occupantId === playerId;
                const isOccupied = occupantId !== null;
                const occupantName = isOccupied ? gameState.players[occupantId]?.name || 'Player' : '';

                return (
                  <div key={seatIndex} className="flex items-center justify-between bg-zinc-800 p-3 rounded-xl border border-zinc-700">
                    <span className="text-zinc-300 font-medium">玩家 {seatIndex + 1}</span>
                    {isOccupied ? (
                      <div className="flex items-center gap-3">
                        <span className="text-indigo-400 text-sm">{isMe ? '你 (You)' : occupantName}</span>
                        {isMe && (
                          <button 
                            onClick={() => socket.emit('leave_seat')}
                            className="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
                          >
                            离开 (Leave)
                          </button>
                        )}
                        {!isMe && occupantId?.startsWith('bot_') && (
                          <button 
                            onClick={() => socket.emit('remove_bot', { seatIndex })}
                            className="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
                          >
                            取消 AI (Cancel AI)
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            if (!playerNameInput.trim()) {
                              setErrorMsg("请输入名称 (Please enter a name)");
                              setTimeout(() => setErrorMsg(null), 3000);
                              return;
                            }
                            socket.emit('sit_down', { seatIndex, playerName: playerNameInput.trim() });
                            if (gameState.gameStarted) {
                              setShowJoinOverlay(false);
                            }
                          }}
                          className="px-4 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors"
                        >
                          坐下 (Sit)
                        </button>
                        <div className="flex bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700">
                          {[0, 1, 2].map(diff => (
                            <button
                              key={diff}
                              onClick={() => socket.emit('add_bot', { seatIndex, difficulty: diff })}
                              className="px-2 py-1 hover:bg-indigo-600 text-zinc-400 hover:text-white text-xs transition-colors border-r border-zinc-700 last:border-r-0"
                              title={`添加难度 ${diff} 电脑`}
                            >
                              AI{diff}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!gameState.gameStarted && (
              <button 
                onClick={() => socket.emit(gameState.notification?.includes('游戏结束') ? 'reset_game' : 'start_game')}
                className="w-full py-3 mt-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-lg font-bold shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all"
              >
                {gameState.notification?.includes('游戏结束') ? '重置游戏 (Reset Game)' : '确定 (Start Game)'}
              </button>
            )}
          </div>
        </div>
      )}

      <Stage 
        width={size.width} 
        height={size.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        draggable
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onClick={() => setMenu(null)}
        onTap={() => setMenu(null)}
      >
        <HexGridLayer 
          onHexContextMenu={handleHexContextMenu} 
          reachableCells={gameState.reachableCells}
          onHexClick={handleHexClick}
          selectedOption={gameState.selectedOption}
          magicCircles={gameState.magicCircles}
          selectedHeroCardId={selectedHeroCardId}
          selectedHireCardId={selectedHireCardId}
          playerIndex={playerIndex}
          phase={gameState.phase}
          pendingRevivals={gameState.pendingRevivals}
          mapConfig={gameState.map}
          activeActionType={gameState.activeActionType}
        />
        
        <Layer>
          {/* First Player Token */}
          {gameState.gameStarted && (
            <Group x={-200} y={gameState.firstPlayerIndex === 0 ? 550 : -700}>
              <Circle radius={20} fill="#f59e0b" stroke="#b45309" strokeWidth={4} />
              <Text text="1st" fill="white" fontSize={16} fontStyle="bold" x={-12} y={-8} />
            </Group>
          )}

          {/* Zones UI */}
          <Group x={120} y={-530}>
            <Rect width={700} height={200} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" strokeWidth={2} dash={[10, 5]} cornerRadius={10} />
            <Text text="雇佣区 (Hire Area)" fill="rgba(255,255,255,0.2)" width={700} align="center" y={10} fontSize={20} fontStyle="bold" />
          </Group>

          <Group x={800} y={400}>
            <Rect width={200} height={200} fill="rgba(239,68,68,0.05)" stroke="rgba(239,68,68,0.2)" strokeWidth={2} dash={[10, 5]} cornerRadius={10} />
            <Text text="除外区 (Exclusion)" fill="rgba(239,68,68,0.3)" width={200} align="center" y={90} fontSize={16} fontStyle="bold" />
          </Group>

          {/* Decks */}
          <DeckNode x={-500} y={-200} type="treasure1" count={gameState.decks.treasure1.length} socket={socket} label="t1" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_t1.png`} onContextMenu={handleDeckContextMenu} />
          <DeckNode x={-500} y={0} type="treasure2" count={gameState.decks.treasure2.length} socket={socket} label="t2" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8Ct2.png`} onContextMenu={handleDeckContextMenu} />
          <DeckNode x={-500} y={200} type="treasure3" count={gameState.decks.treasure3.length} socket={socket} label="t3" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_t3.png`} onContextMenu={handleDeckContextMenu} />
          
          <DeckNode x={450} y={-100} type="action" count={gameState.decks.action.length} socket={socket} label="公共牌堆" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_%E5%85%AC%E5%85%B1%E7%89%8C%E5%A0%86.png`} onContextMenu={handleDeckContextMenu} />
          {gameState.decks.hero.length > 0 && (
            <DeckNode x={450} y={300} type="hero" count={gameState.decks.hero.length} socket={socket} label="英雄牌堆" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv1.png`} onContextMenu={handleDeckContextMenu} />
          )}
          
          {/* Discard Pile */}
          <DeckNode x={450} y={100} type="discard_action" count={gameState.discardPiles.action.length} socket={socket} label="弃牌堆" onContextMenu={handleDeckContextMenu} />

          {/* Hand Size Display */}
          {gameState.seats[0] && gameState.players[gameState.seats[0]] && (
            <Group x={0} y={450}>
              <Rect width={250} height={40} fill="rgba(0,0,0,0.5)" cornerRadius={20} x={-125} />
              <Text 
                text={`玩家 1 手牌: ${gameState.players[gameState.seats[0]].hand.length} | 英雄: ${gameState.tableCards.filter(c => c.type === 'hero' && Math.abs(c.y - 550) < 100).length} | 王城血量: ${gameState.castleHP[0] || 0} | 声望: ${gameState.reputation[0] || 0}`} 
                fill="white" 
                width={300} 
                align="center" 
                y={12} 
                fontSize={16} 
                fontStyle="bold" 
                x={-150}
              />
            </Group>
          )}
          {gameState.seats[1] && gameState.players[gameState.seats[1]] && (
            <Group x={0} y={-450}>
              <Rect width={250} height={40} fill="rgba(0,0,0,0.5)" cornerRadius={20} x={-125} />
              <Text 
                text={`玩家 2 手牌: ${gameState.players[gameState.seats[1]].hand.length} | 英雄: ${gameState.tableCards.filter(c => c.type === 'hero' && Math.abs(c.y - -700) < 100).length} | 王城血量: ${gameState.castleHP[1] || 0} | 声望: ${gameState.reputation[1] || 0}`} 
                fill="white" 
                width={300} 
                align="center" 
                y={12} 
                fontSize={16} 
                fontStyle="bold" 
                x={-150}
              />
            </Group>
          )}

          {gameState.tableCards.map(card => card && (
            <CardNode 
              key={card.id} 
              card={card} 
              socket={socket} 
              onContextMenu={handleCardContextMenu} 
              onZoom={setZoomedCard} 
              onClick={(id) => {
                if ((gameState.phase === 'action_select_option' || (gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack')) && isActivePlayer) {
                  socket.emit('select_target', id);
                }
              }}
              isSelected={gameState.selectedTargetId === card.id}
              lastEvolvedId={gameState.lastEvolvedId}
            />
          ))}

          {gameState.hireAreaCards.map(card => card && (
            <CardNode 
              key={card.id} 
              card={card} 
              socket={socket} 
              onContextMenu={handleCardContextMenu} 
              onZoom={setZoomedCard} 
              onClick={(id) => {
                if (gameState.phase === 'shop' && isActivePlayer) {
                  if (gameState.selectedOption === 'hire') {
                    socket.emit('select_target', id);
                  } else {
                    setSelectedHireCardId(id === selectedHireCardId ? null : id);
                  }
                } else if ((gameState.phase === 'action_select_option' || (gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack')) && isActivePlayer) {
                  socket.emit('select_target', id);
                }
              }}
              isSelected={gameState.selectedTargetId === card.id || selectedHireCardId === card.id}
              lastEvolvedId={gameState.lastEvolvedId}
            />
          ))}
          
          {gameState.playAreaCards?.map(card => card && (
            <CardNode 
              key={card.id} 
              card={card} 
              socket={socket} 
              onContextMenu={handleCardContextMenu} 
              onZoom={setZoomedCard} 
              onClick={(id) => {
                if ((gameState.phase === 'action_select_option' || (gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack')) && isActivePlayer) {
                  socket.emit('select_target', id);
                }
              }}
              isSelected={gameState.selectedTargetId === card.id}
              lastEvolvedId={gameState.lastEvolvedId}
            />
          ))}
          
          {gameState.actionTokens?.map(token => (
            <ActionTokenNode
              key={token.id}
              token={token}
              onClick={(id) => socket.emit('click_action_token', id)}
              isMyTurn={isActivePlayer}
              isSelected={gameState.activeActionTokenId === token.id}
            />
          ))}

          {gameState.tokens.map(token => {
            if (!token) return null;
            const isSelected = gameState.selectedTokenId === token.id;
            const isMyToken = (() => {
              if (!token.boundToCardId) return false;
              const card = gameState.tableCards.find(c => c && c.id === token.boundToCardId);
              if (!card) return false;
              const isPlayer1 = gameState.seats[0] === playerId;
              const isPlayer2 = gameState.seats[1] === playerId;
              return (isPlayer1 && card.y > 0) || (isPlayer2 && card.y < 0);
            })();

            return (
              <TokenNode 
                key={token.id} 
                token={token} 
                socket={socket} 
                onClick={handleTokenClick}
                onHexClick={handleHexClick}
                isMyToken={isMyToken}
                isSelected={isSelected}
                draggable={!gameState.gameStarted || (!gameState.selectedOption && !gameState.selectedTokenId && isMyToken)}
                lastEvolvedId={gameState.lastEvolvedId}
              />
            );
          })}
          
          {gameState.counters.map(counter => counter && (
            <CounterNode key={counter.id} counter={counter} socket={socket} />
          ))}

          <HistoryLogGroup logs={gameState.logs || []} isVisible={isHistoryVisible} position={historyPos} onDragEnd={setHistoryPos} />
        </Layer>
      </Stage>

      {/* Context Menu */}
      {menu && (
        <div 
          className="absolute bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[120px]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.type === 'hex' ? (
            <button 
              className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
              onClick={() => { 
                socket.emit('add_counter', { type: 'time', x: menu.targetX, y: menu.targetY, value: 0 }); 
                setMenu(null); 
              }}
            >
              添加时间指示物 (Add Time Counter)
            </button>
          ) : menu.type === 'deck' ? (
            <>
              <button 
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                onClick={() => { socket.emit('draw_card', menu.targetId); setMenu(null); }}
              >
                抽到手牌 (Draw to Hand)
              </button>
              <button 
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                onClick={() => { socket.emit('shuffle_deck', menu.targetId); setMenu(null); }}
              >
                洗牌 (Shuffle)
              </button>
            </>
          ) : (
            <>
              <button 
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                onClick={() => { socket.emit('flip_card', menu.targetId); setMenu(null); }}
              >
                反转 (Flip)
              </button>
              <button 
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                onClick={() => { socket.emit('take_card_to_hand', menu.targetId); setMenu(null); }}
              >
                加入手牌 (Take)
              </button>
              {(() => {
                const card = [...gameState.tableCards, ...gameState.hireAreaCards, ...(gameState.playAreaCards || [])].filter(Boolean).find(c => c && c.id === menu.targetId);
                if (card && card.type === 'hero' && card.level && card.level < 3) {
                  return (
                    <button 
                      className="w-full text-left px-4 py-2 text-sm text-amber-400 hover:bg-zinc-700 font-bold"
                      onClick={() => { socket.emit('evolve_hero', menu.targetId); setMenu(null); }}
                    >
                      进化 (Evolve)
                    </button>
                  );
                }
                return null;
              })()}
              {(() => {
                const isHireArea = (gameState.hireAreaCards || []).filter(Boolean).some(c => c && c.id === menu.targetId);
                const isPlayer1 = gameState.seats[0] === playerId;
                const isPlayer2 = gameState.seats[1] === playerId;
                const isPlayer = isPlayer1 || isPlayer2;
                const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
                
                const tokenY = playerIndex === 0 ? 311.7 : -311.7;
                const castleHasHero = gameState.tokens.some(t => Math.abs(t.x) < 10 && Math.abs(t.y - tokenY) < 10);
                const isMyTurn = playerIndex === gameState.activePlayerIndex;
                const isCorrectPhase = ['shop', 'action_select_option'].includes(gameState.phase);

                if (isHireArea && isPlayer && !castleHasHero && isMyTurn && isCorrectPhase) {
                  return (
                    <button 
                      className="w-full text-left px-4 py-2 text-sm text-emerald-400 hover:bg-zinc-700 font-bold"
                      onClick={() => { setHirePopup({ cardId: menu.targetId }); setMenu(null); }}
                    >
                      雇佣 (Hire)
                    </button>
                  );
                }
                return null;
              })()}
            </>
          )}
        </div>
      )}

      {/* Hire Popup */}
      {hirePopup && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[300] pointer-events-auto backdrop-blur-sm" onClick={() => setHirePopup(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-2">花费多少金币雇佣？</h3>
            <div className="grid grid-cols-4 gap-3 w-full">
              {[2, 3, 4, 5, 6, 7, 8, 9].map(amount => (
                <button
                  key={amount}
                  className="bg-zinc-800 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg border border-zinc-700 hover:border-emerald-500 transition-colors"
                  onClick={() => {
                    socket.emit('select_option', 'hire');
                    socket.emit('select_target', hirePopup.cardId);
                    socket.emit('select_hire_cost', amount);
                    setHirePopup(null);
                  }}
                >
                  {amount}
                </button>
              ))}
            </div>
            <button 
              className="mt-4 text-zinc-400 hover:text-white text-sm"
              onClick={() => setHirePopup(null)}
            >
              取消 (Cancel)
            </button>
          </div>
        </div>
      )}

      {/* Back Button for Sub-phases - REMOVED as it's now in the prompt area */}

      {/* Withdraw Card Button */}
      {gameState.phase === 'action_select_option' && isActivePlayer && gameState.lastPlayedCardId && (
        <div className="absolute bottom-48 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto">
          <button 
            onClick={() => socket.emit('cancel_play_card')}
            className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold shadow-lg flex items-center gap-2 transition-all"
          >
            <RotateCcw size={18} />
            撤回出牌
          </button>
        </div>
      )}

      {/* Zoom Controls Overlay */}
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

      {/* Explosion Effect Overlay */}
      <AnimatePresence>
        {showExplosion && (
          <div 
            className="absolute z-[1000] pointer-events-none"
            style={{ 
              left: (showExplosion.x * stageScale + stagePos.x), 
              top: (showExplosion.y * stageScale + stagePos.y),
              transform: 'translate(-50%, -50%)'
            }}
          >
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1.2, 2.5], 
                opacity: [0, 1, 0],
                rotate: [0, 45, 90]
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="w-32 h-32 flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-yellow-400 rounded-full blur-xl opacity-50" />
              <div className="absolute inset-4 bg-orange-500 rounded-full blur-lg opacity-70" />
              <div className="absolute inset-8 bg-white rounded-full blur-md" />
              
              {/* Particle sparks */}
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ 
                    x: Math.cos(i * 45 * Math.PI / 180) * 100,
                    y: Math.sin(i * 45 * Math.PI / 180) * 100,
                    opacity: 0,
                    scale: 0
                  }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="absolute w-2 h-2 bg-yellow-200 rounded-full"
                />
              ))}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
