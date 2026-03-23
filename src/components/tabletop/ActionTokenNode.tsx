import React from 'react';
import { Group, Circle, Text, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { getHeroTokenImage } from '../../shared/utils/assetUtils';

interface ActionTokenNodeProps {
  token: any;
  onClick: (id: string) => void;
  isMyTurn: boolean;
  isSelected: boolean;
}

export const ActionTokenNode: React.FC<ActionTokenNodeProps> = ({
  token,
  onClick,
  isMyTurn,
  isSelected
}) => {
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
};
