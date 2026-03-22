import React from 'react';
import { Group, Circle, Text } from 'react-konva';
import { Socket } from 'socket.io-client';
import { Counter } from '../../shared/types';
import { pixelToHex, hexToPixel } from '../../shared/utils/hexUtils';

interface CounterNodeProps {
  counter: Counter;
  socket: Socket;
}

export const CounterNode: React.FC<CounterNodeProps> = ({
  counter,
  socket
}) => {
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
};
