import { ActionEngine } from '../../src/logic/action/actionEngine.ts';
import { HeroEngine } from '../../src/logic/hero/heroEngine.ts';
import { CardLogic } from '../../src/logic/card/cardLogic.ts';
import { CombatLogic } from '../../src/logic/combat/combatLogic.ts'; 
import { skillRegistry } from '../../src/logic/skills/skillRegistry.ts';
import { SkillContext } from '../../src/logic/skills/types.ts';
import { pixelToHex } from '../../src/shared/utils/hexUtils.ts';

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
    play_card: async (socket: any, { cardId, x, y, targetCastleIndex }: { cardId: string, x?: number, y?: number, targetCastleIndex?: number }) => {
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
        await ActionEngine.endResolveAttackCounter(gameState, playerIndex, actionHelpers, socket);
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
    revive_hero: async (socket: any, { heroCardId, targetCastleIndex }: { heroCardId: string, targetCastleIndex: number }) => {
      const playerIndex = getPlayerIndex(socket.id);
      
      const result = await HeroEngine.reviveHero(gameState, playerIndex, heroCardId, targetCastleIndex, actionHelpers);

      if (!result.success) {
        socket.emit('error_message', result.reason);
        return;
      }

      broadcastState();
      checkBotTurn();
    },
    move_token_to_cell: async (socket: any, { q, r }: { q: number, r: number }) => {
      const playerIndex = getPlayerIndex(socket.id);
      await ActionEngine.moveTokenToCell(gameState, playerIndex, q, r, actionHelpers, socket);
    },
    remove_ember_zone: async (socket: any, { q, r }: { q: number, r: number }) => {
      const playerIndex = getPlayerIndex(socket.id);
      await ActionEngine.removeEmberZone(gameState, playerIndex, q, r, actionHelpers, socket);
    },
    select_action_category: (socket: any, category: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectActionCategory(gameState, playerIndex, category, actionHelpers, socket);
    },
    deep_freeze_break: async (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      await ActionEngine.deepFreezeBreak(gameState, playerIndex, actionHelpers, socket);
    },
    select_common_action: async (socket: any, action: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      await ActionEngine.selectCommonAction(gameState, playerIndex, action, actionHelpers, socket);
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
    use_skill: async (socket: any, payload: { skillId: string, targetTokenId?: string, targetHex?: { q: number, r: number } }) => {
      const playerIndex = getPlayerIndex(socket.id);
      await ActionEngine.useSkill(gameState, playerIndex, payload, actionHelpers, socket);
    },
    select_skill_target: (socket: any, payload: { skillId: string }) => {
      const playerIndex = getPlayerIndex(socket.id);
      console.log(`[select_skill_target] playerIndex=${playerIndex}, payload=${JSON.stringify(payload)}, phase=${gameState.phase}, activePlayerIndex=${gameState.activePlayerIndex}`);
      if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex) return;
      if (gameState.phase !== 'action_select_skill') return;
      
      gameState.phase = 'action_select_skill_target';
      gameState.activeSkillId = payload.skillId;

      // Populate reachableCells for highlighting
      const skill = skillRegistry.getSkill(payload.skillId);
      if (skill && skill.getValidTargets) {
        const context: SkillContext = {
          gameState,
          playerIndex,
          sourceTokenId: gameState.activeHeroTokenId || '',
        };
        const targets = skill.getValidTargets(context);
        
        // Convert target IDs to hexes for highlighting
        gameState.reachableCells = targets.map(target => {
          if (typeof target === 'string') {
            if (target.startsWith('monster_') || target.startsWith('icepillar_')) {
              const parts = target.split('_');
              return { q: parseInt(parts[1]), r: parseInt(parts[2]) };
            }
            if (target.includes('_')) {
              const parts = target.split('_');
              return { q: parseInt(parts[0]), r: parseInt(parts[1]) };
            }
            const token = gameState.tokens.find(t => t.id === target);
            if (token) return pixelToHex(token.x, token.y);
          } else if (typeof target === 'object' && 'q' in target) {
            return target;
          }
          return null;
        }).filter(h => h !== null) as { q: number, r: number }[];
      }

      console.log(`[select_skill_target] phase changed to action_select_skill_target, activeSkillId=${gameState.activeSkillId}, reachableCells=${gameState.reachableCells.length}`);
      broadcastState();
      checkBotTurn();
    },
    select_target: async (socket: any, targetId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      await ActionEngine.resolveTargetSelection(gameState, playerIndex, targetId, actionHelpers, socket);
    },
    proceed_phase: (socket: any) => {
      ActionEngine.proceedPhase(gameState, actionHelpers, socket);
    },
    finish_action: async (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      await ActionEngine.finishAction(gameState, playerIndex, actionHelpers, socket);
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
      if (gameState.phase === 'hire') {
        ActionEngine.cancelHireSelection(gameState, playerIndex, actionHelpers);
        broadcastState();
        checkBotTurn();
        return;
      }

      if (gameState.phase === 'buy') {
        ActionEngine.cancelBuySelection(gameState, playerIndex, actionHelpers);
        broadcastState();
        checkBotTurn();
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
            checkBotTurn();
            return;
          }
          
          // If we were in action_resolve, go back to action_play_enhancement or action_play
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
          checkBotTurn();
          return;
        }
      }

      // Case 2: Undoing action selection (no card played)
      if (gameState.phase === 'action_select_skill_target') {
        if (gameState.skillQueue && gameState.skillQueue.length > 0) {
          const currentItem = gameState.skillQueue[0];
          if (currentItem.canUndo !== false) {
            ActionEngine.cancelActionToken(gameState, playerIndex, actionHelpers, socket);
          }
          return;
        }
        gameState.phase = 'action_select_skill';
        gameState.activeSkillId = null;
        broadcastState();
        checkBotTurn();
        return;
      }

      if (gameState.phase === 'action_select_skill') {
        gameState.phase = 'action_select_action';
        broadcastState();
        checkBotTurn();
        return;
      }

      if (gameState.phase === 'action_resolve' || gameState.phase === 'action_select_target') {
        if (gameState.activeActionTokenId) {
          ActionEngine.cancelActionToken(gameState, playerIndex, actionHelpers, socket);
          return;
        }
      }
      
      broadcastState();
      checkBotTurn();
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
          checkBotTurn();
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




