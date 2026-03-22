import React from 'react';

interface SpectatorJoinButtonProps {
  gameStarted: boolean;
  playerIndex: number;
  showJoinOverlay: boolean;
  setShowJoinOverlay: (val: boolean) => void;
}

export const SpectatorJoinButton: React.FC<SpectatorJoinButtonProps> = ({
  gameStarted,
  playerIndex,
  showJoinOverlay,
  setShowJoinOverlay,
}) => {
  if (!gameStarted || playerIndex !== -1 || showJoinOverlay) return null;

  return (
    <button 
      onClick={() => setShowJoinOverlay(true)}
      className="absolute top-20 right-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg z-50 pointer-events-auto"
    >
      加入游戏 (Join Game)
    </button>
  );
};
