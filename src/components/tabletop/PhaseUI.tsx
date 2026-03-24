import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { GameState } from '../../shared/types';
import { getPhasePrompt } from './getPhasePrompt';
import { ActionPanel } from './ActionPanel';

interface PhaseUIProps {
  socket: Socket;
  gameState: GameState;
  playerIndex: number;
  playerId: string;
  selectedHeroCardId: string | null;
}

export const PhaseUI: React.FC<PhaseUIProps> = ({
  socket,
  gameState,
  playerIndex,
  playerId,
  selectedHeroCardId,
}) => {
  const [isPromptHidden, setIsPromptHidden] = useState(false);

  if (!gameState.gameStarted) return null;

  const getPromptText = () => {
    return getPhasePrompt({
      gameState,
      playerIndex,
      playerId,
      selectedHeroCardId,
    });
  };

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto flex flex-col items-center gap-2">
      {!isPromptHidden ? (
        <div className="bg-zinc-800/90 border border-zinc-700 rounded-xl p-4 shadow-2xl flex flex-col items-center gap-2 backdrop-blur-sm min-w-[300px] max-w-[80vw] text-center relative">
          <button 
            onClick={() => setIsPromptHidden(true)}
            className="absolute top-2 right-2 text-zinc-400 hover:text-white"
            title="隐藏提示 (Hide Prompt)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
          <div className={`text-lg font-bold whitespace-pre-line ${gameState.activePlayerIndex === 0 ? 'text-blue-400' : 'text-red-400'}`}>
            {gameState.notification ? (
              <div className="flex flex-col items-center gap-4">
                <p className="text-indigo-300">{gameState.notification}</p>
                <button 
                  onClick={() => socket.emit('clear_notification')}
                  className="px-8 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
                >
                  确定 (Confirm)
                </button>
              </div>
            ) : getPromptText()}
          </div>
          {!gameState.notification && (
            <div className="flex gap-4 mt-2">
              <ActionPanel 
                gameState={gameState}
                playerIndex={playerIndex}
                socket={socket}
                playerId={playerId}
              />
            </div>
          )}
        </div>
      ) : (
        <button 
          onClick={() => setIsPromptHidden(false)}
          className="bg-zinc-800/90 border border-zinc-700 rounded-full px-4 py-2 shadow-lg backdrop-blur-sm text-zinc-300 hover:text-white font-bold text-sm"
        >
          显示提示 (Show Prompt)
        </button>
      )}
    </div>
  );
};
