import React from 'react';
import { Group, Rect, Text } from 'react-konva';
import { GameLog } from '../../shared/types';

interface HistoryLogGroupProps {
  logs: GameLog[];
  isVisible: boolean;
  position: { x: number, y: number };
  onDragEnd: (pos: { x: number, y: number }) => void;
}

export const HistoryLogGroup: React.FC<HistoryLogGroupProps> = ({
  logs,
  isVisible,
  position,
  onDragEnd
}) => {
  if (!isVisible) return null;
  const displayLogs = logs.slice(-18); // Show last 18 logs
  
  return (
    <Group
      x={position.x}
      y={position.y}
      draggable
      onDragEnd={(e) => onDragEnd({ x: e.target.x(), y: e.target.y() })}
    >
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
};
