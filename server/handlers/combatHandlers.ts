import { ActionEngine } from '../../src/logic/action/actionEngine.ts';

export const createCombatHandlers = (deps: any) => {
  const {
    gameState,
    io,
    actionHelpers,
    addLog,
    checkBotTurn,
    broadcastState,
    getPlayerIndex
  } = deps;

  return {
    play_enhancement_card: (socket: any, cardId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.playEnhancementCard(gameState, playerIndex, cardId, actionHelpers, socket);
    },
    pass_enhancement: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.passEnhancement(gameState, playerIndex, actionHelpers, socket);
    },
    pass_defend: async (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        addLog(`玩家${playerIndex + 1}放弃防御 (Pass Defend)`, playerIndex);
        gameState.hasDefenseCard = false;
        gameState.pendingDefenseCardId = null;
        gameState.isDefended = false;
        gameState.isCounterAttack = false;
        gameState.canCounterAttack = false;
        const attackerIndex = gameState.attackInitiatorIndex ?? (1 - playerIndex);
        await ActionEngine.endResolveAttack(gameState, attackerIndex, actionHelpers, socket);
      }
    },
    declare_defend: async (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (gameState.phase !== 'action_defend' || playerIndex !== gameState.activePlayerIndex) return;

      if (!gameState.hasDefenseCard) {
        socket.emit('error_message', '请先打出防御牌');
        return;
      }
      addLog(`玩家${playerIndex + 1}声明防御 (Declare Defend)`, playerIndex);
      gameState.isDefended = true;
      gameState.isCounterAttack = false;
      const attackerIndex = gameState.attackInitiatorIndex ?? (1 - playerIndex);
      await ActionEngine.endResolveAttack(gameState, attackerIndex, actionHelpers, socket);
    },
    declare_counter: async (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);      
      if (gameState.phase !== 'action_defend' || playerIndex !== gameState.activePlayerIndex) return;
      if (!gameState.hasDefenseCard) {
        socket.emit('error_message', '请先打出防御牌');
        return;
      }
      if (!gameState.canCounterAttack) {
        socket.emit('error_message', '当前不满足反击条件');
        return;
      }
      addLog(`玩家${playerIndex + 1}声明反击 (Declare Counter)`, playerIndex);
      gameState.isDefended = false;
      gameState.isCounterAttack = true;
      const attackerIndex = gameState.attackInitiatorIndex ?? (1 - playerIndex);
      await ActionEngine.endResolveAttack(gameState, attackerIndex, actionHelpers, socket);
    },
    end_resolve_attack: async (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      await ActionEngine.endResolveAttack(gameState, playerIndex, actionHelpers, socket);
    },
    end_resolve_attack_counter: async (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      await ActionEngine.endResolveAttackCounter(gameState, playerIndex, actionHelpers, socket);
    }
  };
};
