import React from 'react';
import { GameState } from '../../shared/types';
import { Socket } from 'socket.io-client';

interface ContextMenuProps {
  menu: { x: number, y: number, type: string, targetId: string } | null;
  gameState: GameState;
  playerId: string;
  socket: Socket;
  setMenu: (menu: any) => void;
  setHirePopup: (popup: any) => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ menu, gameState, playerId, socket, setMenu, setHirePopup }) => {
  if (!menu) return null;

  const isPlayer1 = gameState.seats[0] === playerId;
  const isPlayer2 = gameState.seats[1] === playerId;
  const isPlayer = isPlayer1 || isPlayer2;
  const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
  const isMyTurn = playerIndex === gameState.activePlayerIndex;

  return (
    <div 
      className="absolute bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl py-1 z-[500] min-w-[120px] backdrop-blur-md overflow-hidden"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {menu.type === 'deck' ? (
        <>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            onClick={() => { socket.emit('draw_card', menu.targetId); setMenu(null); }}
          >
            抽一张 (Draw 1)
          </button>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            onClick={() => { socket.emit('draw_card_to_table', menu.targetId, menu.x + 120, menu.y); setMenu(null); }}
          >
            抽到桌面 (Draw to Table)
          </button>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            onClick={() => { socket.emit('shuffle_deck', menu.targetId); setMenu(null); }}
          >
            洗牌 (Shuffle)
          </button>
        </>
      ) : (
        <>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            onClick={() => { socket.emit('flip_card', menu.targetId); setMenu(null); }}
          >
            翻转 (Flip)
          </button>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            onClick={() => { socket.emit('discard_card', menu.targetId); setMenu(null); }}
          >
            弃掉 (Discard)
          </button>
          {(() => {
            const card = gameState.tableCards.find(c => c.id === menu.targetId) || 
                        gameState.hireAreaCards.find(c => c.id === menu.targetId) ||
                        gameState.playAreaCards.find(c => c.id === menu.targetId);
            if (card && card.type === 'hero' && isPlayer && isMyTurn && gameState.phase === 'action_select_option') {
              return (
                <button 
                  className="w-full text-left px-4 py-2 text-sm text-blue-400 hover:bg-zinc-700 font-bold"
                  onClick={() => { socket.emit('select_option', 'move'); socket.emit('select_target', menu.targetId); setMenu(null); }}
                >
                  移动 (Move)
                </button>
              );
            }
            return null;
          })()}
          {(() => {
            const isHireArea = (gameState.hireAreaCards || []).filter(Boolean).some(c => c && c.id === menu.targetId);
            const tokenY = playerIndex === 0 ? 311.7 : -311.7;
            const castleHasHero = gameState.tokens.some(t => Math.abs(t.x) < 10 && Math.abs(t.y - tokenY) < 10);
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
  );
};

export default ContextMenu;
