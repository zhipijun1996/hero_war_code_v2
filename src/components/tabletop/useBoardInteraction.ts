import { Socket } from 'socket.io-client';
import { GameState } from '../../shared/types';
import { handleHexClickLogic, handleTokenClickLogic, handleCardClickLogic } from './targetClickHandlers';

interface UseBoardInteractionParams {
  socket: Socket;
  gameState: GameState;
  playerId: string;
  selectedHeroCardId: string | null;
  setSelectedHeroCardId: (id: string | null) => void;
}

export const useBoardInteraction = ({
  socket,
  gameState,
  playerId,
  selectedHeroCardId,
  setSelectedHeroCardId,
}: UseBoardInteractionParams) => {
  const isPlayer1 = gameState.seats[0] === playerId;
  const isPlayer2 = gameState.seats[1] === playerId;
  const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
  const isActivePlayer = playerIndex === gameState.activePlayerIndex;

  const clickHandlerParams = {
    gameState,
    playerIndex,
    isActivePlayer,
    socket,
    selectedHeroCardId,
    setSelectedHeroCardId,
  };

  const handleHexClick = (q: number, r: number) => {
    handleHexClickLogic(q, r, clickHandlerParams);
  };

  const handleTokenClick = (id: string) => {
    handleTokenClickLogic(id, clickHandlerParams);
  };

  const handleCardClick = (id: string, area: 'table' | 'hire' | 'play') => {
    handleCardClickLogic(id, area, clickHandlerParams);
  };

  return {
    playerIndex,
    isActivePlayer,
    handleHexClick,
    handleTokenClick,
    handleCardClick,
  };
};
