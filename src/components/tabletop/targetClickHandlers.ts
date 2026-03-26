import { Socket } from 'socket.io-client';
import { GameState } from '../../shared/types';
import { pixelToHex } from '../../shared/utils/hexUtils';
import { DEFAULT_MAP } from '../../shared/config/maps/mapIndex.ts'; 
const CASTLES = DEFAULT_MAP.castles;

interface ClickHandlerParams {
  gameState: GameState;
  playerIndex: number;
  isActivePlayer: boolean;
  socket: Socket;
  selectedHeroCardId: string | null;
  setSelectedHeroCardId: (id: string | null) => void;
}

export const handleHexClickLogic = (
  q: number, 
  r: number, 
  params: ClickHandlerParams
) => {
  const { gameState, playerIndex, isActivePlayer, socket, selectedHeroCardId, setSelectedHeroCardId } = params;

  if (gameState.phase === 'setup' && playerIndex !== -1) {
    if (selectedHeroCardId) {
      const playerCastles = gameState.map?.castles[playerIndex as 0 | 1] || CASTLES[playerIndex as 0 | 1];
      const castleIdx = playerCastles.findIndex((c: any) => c.q === q && c.r === r);
      if (castleIdx !== -1) {
        socket.emit('play_card', { cardId: selectedHeroCardId, targetCastleIndex: castleIdx });
        setSelectedHeroCardId(null);
      }
    }
    return;
  }

  if (gameState.phase === 'revival' && isActivePlayer) {
    const pending = gameState.pendingRevivals?.find(r => r.playerIndex === playerIndex);
    if (pending) {
      const playerCastles = gameState.map?.castles[playerIndex as 0 | 1] || CASTLES[playerIndex as 0 | 1];
      const castleIdx = playerCastles.findIndex((c: any) => c.q === q && c.r === r);
      if (castleIdx !== -1) {
        socket.emit('revive_hero', { heroCardId: pending.heroCardId, targetCastleIndex: castleIdx });
      }
    }
    return;
  }

  if (gameState.phase === 'action_resolve' && isActivePlayer && gameState.activeActionType === 'move' && gameState.selectedTokenId) {
    socket.emit('move_token_to_cell', { q, r });
    return;
  }

  if (gameState.phase === 'action_resolve' && isActivePlayer && gameState.activeActionType === 'attack' && gameState.selectedTokenId) {
    console.log(`handleHexClick (attack): q=${q}, r=${r}`);
    // Find target at this hex
    const monster = gameState.map?.monsters?.find((m: any) => m.q === q && m.r === r);
    if (monster) {
      console.log(`Emitting select_target for monster at ${q},${r}`);
      socket.emit('select_target', `monster_${monster.q}_${monster.r}`);
      return;
    }

    const isCastle = gameState.map ? 
      (gameState.map.castles[0]?.some((c: any) => c.q === q && c.r === r) || gameState.map.castles[1]?.some((c: any) => c.q === q && c.r === r)) :
      ((q === 0 && r === 4) || (q === 4 && r === 0) || (q === 0 && r === -4) || (q === -4 && r === 0));
    
    if (isCastle) {
      console.log(`Emitting select_target for castle at ${q},${r}`);
      socket.emit('select_target', `castle_${q}_${r}`);
      return;
    }

    const targetToken = gameState.tokens.find(t => {
      const hex = pixelToHex(t.x, t.y);
      return hex.q === q && hex.r === r;
    });
    if (targetToken && targetToken.boundToCardId) {
      console.log(`Emitting select_target for token ${targetToken.id} (card ${targetToken.boundToCardId})`);
      socket.emit('select_target', targetToken.boundToCardId);
    } else {
      const targetCard = gameState.tableCards.find(c => {
        const hex = pixelToHex(c.x, c.y);
        return hex.q === q && hex.r === r;
      });
      if (targetCard) {
        console.log(`Emitting select_target for card ${targetCard.id}`);
        socket.emit('select_target', targetCard.id);
      }
    }
    return;
  }

  if (gameState.phase === 'action_select_option' && isActivePlayer && gameState.selectedTokenId) {
    if (gameState.selectedOption === 'attack' || gameState.selectedOption === 'turret_attack') {
      console.log(`handleHexClick (attack option): q=${q}, r=${r}`);
      // Find target at this hex
      const monster = gameState.map?.monsters?.find((m: any) => m.q === q && m.r === r);
      if (monster) {
        console.log(`Emitting select_target for monster at ${q},${r}`);
        socket.emit('select_target', `monster_${monster.q}_${monster.r}`);
        return;
      }

      const isCastle = gameState.map ? 
        (gameState.map.castles[0]?.some((c: any) => c.q === q && c.r === r) || gameState.map.castles[1]?.some((c: any) => c.q === q && c.r === r)) :
        ((q === 0 && r === 4) || (q === 4 && r === 0) || (q === 0 && r === -4) || (q === -4 && r === 0));
      
      if (isCastle) {
        console.log(`Emitting select_target for castle at ${q},${r}`);
        socket.emit('select_target', `castle_${q}_${r}`);
        return;
      }

      const targetToken = gameState.tokens.find(t => {
        const hex = pixelToHex(t.x, t.y);
        return hex.q === q && hex.r === r;
      });
      if (targetToken && targetToken.boundToCardId) {
        console.log(`Emitting select_target for token ${targetToken.id} (card ${targetToken.boundToCardId})`);
        socket.emit('select_target', targetToken.boundToCardId);
      } else {
        const targetCard = gameState.tableCards.find(c => {
          const hex = pixelToHex(c.x, c.y);
          return hex.q === q && hex.r === r;
        });
        if (targetCard) {
          console.log(`Emitting select_target for card ${targetCard.id}`);
          socket.emit('select_target', targetCard.id);
        }
      }
    } else {
      socket.emit('move_token_to_cell', { q, r });
    }
  }
};

export const handleTokenClickLogic = (
  id: string,
  params: ClickHandlerParams
) => {
  const { gameState, playerIndex, isActivePlayer, socket } = params;

  if (isActivePlayer) {
    if (gameState.phase === 'action_select_hero' || gameState.phase === 'action_select_substitute') {
      socket.emit('select_hero_for_action', id);
      return;
    }
    if (gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack') {
      const token = gameState.tokens.find(t => t.id === id);
      if (token && token.boundToCardId) {
        console.log(`handleTokenClick (attack): token ${id}, card ${token.boundToCardId}`);
        socket.emit('select_target', token.boundToCardId);
        return;
      }
    }
    if (gameState.phase === 'action_select_option') {
      if ((gameState.selectedOption === 'attack' || gameState.selectedOption === 'turret_attack') && gameState.selectedTokenId) {
        const token = gameState.tokens.find(t => t.id === id);
        if (token && token.boundToCardId) {
          const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
          const isEnemy = card && ((playerIndex === 0 && card.y < 0) || (playerIndex === 1 && card.y > 0));
          if (isEnemy) {
            console.log(`handleTokenClick (attack option): emitting select_target for enemy token ${id}, card ${token.boundToCardId}`);
            socket.emit('select_target', token.boundToCardId);
            return;
          }
        }
      }

      if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint' || gameState.selectedOption === 'attack' || gameState.selectedOption === 'chant' || gameState.selectedOption === 'fire' || gameState.selectedOption === 'turret_attack') {
        socket.emit('select_token', id);
      }
    }
  }
};

export const handleCardClickLogic = (
  id: string,
  area: 'table' | 'hire' | 'play',
  params: ClickHandlerParams
) => {
  const { gameState, isActivePlayer, socket } = params;

  if (area === 'table' || area === 'play') {
    if ((gameState.phase === 'action_select_option' || (gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack')) && isActivePlayer) {
      socket.emit('select_target', id);
    }
  } else if (area === 'hire') {
    if ((gameState.phase === 'hire') && isActivePlayer) {
      socket.emit('select_target', id);
    }
  }
};
