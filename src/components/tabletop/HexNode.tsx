import React, { useRef } from 'react';
import { Group, Line, Text } from 'react-konva';
import { HEX_SIZE } from '../../shared/utils/hexUtils';

interface HexNodeProps {
  q: number;
  r: number;
  x: number;
  y: number;
  fill: string;
  icon: string;
  onContextMenu: (e: any, x: number, y: number, clientX?: number, clientY?: number) => void;
  highlightColor?: string;
  onClick?: (q: number, r: number) => void;
  magicCircleState?: string;
}

export const HexNode: React.FC<HexNodeProps> = ({
  q,
  r,
  x,
  y,
  fill,
  icon,
  onContextMenu,
  highlightColor,
  onClick,
  magicCircleState
}) => {
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
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
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
      {icon && <Text x={x - HEX_SIZE / 2} y={y - 12} width={HEX_SIZE} text={icon} fontSize={24} align="center" />}
    </Group>
  );
};
