import { ActionEngine } from '../../src/logic/action/actionEngine.ts';
import { HeroEngine } from '../../src/logic/hero/heroEngine.ts';
import { CardLogic } from '../../src/logic/card/cardLogic.ts';
import { CombatLogic } from '../../src/logic/combat/combatLogic.ts';

export const createActionHandlers = (deps: any) => {
  const {
    gameState,
    io,
    actionHelpers,
    HeroEngine,
    addLog,
    checkBotTurn,
    broadcastState,
    checkAllTokensUsed,
    pixelToHex,
    getReachableHexes,
    hexToPixel,
    getRecoilHex,
    REWARDS,
    addReputation,
    getAttackableHexes,
    getPlayerIndex,
    heroesDatabase,
    isTargetInAttackRange,
    getNeighbors,
    alignHireArea,
    setPhase,
    createActionTokensForPlayer,
    updateAvailableActions,
    drawCards,
    discardOpponentCard,
    generateId,
    getHeroTokenImage,
    getHeroCardImage,
    getHeroBackImage,
    createInitialState
  } = deps;

  return {
    play_card: (socket: any, { cardId, x, y, targetCastleIndex }: { cardId: string, x?: number, y?: number, targetCastleIndex?: number }) => {
      const playerIndex = getPlayerIndex(socket.id);

      const result = CardLogic.playCard(
        gameState,
        playerIndex,
        socket.id,
        cardId,
        x,
        y,
        targetCastleIndex,
        {
          addLog,
          broadcastState,
          setPhase,
          alignHireArea,
          createActionTokensForPlayer,
          updateAvailableActions,
          drawCards: (pIdx: number, count: number) => {
            const sid = gameState.seats?.[pIdx];
            if (sid) drawCards(sid, count);
          },
          discardOpponentCard: (pIdx: number) => {
            const opponentId = gameState.seats?.[1 - pIdx];
            if (opponentId) {
              const opponent = gameState.players?.[opponentId];
              if (opponent && opponent.hand.length > 0) {
                const randomIndex = Math.floor(Math.random() * opponent.hand.length);
                const discarded = opponent.hand.splice(randomIndex, 1)[0];
                gameState.discardPiles.action.push(discarded);
              }
            }
          }
        }
      );

      if (!result.success) {
        socket.emit('error_message', result.reason);
        return;
      }

      if (gameState.phase === 'action_defend' && gameState.hasDefenseCard) {
        gameState.canCounterAttack = CombatLogic.canCounterAttack(gameState, playerIndex);
      }

      if (gameState.phase === 'action_resolve_attack_counter') {
        ActionEngine.endResolveAttackCounter(gameState, playerIndex, actionHelpers, socket);
      } else {
        broadcastState();
        checkBotTurn();
      }
    },
    discard_card: (socket: any, cardId: string) => {
      const player = gameState.players?.[socket.id];
      if (!player) return;

      if (gameState.phase !== 'discard') {
        let cardIndex = gameState.tableCards.findIndex((c: any) => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.tableCards.splice(cardIndex, 1)[0];
          gameState.discardPiles.action.push(card);
          io.emit('state_update', gameState);
          return;
        }
        
        cardIndex = gameState.hireAreaCards.findIndex((c: any) => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.hireAreaCards.splice(cardIndex, 1)[0];
          gameState.discardPiles.action.push(card);
          alignHireArea();
          io.emit('state_update', gameState);
          return;
        }
        
        if (gameState.playAreaCards) {
          cardIndex = gameState.playAreaCards.findIndex((c: any) => c.id === cardId);
          if (cardIndex !== -1) {
            const card = gameState.playAreaCards.splice(cardIndex, 1)[0];
            gameState.discardPiles.action.push(card);
            io.emit('state_update', gameState);
            return;
          }
        }
        return;
      }

      const cardIndex = player.hand.findIndex((c: any) => c.id === cardId);
      if (cardIndex !== -1 && gameState.phase === 'discard' && !player.discardFinished) {
        if (player.hand.length <= 5) {
          socket.emit('error_message', '你的手牌已经不超过 5 张，不能继续弃牌。');
          return;
        }
        
        const card = player.hand.splice(cardIndex, 1)[0];
        gameState.discardPiles.action.push(card);
        // Save state for undo
        if (!player.discardHistory) player.discardHistory = [];
        player.discardHistory.push(card);
        io.emit('state_update', gameState);
      }
    },
    undo_discard: (socket: any) => {
      const player = gameState.players?.[socket.id];
      if (!player || gameState.phase !== 'discard' || player.discardFinished) return;

      if (player.discardHistory && player.discardHistory.length > 0) {
        const card = player.discardHistory.pop();
        if (card) {
          const discardIndex = gameState.discardPiles.action.findIndex((c: any) => c.id === card.id);
          if (discardIndex !== -1) {
            gameState.discardPiles.action.splice(discardIndex, 1);
            player.hand.push(card);
            io.emit('state_update', gameState);
          }
        }
      }
    },
    finish_discard: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.finishDiscard(gameState, playerIndex, actionHelpers, socket);
    },
    revive_hero: (socket: any, { heroCardId, targetCastleIndex }: { heroCardId: string, targetCastleIndex: number }) => {
      const playerIndex = getPlayerIndex(socket.id);
      
      const result = HeroEngine.reviveHero(gameState, playerIndex, heroCardId, targetCastleIndex, {
        addLog,
        checkBotTurn
      });

      if (!result.success) {
        socket.emit('error_message', result.reason);
        return;
      }

      broadcastState();
      checkBotTurn();
    },
    move_token_to_cell: (socket: any, { q, r }: { q: number, r: number }) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.moveTokenToCell(gameState, playerIndex, q, r, actionHelpers, socket);
    },
    select_token: (socket: any, tokenId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectToken(gameState, playerIndex, tokenId, actionHelpers, socket);
    },
    select_option: (socket: any, option: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectOption(gameState, playerIndex, option, actionHelpers, socket);
    },
    select_action_category: (socket: any, category: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectActionCategory(gameState, playerIndex, category, actionHelpers, socket);
    },
    select_common_action: (socket: any, action: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectCommonAction(gameState, playerIndex, action, actionHelpers, socket);
    },
    select_hero_action: (socket: any, action: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectHeroAction(gameState, playerIndex, action, actionHelpers, socket);
    },
    select_hero_for_action: (socket: any, tokenId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectHeroForAction(gameState, playerIndex, tokenId, actionHelpers, socket);
    },
    click_action_token: (socket: any, tokenId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.clickActionToken(gameState, playerIndex, tokenId, actionHelpers, socket);
    }, 
    cancel_action_token: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.cancelActionToken(gameState, playerIndex, actionHelpers, socket);
    },
    select_target: (socket: any, targetId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.resolveTargetSelection(gameState, playerIndex, targetId, actionHelpers, socket);
    },
    proceed_phase: (socket: any) => {
      ActionEngine.proceedPhase(gameState, actionHelpers, socket);
    },
    finish_action: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.finishAction(gameState, playerIndex, actionHelpers, socket);
    },
    pass_action: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.passAction(gameState, playerIndex, actionHelpers, socket);
    },
    undo_play: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1) return;

      const player = gameState.players[socket.id];
      if (!player) return;

      // Case 0: Undoing hire selection
      if (gameState.selectedOption === 'hire') {
        ActionEngine.cancelHireSelection(gameState, playerIndex, actionHelpers);
        broadcastState();
        return;
      }

      // Case 1: Undoing a card play
      if (gameState.lastPlayedCardId) {
        const cardIndex = gameState.playAreaCards.findIndex((c: any) => c.id === gameState.lastPlayedCardId);
        if (cardIndex !== -1) {
          const card = gameState.playAreaCards.splice(cardIndex, 1)[0];
          player.hand.push(card);
          gameState.lastPlayedCardId = null;
          
          if (gameState.phase === 'action_defend') {
            gameState.isDefended = false;
            gameState.isCounterAttack = false;
            gameState.hasDefenseCard = false;
            gameState.pendingDefenseCardId = null;
            gameState.canCounterAttack = false;
            broadcastState();
            return;
          }
          
          // If we were in action_select_option or action_resolve, go back to action_play_enhancement or action_play
          if (gameState.activeActionTokenId) {
            gameState.phase = 'action_play_enhancement';
          } else {
            gameState.phase = 'action_play';
          }
          gameState.selectedOption = null;
          gameState.selectedTokenId = null;
          gameState.reachableCells = [];
          
          addLog(`玩家${playerIndex + 1}撤回了出牌 (Player ${playerIndex + 1} undid card play)`, playerIndex);
          broadcastState();
          return;
        }
      }

      // Case 2: Undoing action selection (no card played)
      if (gameState.phase === 'action_resolve' || gameState.phase === 'action_select_option' || gameState.phase === 'action_select_skill' || gameState.phase === 'action_select_target') {
        if (gameState.activeActionTokenId) {
          ActionEngine.cancelActionToken(gameState, playerIndex, actionHelpers, socket);
          return;
        }
      }
      
      broadcastState();
    },
    cancel_play_card: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1) return;

      const player = gameState.players[socket.id];
      if (!player) return;

      if (gameState.lastPlayedCardId) {
        const cardIndex = gameState.playAreaCards.findIndex((c: any) => c.id === gameState.lastPlayedCardId);
        if (cardIndex !== -1) {
          const card = gameState.playAreaCards.splice(cardIndex, 1)[0];
          player.hand.push(card);
          gameState.lastPlayedCardId = null;
          
          if (gameState.activeActionTokenId) {
            gameState.phase = 'action_play_enhancement';
          } else {
            gameState.phase = 'action_play';
          }
          gameState.selectedOption = null;
          gameState.selectedTokenId = null;
          gameState.reachableCells = [];
          
          addLog(`玩家${playerIndex + 1}撤回了出牌 (Player ${playerIndex + 1} undid card play)`, playerIndex);
          broadcastState();
        }
      }
    },

    cancel_hire_selection: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.cancelHireSelection(gameState, playerIndex, actionHelpers);
    },

    checkAndResetChanting: (tokenId: string) => {
      const magicCircle = gameState.magicCircles.find((mc: any) => mc.state === 'chanting' && mc.chantingTokenId === tokenId);
      if (magicCircle) {
        const token = gameState.tokens.find((t: any) => t.id === tokenId);
        const card = token ? gameState.tableCards.find((c: any) => c.id === token.boundToCardId) : null;
        const ownerIndex = card ? (card.y > 0 ? 0 : 1) : -1;

        magicCircle.state = 'idle';
        magicCircle.chantingTokenId = undefined;
        if (ownerIndex !== -1) {
          addLog(`玩家${ownerIndex + 1}的英雄中断了咏唱 (Player ${ownerIndex + 1}'s hero interrupted chanting)`, ownerIndex);
        }
      }
    }
  };
};




