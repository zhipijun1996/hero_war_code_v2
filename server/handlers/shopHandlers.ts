import { HeroEngine } from '../../src/logic/hero/heroEngine.ts';

export const createShopHandlers = (deps: any) => {
  const {
    gameState,
    io,
    addLog,
    checkBotTurn,
    broadcastState,
    getPlayerIndex,
    alignHireArea,
    checkAllTokensUsed
  } = deps;

  return {
    select_hire_cost: (socket: any, cost: number) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === gameState.activePlayerIndex) {
        gameState.selectedHireCost = cost;
        broadcastState();
      }
    },
    next_shop: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1 || gameState.phase !== 'shop' || playerIndex !== gameState.activePlayerIndex) return;

      const player = gameState.players[socket.id];
      if (!player) return;

      if (player.gold < 1) {
        socket.emit('error_message', '金币不足 (Not enough gold)');
        return;
      }

      player.gold -= 1;
      addLog(`玩家${playerIndex + 1}花费1金币刷新商店 (Player ${playerIndex + 1} refreshed shop)`, playerIndex);

      // Discard current hire area cards
      gameState.discardPiles.action.push(...gameState.hireAreaCards);
      gameState.hireAreaCards = [];

      // Draw 3 new cards
      for (let i = 0; i < 3; i++) {
        if (gameState.decks.action.length === 0) {
          gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
          gameState.discardPiles.action = [];
        }
        if (gameState.decks.action.length > 0) {
          const card = gameState.decks.action.pop()!;
          card.faceUp = true;
          gameState.hireAreaCards.push(card);
        }
      }

      alignHireArea();
      broadcastState();
    },
    pass_shop: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1 || gameState.phase !== 'shop' || playerIndex !== gameState.activePlayerIndex) return;

      addLog(`玩家${playerIndex + 1}结束商店阶段 (Player ${playerIndex + 1} ended shop phase)`, playerIndex);
      
      gameState.discardPiles.action.push(...gameState.hireAreaCards);
      gameState.hireAreaCards = [];
      
      if (gameState.activePlayerIndex === gameState.firstPlayerIndex) {
        gameState.activePlayerIndex = 1 - gameState.firstPlayerIndex;
        
        for (let i = 0; i < 3; i++) {
          if (gameState.decks.action.length === 0) {
            gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
            gameState.discardPiles.action = [];
          }
          if (gameState.decks.action.length > 0) {
            const card = gameState.decks.action.pop()!;
            card.faceUp = true;
            gameState.hireAreaCards.push(card);
          }
        }
        alignHireArea();
        broadcastState();
        checkBotTurn();
      } else {
        gameState.phase = 'end';
        gameState.activePlayerIndex = gameState.firstPlayerIndex;
        addLog(`--- 结束阶段开始 (end Phase Starts) ---`, -1);
        broadcastState();
      }
    },
    hire_hero: (socket: any, { cardId, goldAmount, targetCastleIndex }: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      const result = HeroEngine.hireHero(gameState, playerIndex, cardId, goldAmount, targetCastleIndex, {
        addLog,
        alignHireArea,
        checkAllTokensUsed
      });

      if (!result.success) {
        socket.emit('error_message', result.reason);
        return;
      }

      broadcastState();
      checkBotTurn();
    }
  };
};
