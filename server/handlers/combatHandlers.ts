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
    pass_defend: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        addLog(`玩家${playerIndex + 1}放弃防御 (Pass Defend)`, playerIndex);
        gameState.phase = 'action_resolve_attack';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
    declare_defend: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        addLog(`玩家${playerIndex + 1}声明防御 (Declare Defend)`, playerIndex);
        gameState.phase = 'action_resolve_attack';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
    declare_counter: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        addLog(`玩家${playerIndex + 1}声明反击 (Declare Counter)`, playerIndex);
        gameState.phase = 'action_resolve_attack';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
    cancel_defend_or_counter: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (gameState.phase === 'action_resolve_attack' && playerIndex === gameState.activePlayerIndex) {
        addLog(`玩家${playerIndex + 1}取消了防御/反击声明 (Canceled Defend/Counter)`, playerIndex);
        gameState.phase = 'action_defend';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
      }
    },
    end_resolve_attack: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (gameState.phase === 'action_resolve_attack' && playerIndex === gameState.activePlayerIndex) {
        gameState.phase = 'action_play';
        gameState.activeActionType = null;
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        addLog(`攻击结算结束 (Attack Resolved)`, -1);
        broadcastState();
        checkBotTurn();
      }
    },
    end_resolve_attack_counter: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (gameState.phase === 'action_resolve_attack' && playerIndex === gameState.activePlayerIndex) {
        gameState.phase = 'action_play';
        gameState.activeActionType = null;
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        addLog(`攻击结算结束 (Attack Resolved)`, -1);
        broadcastState();
        checkBotTurn();
      }
    }
  };
};
