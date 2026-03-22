import React, { useRef } from 'react';
import { Group, Rect, Text, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { Socket } from 'socket.io-client';
import { TableCard } from '../../shared/types';

interface CardNodeProps {
  card: TableCard;
  socket: Socket;
  onContextMenu: (e: any, id: string) => void;
  onZoom: (card: TableCard) => void;
  onClick?: (id: string) => void;
  isSelected?: boolean;
  lastEvolvedId?: string | null;
}

export const CardNode: React.FC<CardNodeProps> = ({
  card,
  socket,
  onContextMenu,
  onZoom,
  onClick,
  isSelected,
  lastEvolvedId
}) => {
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
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
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
};
