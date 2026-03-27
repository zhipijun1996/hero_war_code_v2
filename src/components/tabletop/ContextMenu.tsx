import React from 'react';
import { GameState } from '../../shared/types';
import { Socket } from 'socket.io-client';

interface ContextMenuProps {
  menu: { x: number, y: number, type: string, targetId: string } | null;
  gameState: GameState;
  playerId: string;
  socket: Socket;
  setMenu: (menu: any) => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ menu, gameState, playerId, socket, setMenu }) => {
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
        </>
      )}
    </div>
  );
};

export default ContextMenu;
