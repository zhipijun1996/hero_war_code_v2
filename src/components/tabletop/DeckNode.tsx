import React, { useRef } from 'react';
import { Group, Rect, Text, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { Socket } from 'socket.io-client';

interface DeckNodeProps {
  x: number;
  y: number;
  type: string;
  count: number;
  label: string;
  backImage?: string;
  onContextMenu: (e: any, type: string) => void;
  socket: Socket;
}

export const DeckNode: React.FC<DeckNodeProps> = ({
  x,
  y,
  type,
  count,
  label,
  backImage,
  onContextMenu,
  socket
}) => {
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
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
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
};
