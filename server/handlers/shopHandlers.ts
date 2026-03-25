import { HeroEngine } from '../../src/logic/hero/heroEngine.ts';
import { ActionEngine } from '../../src/logic/action/actionEngine.ts';

export const createShopHandlers = (deps: any) => {
  const {
    gameState,
    io,
    addLog,
    checkBotTurn,
    broadcastState,
    getPlayerIndex,
    alignHireArea,
    checkAllTokensUsed,
    actionHelpers
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
        ActionEngine.startEndPhase(gameState, actionHelpers);
      }
    },
    hire_hero: (socket: any, { cardId, goldAmount, targetCastleIndex }: any) => {
      if (!cardId) { socket.emit('error_message', '缺少雇佣英雄'); return; }
      if (goldAmount < 2) { socket.emit('error_message', '雇佣至少需要2金币'); return; }
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

      // Handle turn transition
      if (gameState.phase === 'shop') {
        if (playerIndex === gameState.firstPlayerIndex) {
          // First player finished shop turn, move to second player
          gameState.activePlayerIndex = 1 - gameState.firstPlayerIndex;
          // Draw 3 new cards for the next player
          gameState.discardPiles.action.push(...gameState.hireAreaCards);
          gameState.hireAreaCards = [];
          for (let i = 0; i < 3; i++) {
            if (gameState.decks.hero.length > 0) {
              gameState.hireAreaCards.push(gameState.decks.hero.pop()!);
            }
          }
          alignHireArea();
          addLog(`--- 玩家${gameState.activePlayerIndex + 1}的商店阶段 ---`, -1);
        } else {
          ActionEngine.startEndPhase(gameState, actionHelpers);
        }
      } else {
        // From action phase
        gameState.activePlayerIndex = 1 - playerIndex;
        gameState.phase = 'action_common';
        checkAllTokensUsed(gameState);
      }

      broadcastState();
      checkBotTurn();
    }
  };
};
