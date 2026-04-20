import React, { useEffect, useRef } from 'react';
import { Group, Circle, Text } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import { Socket } from 'socket.io-client';
import { Token } from '../../shared/types';
import { pixelToHex, hexToPixel } from '../../shared/utils/hexUtils';

interface TokenNodeProps {
  token: Token;
  socket: Socket;
  onClick?: (id: string) => void;
  isSelected?: boolean;
  draggable?: boolean;
  lastEvolvedId?: string | null;
  onHexClick?: (q: number, r: number) => void;
  isMyToken?: boolean;
  hasShield?: boolean;
}

export const TokenNode: React.FC<TokenNodeProps> = ({
  token,
  socket,
  onClick,
  isSelected,
  draggable,
  lastEvolvedId,
  onHexClick,
  isMyToken,
  hasShield
}) => {
  const [image] = useImage(token.image || 'https://image.pollinations.ai/prompt/A%20glowing%20golden%20star%20token%20fantasy%20anime%20art?nologo=true');
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
      {hasShield && (
        <Circle radius={35} stroke="#60a5fa" strokeWidth={4} opacity={0.8} shadowColor="#3b82f6" shadowBlur={15} />
      )}
      {image && (
        <Circle radius={28} fillPatternImage={image} fillPatternScale={{ x: 56 / image.width, y: 56 / image.height }} fillPatternOffset={{ x: image.width / 2, y: image.height / 2 }} />
      )}
      {token.label && (
        <Text text={token.label} fill="white" y={35} x={-40} width={80} align="center" fontSize={12} fontStyle="bold" shadowColor="black" shadowBlur={2} />
      )}
    </Group>
  );
};
