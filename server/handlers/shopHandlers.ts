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
    start_buy:(socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      const source = gameState.phase=='shop' ? 'shop' : 'action_common';
      if (playerIndex === gameState.activePlayerIndex) {
        ActionEngine.startBuySelection(gameState, source, actionHelpers);
      }
    },
    start_hire:(socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      const source = gameState.phase=='shop' ? 'shop' : 'action_common';
      if (playerIndex === gameState.activePlayerIndex) {
        ActionEngine.startHireSelection(gameState, source, actionHelpers);
      }
    },
    select_hire_cost: (socket: any, cost: number) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === gameState.activePlayerIndex) {
        gameState.selectedHireCost = cost;
        broadcastState();
        checkBotTurn();
      }
    },
    select_hire_castle: (socket: any, castle: number) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === gameState.activePlayerIndex) {
        gameState.selectedHireCastle = castle;
        broadcastState();
        checkBotTurn();
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

      broadcastState();
      checkBotTurn();
    },
    pass_shop: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex) return;

      if (gameState.phase === 'buy') {
        ActionEngine.cancelBuySelection(gameState, playerIndex, actionHelpers);
        return;
      }

      if (gameState.phase !== 'shop') return;

      addLog(`玩家${playerIndex + 1}结束商店阶段 (Player ${playerIndex + 1} ended shop phase)`, playerIndex);

      gameState.shopPasses = (gameState.shopPasses || 0) + 1;

      if (gameState.shopPasses >= 2) {
        ActionEngine.startEndPhase(gameState, actionHelpers);
        return;
      } 

      gameState.activePlayerIndex = 1 - playerIndex;
      addLog(`玩家${gameState.activePlayerIndex + 1}开始商店阶段`, -1);
      broadcastState();
      checkBotTurn();
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
        gameState.phase = gameState.hireSource === 'shop' ? 'shop' : 'action_common';
        broadcastState();
        checkBotTurn();
        return;
      }

      // Handle turn transition
      if (gameState.hireSource === 'shop') {
        gameState.phase = 'shop';
        gameState.hireSource = null;
        gameState.activePlayerIndex = 1 - playerIndex;
      } else if (gameState.hireSource === 'action_common'){
        const token = gameState.actionTokens.find(t => t.id === gameState.activeActionTokenId);
        if(token) token.used = true;
        gameState.activeActionTokenId = null;
        gameState.activeHeroTokenId = null;
        gameState.selectedTokenId = null;
        gameState.activePlayerIndex = 1 - playerIndex;
        gameState.phase = 'action_play';
        checkAllTokensUsed(gameState);
      } else {

      }

      broadcastState();
      checkBotTurn();
    }
  };
};
