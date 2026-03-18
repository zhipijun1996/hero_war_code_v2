import { useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Card, GameState } from '../shared/types';
import { motion } from 'motion/react';

interface HandProps {
  socket: Socket;
  hand: Card[];
  setZoomedCard: (card: Card | null) => void;
  gameState: GameState;
  selectedHeroCardId: string | null;
  setSelectedHeroCardId: (id: string | null) => void;
}

export default function Hand({ socket, hand, setZoomedCard, gameState, selectedHeroCardId, setSelectedHeroCardId }: HandProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const playCard = (cardId: string) => {
    if (gameState.phase === 'setup') {
      setSelectedHeroCardId(cardId === selectedHeroCardId ? null : cardId);
      return;
    }
    if (gameState.phase === 'discard') {
      socket.emit('error_message', '弃牌阶段无法出牌。');
      return;
    }
    if (gameState.phase === 'action_play_enhancement') {
      socket.emit('play_enhancement_card', cardId);
      return;
    }
    // Play card to the center of the map (0,0)
    socket.emit('play_card', { cardId, x: 0, y: 0 });
  };

  const handleCardClick = (cardId: string) => {
    if (gameState.phase === 'discard') {
      socket.emit('discard_card', cardId);
      return;
    }
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    clickTimeoutRef.current = setTimeout(() => {
      playCard(cardId);
      clickTimeoutRef.current = null;
    }, 250);
  };

  const handleCardDoubleClick = (e: React.MouseEvent, card: Card) => {
    e.stopPropagation();
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setZoomedCard(card);
  };

  return (
    <div className="flex justify-center items-end pb-4 h-48 pointer-events-none">
      <div className="flex gap-[-20px] pointer-events-auto">
        {hand && hand.map((card, index) => {
          const isHovered = hoveredIndex === index;
          const isSelected = card.id === selectedHeroCardId;
          
          return (
            <motion.div
              key={card.id}
              className={`relative w-24 h-36 rounded-lg shadow-xl cursor-pointer border overflow-hidden flex flex-col items-center justify-center ${isSelected ? 'border-yellow-400 ring-4 ring-yellow-400/50' : 'border-zinc-700 bg-zinc-800'}`}
              style={{
                marginLeft: index === 0 ? 0 : -30,
                zIndex: isHovered || isSelected ? 100 : index,
              }}
              initial={{ y: 50, opacity: 0 }}
              animate={{ 
                y: isHovered || isSelected ? -20 : 0, 
                opacity: 1,
                rotate: isHovered || isSelected ? 0 : (index - hand.length / 2) * 2
              }}
              onHoverStart={() => setHoveredIndex(index)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => handleCardClick(card.id)}
              onDoubleClick={(e) => handleCardDoubleClick(e, card)}
            >
              {card.frontImage ? (
                <img 
                  src={card.frontImage} 
                  alt="Card Front" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.classList.add('bg-zinc-800');
                  }}
                />
              ) : null}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center pointer-events-none">
                <span className="text-2xl mb-1">
                  {card.type === 'hero' ? '👤' : card.type.startsWith('treasure') ? '💰' : '📜'}
                </span>
                <span className="text-[10px] font-bold text-white leading-tight uppercase">
                  {card.name || card.heroClass || '卡牌'}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
