import React from 'react';
import { Socket } from 'socket.io-client';
import { GameState } from '../../shared/types';

interface JoinOverlayProps {
  socket: Socket;
  gameState: GameState;
  playerId: string;
  playerNameInput: string;
  setPlayerNameInput: (val: string) => void;
  showJoinOverlay: boolean;
  setShowJoinOverlay: (val: boolean) => void;
  setErrorMsg: (msg: string | null) => void;
}

export const JoinOverlay: React.FC<JoinOverlayProps> = ({
  socket,
  gameState,
  playerId,
  playerNameInput,
  setPlayerNameInput,
  showJoinOverlay,
  setShowJoinOverlay,
  setErrorMsg,
}) => {
  if (gameState.gameStarted && !showJoinOverlay) return null;

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[200] pointer-events-auto backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-6 relative">
        {gameState.notification && !gameState.gameStarted && (
          <div className="text-xl font-bold text-emerald-400 text-center mb-4 animate-pulse">
            {gameState.notification}
          </div>
        )}
        {gameState.gameStarted && (
          <button 
            onClick={() => setShowJoinOverlay(false)}
            className="absolute top-4 right-4 text-zinc-400 hover:text-white"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
        <h2 className="text-2xl font-bold text-white text-center">欢迎进行勇者之争桌游1.0测试</h2>
        
        <div className="w-full flex flex-col gap-3">
          <div className="flex flex-col gap-2 mb-2">
            <label className="text-zinc-400 text-sm">输入名称 (Enter Name):</label>
            <input 
              type="text" 
              value={playerNameInput}
              onChange={(e) => setPlayerNameInput(e.target.value)}
              placeholder="Your Name"
              className="bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-lg outline-none focus:border-indigo-500"
            />
          </div>
          {[0, 1, 2, 3].map((seatIndex) => {
            const occupantId = gameState.seats?.[seatIndex];
            const isMe = occupantId === playerId;
            const isOccupied = occupantId !== null;
            const occupantName = isOccupied ? gameState.players[occupantId]?.name || 'Player' : '';

            return (
              <div key={seatIndex} className="flex items-center justify-between bg-zinc-800 p-3 rounded-xl border border-zinc-700">
                <span className="text-zinc-300 font-medium">玩家 {seatIndex + 1}</span>
                {isOccupied ? (
                  <div className="flex items-center gap-3">
                    <span className="text-indigo-400 text-sm">{isMe ? '你 (You)' : occupantName}</span>
                    {isMe && (
                      <button 
                        onClick={() => socket.emit('leave_seat')}
                        className="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
                      >
                        离开 (Leave)
                      </button>
                    )}
                    {!isMe && occupantId?.startsWith('bot_') && (
                      <button 
                        onClick={() => socket.emit('remove_bot', { seatIndex })}
                        className="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
                      >
                        取消 AI (Cancel AI)
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        if (!playerNameInput.trim()) {
                          setErrorMsg("请输入名称 (Please enter a name)");
                          setTimeout(() => setErrorMsg(null), 3000);
                          return;
                        }
                        socket.emit('sit_down', { seatIndex, playerName: playerNameInput.trim() });
                        if (gameState.gameStarted) {
                          setShowJoinOverlay(false);
                        }
                      }}
                      className="px-4 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors"
                    >
                      坐下 (Sit)
                    </button>
                    <div className="flex bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700">
                      {[0, 1, 2].map(diff => (
                        <button
                          key={diff}
                          onClick={() => socket.emit('add_bot', { seatIndex, difficulty: diff })}
                          className="px-2 py-1 hover:bg-indigo-600 text-zinc-400 hover:text-white text-xs transition-colors border-r border-zinc-700 last:border-r-0"
                          title={`添加难度 ${diff} 电脑`}
                        >
                          AI{diff}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!gameState.gameStarted && (
          <button 
            onClick={() => socket.emit(gameState.notification?.includes('游戏结束') ? 'reset_game' : 'start_game')}
            className="w-full py-3 mt-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-lg font-bold shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all"
          >
            {gameState.notification?.includes('游戏结束') ? '重新开始 (Reset Game)' : '开始游戏 (Start Game)'}
          </button>
        )}
      </div>
    </div>
  );
};
