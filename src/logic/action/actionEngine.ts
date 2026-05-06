import { GameState, GamePhase, Card, TableCard } from '../../shared/types/index.ts';
import { pixelToHex, hexToPixel, generateId, Hex, getHexDistance, hexRound } from '../../shared/utils/hexUtils.ts';
import { getPathDist, resolveTileEffect, getReachableHexes, isTargetInAttackRange, getAttackableHexes, getNeighbors, getRecoilHex } from '../map/mapLogic.ts';
import { CombatLogic } from '../combat/combatLogic.ts';
import { CardLogic } from '../card/cardLogic.ts';
import { HEROES_DATABASE } from '../../shared/config/heroes.ts';
import { REWARDS } from '../../shared/hex/tileLogic.ts';
import { HeroEngine } from '../hero/heroEngine.ts'
import { canHeroEvolve } from '../hero/heroLogic.ts'
import { skillRegistry } from '../skills/skillRegistry.ts';
import { SkillContext } from '../skills/types.ts';
import { SkillEngine } from '../skills/skillEngine.ts';
import {
  getMoveBonusFromEnhancement,
  getAttackRangeBonusFromEnhancement,
  isEnhancementCardName
} from '../card/enhancementModifiers.ts';

const heroesDatabase = HEROES_DATABASE;

export interface ActionHelpers {
  addLog: (message: string, playerIndex?: number) => void;
  broadcastState: () => void;
  checkBotTurn: () => void;
  setPhase: (phase: GamePhase) => void;
  checkAndResetChanting: (tokenId: string) => void;
  addReputation: (playerIndex: number, amount: number, reason: string) => void;
  checkAllTokensUsed: () => void;
  updateAvailableActions: (playerIndex: number) => void;
  discardOpponentCard: (playerIndex: number) => void;
  resolveSkillPrompt?: (response: any) => void;
  promptPlayer?: (playerIndex: number, promptType: string, context: any) => Promise<any>;
}

export class ActionEngine {
  static async initiateAttack(
    gameState: GameState,
    playerIndex: number,
    attackerCardId: string,
    targetCardId: string,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    const attackerCard = gameState.tableCards.find(c => c.id === attackerCardId);
    const targetCard = gameState.tableCards.find(c => c.id === targetCardId);
    
    if (attackerCard && targetCard) {
      helpers.addLog(`发起阶段: ${attackerCard.heroClass} 对 ${targetCard.heroClass} 发起了攻击`, playerIndex);
    }

    const targetToken = gameState.tokens.find(t => t.boundToCardId === targetCardId);
    gameState.selectedTargetId = targetToken ? targetToken.boundToCardId || null : targetCardId;

    // Trigger onBeforeAttack hook
    const { SkillEngine } = await import('../skills/skillEngine.ts');
    const interrupted = await SkillEngine.triggerEvent('onBeforeAttack', gameState, helpers as any, {
      attackerTokenId: gameState.selectedTokenId,
      defenderTokenId: targetToken?.id
    });

    if (interrupted) {
      // The skill engine has taken over (e.g., prompting for Guardian Swap)
      // We save the pending attack info so it can be resumed later
      if (gameState.pendingSkillPrompt) {
        gameState.pendingSkillPrompt.context = {
          ...gameState.pendingSkillPrompt.context,
          pendingAction: 'attack',
          attackerCardId,
          targetCardId
        };
      }
      helpers.broadcastState();
      helpers.checkBotTurn();
      return;
    }

    gameState.phase = 'action_defend';
    gameState.notification = null;
    gameState.lastPlayedCardId = null;
    gameState.pendingDefenseCardId = null;
    gameState.hasDefenseCard = false;
    gameState.canCounterAttack = false;
    gameState.isCounterAttack = false;
    gameState.isDefended = false;
    gameState.attackInitiatorIndex = playerIndex;
    gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
    gameState.reachableCells = [];
    helpers.addLog(`请玩家${gameState.activePlayerIndex + 1}打出防御卡，或选择Pass`, gameState.activePlayerIndex);
    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  /**
   * 处理移动逻辑 (Move logic)
   */
  static async moveTokenToCell(
    gameState: GameState,
    playerIndex: number,
    q: number,
    r: number,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    const enhancementCard = gameState.activeEnhancementCardId 
      ? gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId) 
      : null;

    if (gameState.phase === 'action_resolve' && 
        playerIndex === gameState.activePlayerIndex && 
        gameState.selectedTokenId) {
      
      const token = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
      console.log(`[moveTokenToCell] token found: ${!!token}, reachable: ${gameState.reachableCells.some(c => c.q === q && c.r === r)}, q: ${q}, r: ${r}`);
      if (token && gameState.reachableCells.some(c => c.q === q && c.r === r)) {
        console.log(`[moveTokenToCell] selectedOption: ${gameState.selectedOption}, activeActionType: ${gameState.activeActionType}`);
        if (gameState.selectedOption === 'move' || 
            gameState.selectedOption === 'sprint' || 
            (gameState.phase === 'action_resolve' && gameState.activeActionType === 'move')) {
          
          const currentHex = pixelToHex(token.x, token.y);
          const dist = getPathDist(currentHex, { q, r }, gameState);
          console.log(`[moveTokenToCell] dist: ${dist}, remainingMv: ${gameState.remainingMv}`);
          
          if (dist <= gameState.remainingMv!) {
            // Trigger onBeforeMove hook
            const { SkillEngine } = await import('../skills/skillEngine.ts');
            const interrupted = await SkillEngine.triggerEvent('onBeforeMove', gameState, helpers as any, {
              movingTokenId: token.id,
              targetHex: { q, r },
              dist
            });

            if (interrupted) {
              if (gameState.pendingSkillPrompt) {
                gameState.pendingSkillPrompt.context = {
                  ...gameState.pendingSkillPrompt.context,
                  pendingAction: 'move',
                  targetHex: { q, r }
                };
              }
              helpers.broadcastState();
              helpers.checkBotTurn();
              return;
            }

            if (!gameState.movementHistory) gameState.movementHistory = [];
            
            // Check if leaving a magic circle while chanting
            const wasChanting = gameState.magicCircles?.some(mc => mc.chantingTokenId === token.id);
            
            gameState.movementHistory.push({ 
              tokenId: token.id, 
              fromX: token.x, 
              fromY: token.y, 
              mvCost: dist, 
              wasChanting 
            });
            
            helpers.checkAndResetChanting(token.id);

            const pos = hexToPixel(q, r);
            token.x = pos.x;
            token.y = pos.y;
            gameState.remainingMv! -= dist;

            // If the hero has 骑士战靴 equipped, mark it as used in this turn
            if (token.boundToCardId) {
              const equipments = gameState.tableCards.filter(c => c && c.equippedToId === token.boundToCardId);
              for (const eq of equipments) {
                if (eq.name === '骑士战靴') {
                  eq.usedInTurn = true;
                }
              }
            }

            // --- 战场旗帜 trigger ---
            const allies = gameState.tokens.filter(t => t.id !== token.id && ((t.y > 0 && token.y > 0) || (t.y < 0 && token.y < 0)));
            for (const ally of allies) {
              if (ally.boundToCardId) {
                const eq = gameState.tableCards.find(c => c && c.equippedToId === ally.boundToCardId && c.name === '战场旗帜');
                if (eq) {
                   const allyHex = pixelToHex(ally.x, ally.y);
                   const isAdjacentNow = getHexDistance(allyHex, { q, r }) === 1;
                   // Just check adjacency on destination 
                   if (isAdjacentNow) {
                     helpers.addLog(`[战场旗帜] 生效！旗帜持有者移动1格`, playerIndex);
                     const resp = await helpers.promptPlayer!(playerIndex, 'heal_move', { message: `请选择战场旗帜持有者移动目标`});
                     if (resp && resp.targetHex) {
                       const pos = hexToPixel(resp.targetHex.q, resp.targetHex.r);
                       ally.x = pos.x; 
                       ally.y = pos.y;
                       socket.emit('item_moved', { type: 'token', id: ally.id, x: pos.x, y: pos.y });
                     }
                   }
                }
              }
            }

            // Tile effect logic
            const effect = resolveTileEffect({ q, r }, token.id, gameState);
            if (effect.type === 'trap' && effect.damage) {
              const heroCard = gameState.tableCards.find(c => c.id === token.boundToCardId);
              if (heroCard) {
                heroCard.damage = (heroCard.damage || 0) + effect.damage;
                let damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === token.boundToCardId);
                if (!damageCounter) {
                  damageCounter = { 
                    id: generateId(), 
                    type: 'damage', 
                    x: token.x + 20, 
                    y: token.y - 20, 
                    value: 0, 
                    boundToCardId: token.boundToCardId 
                  };
                  gameState.counters.push(damageCounter);
                }
                damageCounter.value = heroCard.damage;
                if (effect.log) helpers.addLog(effect.log, playerIndex);
                
                // Check if hero dies
                if (CombatLogic.isHeroDead(heroCard, gameState)) {
                  helpers.addLog(`玩家${playerIndex + 1}的英雄被陷阱击杀！`, playerIndex);
                  await CombatLogic.handleHeroDeath(heroCard, token, playerIndex, helpers, gameState);
                }
              }
              
              // Place time counter on trap
              gameState.counters.push({ id: generateId(), type: 'time', x: pos.x, y: pos.y, value: 0 });
            }

            // Increment action count for this token if it's the first move in this action
            const hasMovedThisAction = gameState.movementHistory?.some((step, idx) => 
              step.tokenId === token.id && 
              step.mvCost > 0 && 
              idx < gameState.movementHistory!.length - 1
            );
            if (!hasMovedThisAction) {
              if (!gameState.roundActionCounts[token.id]) gameState.roundActionCounts[token.id] = 0;
              gameState.roundActionCounts[token.id]++;
            }
            
            const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
            if (card) {
              helpers.addLog(`玩家${playerIndex + 1}的${card.heroClass}移动到了(${q}, ${r})`, playerIndex);
            }

            if (gameState.remainingMv! > 0) {
              gameState.reachableCells = getReachableHexes({ q, r }, gameState.remainingMv!, playerIndex, gameState);
            } else {
              gameState.reachableCells = [];
            }
            helpers.broadcastState();
            helpers.checkBotTurn();
          }
        } else if (gameState.selectedOption === 'turret_attack') {
          // Interrupt chanting when performing an action
          helpers.checkAndResetChanting(token.id);

          // Handle attack on hex
          const monster = gameState.map?.monsters?.find(m => m.q === q && m.r === r);
          if (monster) {
            const pos = hexToPixel(q, r);
            const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
            if (!hasTimer) {
              // Attack monster
              let damageCounter = gameState.counters.find(c => c.type === 'damage' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
              if (!damageCounter) {
                damageCounter = { id: generateId(), type: 'damage', x: pos.x, y: pos.y, value: 0 };
                gameState.counters.push(damageCounter);
              }
              
              const damage = 1; // Turret damage is 1
              damageCounter.value += damage;
              
              const heroCard = gameState.tableCards.find(c => c.id === token.boundToCardId);
              if (heroCard) {
                helpers.addLog(`发起阶段: ${heroCard.heroClass} 使用炮台对 LV${monster.level}怪物 发起了攻击`, playerIndex);
              }
              helpers.addLog(`结算阶段: LV${monster.level}怪物 受到 ${damage} 点炮台伤害，当前受伤计数器为 ${damageCounter.value}`, playerIndex);

              if (damageCounter.value >= monster.level) {
                // Monster dies
                gameState.counters = gameState.counters.filter(c => c.id !== damageCounter!.id);
                gameState.counters.push({ id: generateId(), type: 'time', x: pos.x, y: pos.y, value: 0 });
                
                helpers.addLog(`阵亡阶段: LV${monster.level}怪物 已阵亡`, playerIndex);

                // Gain EXP and Gold
                const rewards = CombatLogic.getCombatRewards(heroCard!, 'monster', true, monster.level);
                
                if (rewards.exp > 0) CombatLogic.addExp(heroCard!, rewards.exp, gameState);
                if (rewards.gold > 0) CombatLogic.addGold(playerIndex, rewards.gold, gameState);
                
                helpers.addLog(`奖励阶段: ${heroCard?.heroClass} 击败了 LV${monster.level}怪物，获得 ${rewards.exp} 经验和 ${rewards.gold} 金币`, playerIndex);
                gameState.notification = `击杀怪物！获得 ${rewards.exp} 经验和 ${rewards.gold} 金币。`;
                
                // Reputation scoring
                if (rewards.reputation > 0) {
                  helpers.addReputation(playerIndex, rewards.reputation, `击杀LV${monster.level}怪物`);
                }
              } else {
                // Turret attack does not trigger counter-attack from monster
                helpers.addLog(`反击阶段: 炮台攻击不会触发怪物的反击`, playerIndex);
              }
            }
          }
          
          const enemyCastle = gameState.map?.castles?.[1 - playerIndex as 0 | 1]?.find(c => c.q === q && c.r === r);
          if (enemyCastle) {
            gameState.castleHP[1 - playerIndex] -= 1;
            const heroCard = gameState.tableCards.find(c => c.id === token.boundToCardId);
            if (heroCard) {
              helpers.addLog(`发起阶段: ${heroCard.heroClass} 使用炮台对敌方王城发起了攻击`, playerIndex);
            }
            helpers.addLog(`结算阶段: 敌方王城受到 1 点炮台伤害，剩余 HP: ${gameState.castleHP[1 - playerIndex]}`, playerIndex);
            
            if (gameState.castleHP[1 - playerIndex] <= 0) {
              gameState.notification = `游戏结束！玩家 ${playerIndex + 1} 摧毁了敌方王城，获得胜利！`;
              gameState.gameStarted = false;
            } else {
              gameState.notification = `王城受到攻击！玩家 ${1 - playerIndex + 1} 的王城 HP 剩余 ${gameState.castleHP[1 - playerIndex]}。`;
            }
          }
          
          helpers.broadcastState();

          // Attack enemy hero
          const enemyTokens = gameState.tokens.filter(t => {
             const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
             if (!card) return false;
             const isEnemy = playerIndex === 0 ? card.y < 0 : card.y > 0;
             if (!isEnemy) return false;
             const hex = pixelToHex(t.x, t.y);
             return hex.q === q && hex.r === r;
          });
          
          if (enemyTokens.length > 0) {
            const targetToken = enemyTokens[0];
            const targetCard = gameState.tableCards.find(c => c.id === targetToken.boundToCardId);
            const heroCard = gameState.tableCards.find(c => c.id === token.boundToCardId);
            
            if (heroCard && targetCard) {
              await ActionEngine.initiateAttack(
                gameState,
                playerIndex,
                heroCard.id,
                targetCard.id,
                helpers,
                socket
              );
              return;
            }
          }

          // Finish action
          await ActionEngine.finishAction(gameState, playerIndex, helpers, socket);
          return;
        } else if (gameState.selectedOption === 'attack' || (gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack')) {
          // Interrupt chanting when performing an action
          helpers.checkAndResetChanting(token.id);

          // Handle attack on hex
          const monster = gameState.map?.monsters?.find(m => m.q === q && m.r === r);
          if (monster) {
            await CombatLogic.resolveMonsterAttack(gameState, playerIndex, q, r, helpers);
            
            gameState.reachableCells = [];
            if (gameState.phase === 'action_resolve') {
              await ActionEngine.finishAction(gameState, playerIndex, helpers, socket);
            } else {
              helpers.broadcastState();
              helpers.checkBotTurn();
            }
            return;
          }
          
          // Attack enemy castle
          const enemyIndex = 1 - playerIndex;
          const enemyCastles = gameState.map?.castles?.[enemyIndex as 0 | 1] || [];
          const isEnemyCastle = enemyCastles.some(c => c.q === q && c.r === r);
          if (isEnemyCastle) {
            const enemyUnit = gameState.tokens.find(t => {
              const hex = pixelToHex(t.x, t.y);
              return hex.q === q && hex.r === r;
            });
            if (!enemyUnit) {
              await CombatLogic.resolveCastleAttack(gameState, playerIndex, enemyIndex, helpers);
              
              // Finish attack action
              gameState.selectedOption = null;
              gameState.selectedTargetId = null;
              gameState.selectedTokenId = null;
              gameState.reachableCells = [];
              if (gameState.phase === 'action_resolve') {
                await ActionEngine.finishAction(gameState, playerIndex, helpers, socket);
              } else {
                helpers.broadcastState();
                helpers.checkBotTurn();
              }
              return;
            }
          }

          // Attack enemy hero
          const enemyTokens = gameState.tokens.filter(t => {
             const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
             if (!card) return false;
             const isEnemy = playerIndex === 0 ? card.y < 0 : card.y > 0;
             if (!isEnemy) return false;
             const hex = pixelToHex(t.x, t.y);
             return hex.q === q && hex.r === r;
          });
          
          if (enemyTokens.length > 0) {
            const targetToken = enemyTokens[0];
            const targetCard = gameState.tableCards.find(c => c.id === targetToken.boundToCardId);
            const heroCard = gameState.tableCards.find(c => c.id === token.boundToCardId);
            
            if (heroCard && targetCard) {
              await ActionEngine.initiateAttack(
                gameState,
                playerIndex,
                heroCard.id,
                targetCard.id,
                helpers,
                socket
              );
              return;
            }
          }
        }
      }
    }
  }

  /**
   * 处理行动Token点击逻辑 (Action token click logic)
   */
  static clickActionToken(
    gameState: GameState,
    playerIndex: number,
    tokenId: string,
    helpers: ActionHelpers,
    socket: any
  ): void {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || 
        (gameState.phase !== 'action_play' && gameState.phase !== 'action_options' && 
         gameState.phase !== 'action_select_hero' && gameState.phase !== 'action_play_enhancement' && 
         gameState.phase !== 'action_select_action')) return;

    const token = gameState.actionTokens.find(t => t.id === tokenId);
    if (!token || token.playerIndex !== playerIndex || token.used) return;

    gameState.activeActionTokenId = tokenId;
    gameState.activeEnhancementCardId = null; // Reset enhancement card
    gameState.movementHistory = []; // Initialize movement history for undo
    gameState.lastPlayedCardId = null; // Clear last played card so undo works correctly for the token
    if (token.heroCardId) {
      const heroToken = gameState.tokens.find(t => t.boundToCardId === token.heroCardId);
      if (heroToken) {
        gameState.activeHeroTokenId = heroToken.id;

        // Check if hero has deep_freeze status
        const isFrozen = gameState.statuses?.some(s => s.tokenId === heroToken.id && s.status === 'deep_freeze');
        if (isFrozen) {
          gameState.phase = 'action_deep_freeze_break';
        } else {
          gameState.phase = 'action_options';
        }
        
        gameState.notification = null;
      } else {
        // Hero might be dead/waiting revival
        gameState.phase = 'action_options';
        gameState.notification = null;
      }
    } else {
      gameState.activeHeroTokenId = null;
      gameState.phase = 'action_select_hero';
      gameState.notification = null;
    }
    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  /**
   * Deep freeze break action
   */
  static async deepFreezeBreak(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_deep_freeze_break') return;

    if (!gameState.activeHeroTokenId) return;

    const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
    if (!heroToken) return;

    // Do NOT remove status here. We set a flag and remove it in finishAction 
    // so that cancelling the action safely preserves the frozen status.
    gameState.wasDeepFreezeBroken = true;

    // Force move action with mv=1
    gameState.phase = 'action_resolve';
    gameState.selectedOption = 'move';
    gameState.activeActionType = 'move';
    gameState.remainingMv = 1;
    gameState.selectedTokenId = heroToken.id;
    
    // Calculate reachable hexes for move = 1
    const tokenHex = pixelToHex(heroToken.x, heroToken.y);
    const reachableHexes = getReachableHexes(tokenHex, 1, playerIndex, gameState);
    gameState.reachableCells = reachableHexes;
    
    helpers.addLog(`玩家${playerIndex + 1}的英雄准备破冰并移动... (Hero preparing to break ice)`, playerIndex);
    helpers.broadcastState();
  }

  /**
   * 处理取消行动Token逻辑 (Cancel action token logic)
   */
  static cancelActionToken(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers,
    socket: any
  ): void {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex) return;
    
    // If we were in a sub-phase of an action, go back to action_options
    const subPhases = [
      'action_select_action', 
      'action_common', 
      'action_play_enhancement', 
      'action_select_substitute',
      'action_resolve',
      'action_select_skill',
      'action_select_target'
    ];
    
    if (subPhases.includes(gameState.phase) || gameState.phase === 'action_select_skill_target') {
      // Reset action-specific state
      gameState.skillQueue = [];
      gameState.isFollowUpAction = false;
      gameState.activeSkillState = null;
      
      // Restore hero positions if they moved during this action
      if (gameState.movementHistory && gameState.movementHistory.length > 0) {
        // Restore in reverse order
        for (let i = gameState.movementHistory.length - 1; i >= 0; i--) {
          const step = gameState.movementHistory[i];
          const heroToken = gameState.tokens.find(t => t.id === step.tokenId);
          if (heroToken) {
            heroToken.x = step.fromX;
            heroToken.y = step.fromY;
            
            // If it was chanting, restore chanting state
            if (step.wasChanting) {
              const hex = pixelToHex(heroToken.x, heroToken.y);
              const mc = (gameState.magicCircles || []).find(m => m && m.q === hex.q && m.r === hex.r);
              if (mc) {
                mc.state = 'chanting';
                mc.chantingTokenId = heroToken.id;
              }
            }
          }
        }
        gameState.movementHistory = [];
      }

      // If we are cancelling from a sub-phase, we should also return the enhancement card to hand if one was played
      if (gameState.activeEnhancementCardId) {
        let cardIndex = gameState.playAreaCards.findIndex(c => c.id === gameState.activeEnhancementCardId);
        let cardList: (Card | TableCard)[] = gameState.playAreaCards;
        if (cardIndex === -1) {
          cardIndex = gameState.discardPiles.action.findIndex(c => c.id === gameState.activeEnhancementCardId);
          cardList = gameState.discardPiles.action;
        }
        
        if (cardIndex !== -1) {
          const card = cardList.splice(cardIndex, 1)[0];
          const player = Object.values(gameState.players).find(p => p.id === gameState.seats[playerIndex]);
          if (player) {
            player.hand.push(card);
            helpers.addLog(`玩家${playerIndex + 1}撤回了增强卡 (Player ${playerIndex + 1} undid enhancement card)`, playerIndex);
          }
        }
        gameState.activeEnhancementCardId = null;
        if (gameState.lastPlayedCardId === gameState.activeEnhancementCardId) {
          gameState.lastPlayedCardId = null;
        }
      }

      gameState.selectedTokenId = null;
      gameState.selectedOption = null;
      gameState.reachableCells = [];
      gameState.activeActionType = null;
      gameState.skillQueue = [];
      gameState.isFollowUpAction = false;
      gameState.notification = null;
      
      if (gameState.wasDeepFreezeBroken) {
        gameState.wasDeepFreezeBroken = false;
        gameState.phase = 'action_deep_freeze_break';
      } else {
        gameState.phase = 'action_options';
      }
      helpers.broadcastState();
      helpers.checkBotTurn();
      return;
    }

    gameState.activeActionTokenId = null;
    gameState.activeHeroTokenId = null;
    gameState.activeEnhancementCardId = null;
    gameState.wasDeepFreezeBroken = false;
    gameState.phase = 'action_play';
    gameState.notification = null;
    
    // 清除瞄准等临时 buff
    if (gameState.turnModifiers) {
      gameState.turnModifiers = gameState.turnModifiers.filter(mod => mod.sourceSkillId !== 'archer_aim');
    }

    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  /**
   * 处理行动类别选择逻辑 (Action category selection logic)
   */
  static selectActionCategory(
    gameState: GameState,
    playerIndex: number,
    category: 'play_card' | 'direct_action' | 'common_action' | 'pass',
    helpers: ActionHelpers,
    socket: any
  ): void {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_options') return;

    if (category === 'pass') {
      const token = gameState.actionTokens.find(t => t.id === gameState.activeActionTokenId);
      if (token) {
        token.used = true;
        helpers.addLog(`玩家${playerIndex + 1}跳过了该行动Token`, playerIndex);
        gameState.activeActionTokenId = null;
        gameState.activeHeroTokenId = null;
        gameState.phase = 'action_play';
        gameState.activePlayerIndex = 1 - playerIndex;
        helpers.checkAllTokensUsed();
      }
      return;
    }

    if (category === 'play_card') {
      gameState.phase = 'action_play_enhancement';
      gameState.notification = null;
    } else if (category === 'direct_action') {
      gameState.phase = 'action_select_action';
      gameState.notification = null;
    } else if (category === 'common_action') {
      gameState.phase = 'action_common';
      gameState.notification = null;
    }
    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  /**
   * 处理公共行动选择逻辑 (Common action selection logic)
   */
  static async selectCommonAction(
    gameState: GameState,
    playerIndex: number,
    action: 'open_chest' | 'early_buy' | 'seize_initiative' | 'hire',
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_common') return;

    const token = gameState.actionTokens.find(t => t.id === gameState.activeActionTokenId);
    if (!token) return;

    if (action === 'open_chest') {
      const playerTokens = gameState.tokens.filter(t => {
        const c = gameState.tableCards.find(tc => tc.id === t.boundToCardId);
        return c && ((playerIndex === 0 && c.y > 0) || (playerIndex === 1 && c.y < 0));
      });
      
      let openedAny = false;
      for (const token of playerTokens) {
        const hex = pixelToHex(token.x, token.y);
        const chest = gameState.map?.chests?.find(ch => ch.q === hex.q && ch.r === hex.r);
        if (chest) {
          const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - token.x) < 10 && Math.abs(c.y - token.y) < 10);
          if (!hasTimer) {
            const chestType = chest.type === 'T1' ? 1 : (chest.type === 'T2' ? 2 : 3);
            let goldReward = 0;
            if (chestType === 1) goldReward = REWARDS.CHEST.T1_GOLD;
            else if (chestType === 2) goldReward = REWARDS.CHEST.T2_GOLD;
            else if (chestType === 3) goldReward = REWARDS.CHEST.T3_GOLD;

            const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
            if (goldCounter) goldCounter.value += goldReward;

            const deckKey = `treasure${chestType}` as keyof typeof gameState.decks;
            if (gameState.decks[deckKey] && (gameState.decks[deckKey] as any[]).length > 0) {
              const treasureCard = (gameState.decks[deckKey] as any[]).pop()!;
              const player = gameState.players[gameState.seats[playerIndex]!];
              const heroCard = gameState.tableCards.find(tc => tc.id === token.boundToCardId);
              
              if (player && heroCard) {
                // Look for LV3 replacement
                if (treasureCard.type === 'treasure3') {
                  const existingLV3Index = gameState.tableCards.findIndex(c => c && c.equippedToId === heroCard.id && c.type === 'treasure3');
                  if (existingLV3Index !== -1) {
                    const oldLV3 = gameState.tableCards.splice(existingLV3Index, 1)[0];
                    oldLV3.equippedToId = undefined;
                    if (!gameState.discardPiles.treasure) gameState.discardPiles.treasure = [];
                    gameState.discardPiles.treasure.push(oldLV3);
                    helpers.addLog(`玩家${playerIndex + 1}的英雄获得了新的LV3装备，原LV3装备已弃置`, playerIndex);
                  }
                }
                
                // Equip directly
                treasureCard.equippedToId = heroCard.id;
                treasureCard.faceUp = true;
                
                // Position calculations
                const equippedCards = gameState.tableCards.filter(c => c && c.equippedToId === heroCard.id);
                const idx = equippedCards.length;
                treasureCard.x = heroCard.x;
                treasureCard.y = heroCard.y > 0 ? (heroCard.y + 160 + (idx * 160)) : (heroCard.y - 160 - (idx * 160));
                
                gameState.tableCards.push(treasureCard);
                helpers.addLog(`玩家${playerIndex + 1}开启了${chestType}级宝箱，获得了${goldReward}金币并将装备 [${treasureCard.name || treasureCard.id}] 装备给英雄`, playerIndex);
                
                // Handle excess equipment
                const newEquippedCards = gameState.tableCards.filter(c => c && c.equippedToId === heroCard.id);
                if (newEquippedCards.length > 2 && helpers.promptPlayer) {
                  helpers.broadcastState(); // Broadcast state to show the new card
                  const response = await helpers.promptPlayer(playerIndex, 'discard_excess_equipment', { heroId: heroCard.id });
                  if (response && response.discardedCardId) {
                    const toDiscardIdx = gameState.tableCards.findIndex(c => c && c.id === response.discardedCardId);
                    if (toDiscardIdx !== -1) {
                      const discardedEquip = gameState.tableCards.splice(toDiscardIdx, 1)[0];
                      discardedEquip.equippedToId = undefined;
                      if (!gameState.discardPiles.treasure) gameState.discardPiles.treasure = [];
                      gameState.discardPiles.treasure.push(discardedEquip);
                      helpers.addLog(`玩家${playerIndex + 1}弃置了多余的装备卡`, playerIndex);
                      
                      // recalculate positions
                      const remainingEquipped = gameState.tableCards.filter(c => c && c.equippedToId === heroCard.id);
                      remainingEquipped.forEach((eq, i) => {
                        eq.x = heroCard.x;
                        eq.y = heroCard.y > 0 ? (heroCard.y + 160 + (i * 160)) : (heroCard.y - 160 - (i * 160));
                      });
                    }
                  }
                }
              }
            } else {
              helpers.addLog(`玩家${playerIndex + 1}开启了${chestType}级宝箱，获得了${goldReward}金币`, playerIndex);
            }

            gameState.counters.push({ id: generateId(), type: 'time', x: token.x, y: token.y, value: 0 });
            openedAny = true;
          }
        }
      }
      
      if (!openedAny) {
        socket.emit('error_message', '没有英雄在可开启的宝箱上');
        return;
      }
    } else if (action === 'early_buy') {
      const gold = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
      if (gold && gold.value > 0) {
        ActionEngine.startBuySelection(gameState, 'action_common', helpers);
        return;
      } else {
        socket.emit('error_message', '金币不足');
        return;
      }
    } else if (action === 'seize_initiative') {
      if (!gameState.hasSeizedInitiative) {
        gameState.hasSeizedInitiative = true;
        gameState.firstPlayerIndex = playerIndex;
        helpers.addLog(`玩家${playerIndex + 1}抢占了下回合先手`, playerIndex);
      } else {
        socket.emit('error_message', '先手已被抢占');
        return;
      }
    } else if (action === 'hire') {
      const gold = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
      if (gold && gold.value >= 2) {
        ActionEngine.startHireSelection(gameState, 'action_common', helpers);
        return;
      } else {
        socket.emit('error_message', '金币不足 (需要2金币)');
        return;
      }
    }

    token.used = true;
    gameState.activeActionTokenId = null;
    gameState.activePlayerIndex = 1 - playerIndex;
    gameState.phase = 'action_play';
    helpers.checkAllTokensUsed();
  }

  static cancelHireSelection(gameState, playerIndex, helpers) {
    if (playerIndex !== gameState.activePlayerIndex) return;

    gameState.selectedOption = null;
    gameState.selectedTargetId = null;
    gameState.selectedHireCost = null;
    gameState.selectedHireCastle = null;
    gameState.notification = null;

    if (gameState.hireSource === 'action_common') {
      gameState.phase = 'action_common';
    } else {
      gameState.phase = 'shop';
    }

    gameState.hireSource = null;
    helpers.broadcastState();
  }

  static cancelBuySelection(gameState, playerIndex, helpers) {
    if (playerIndex !== gameState.activePlayerIndex) return;

    gameState.selectedOption = null;
    gameState.selectedTargetId = null;
    gameState.notification = null;

    if (gameState.buySource === 'action_common') {
      gameState.phase = 'action_common';
    } else {
      gameState.phase = 'shop';
    }

    gameState.buySource = null;
    helpers.broadcastState();
  }

  static cancelBuyEquipSelection(gameState: any, playerIndex: number, helpers: any) {
    if (playerIndex !== gameState.activePlayerIndex) return;
    if (gameState.phase !== 'buy_select_equip_target') return;

    const pendingCardId = gameState.pendingEquipCardId;
    if (!pendingCardId) return;

    const player = gameState.players[gameState.seats[playerIndex]];
    if (!player) return;

    const cardIndex = player.hand.findIndex((c: any) => c.id === pendingCardId);
    if (cardIndex !== -1) {
      const card = player.hand[cardIndex];
      player.hand.splice(cardIndex, 1);
      
      const slot = gameState.pendingEquipSlot;
      // Put back to table cards
      gameState.tableCards.push({ 
        ...card, 
        faceUp: true, 
        x: slot ? slot.x : card.x, 
        y: slot ? slot.y : card.y 
      });
      
      // Refund gold
      const gold = gameState.counters.find((c: any) => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
      if (gold) {
        const level = parseInt(card.type?.replace('treasure', ''), 10) || 1;
        const cost = level === 3 ? 4 : level;
        gold.value += cost;
      }
    }

    gameState.pendingEquipCardId = null;
    gameState.pendingEquipSlot = null;
    gameState.selectedOption = 'buy';
    gameState.notification = null;
    gameState.phase = 'buy';
    
    helpers.broadcastState();
  }

  static startHireSelection(
    gameState: GameState,
    source: 'shop' | 'action_common',
    helpers: ActionHelpers
  ) {
    gameState.selectedOption = 'hire';
    gameState.selectedTargetId = null;
    gameState.selectedHireCost = null;
    gameState.selectedHireCastle = null;
    gameState.notification = null;
    gameState.hireSource = source;
    gameState.phase = 'hire';
    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  static startBuySelection(
    gameState: GameState,
    source: 'shop' | 'action_common',
    helpers: ActionHelpers
  ) {
    gameState.selectedOption = 'buy';
    gameState.selectedTargetId = null;
    gameState.notification = null;
    gameState.buySource = source;
    gameState.phase = 'buy';
    helpers.broadcastState();
    helpers.checkBotTurn();
  }  

  /**
   * 处理行动英雄选择逻辑 (Hero selection for action logic)
   */
  static selectHeroForAction(
    gameState: GameState,
    playerIndex: number,
    heroTokenId: string,
    helpers: ActionHelpers,
    socket: any
  ): void {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex) return;

    const heroToken = gameState.tokens.find(t => t.id === heroTokenId);
    if (!heroToken) return;
    
    // Verify hero belongs to player
    const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
    const isOwner = heroCard && ((playerIndex === 0 && heroCard.y > 0) || (playerIndex === 1 && heroCard.y < 0));
    if (!isOwner) return;

    // Verify hero is not dead
    const isDead = heroCard && gameState.counters.some(c => c.type === 'time' && c.boundToCardId === heroCard.id);
    if (isDead) {
      if (socket) socket.emit('error_message', '该英雄已阵亡，无法行动 (Hero is dead)');
      return;
    }

    if (gameState.phase === 'action_select_hero') {
      gameState.activeHeroTokenId = heroTokenId;
      gameState.phase = 'action_options';
      gameState.notification = null;
      helpers.broadcastState();
      helpers.checkBotTurn();
    } else if (gameState.phase === 'action_select_substitute') {
      gameState.activeHeroTokenId = heroTokenId;
      gameState.phase = 'action_options';
      gameState.notification = null;
      helpers.broadcastState();
      helpers.checkBotTurn();
    }
  }

  /**
   * 处理英雄行动选择逻辑 (Hero action selection logic)
   */
  static async selectHeroAction(
    gameState: GameState,
    playerIndex: number,
    actionType: 'move' | 'attack' | 'skill' | 'evolve' | 'chant' | 'fire' | 'turret_attack' | 'use_equipment',
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_select_action') return;

    const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
    if (!heroToken) {
      socket.emit('error_message', '未选择英雄 (No hero selected)');
      return;
    }

    if (actionType === 'evolve') {
      const heroCard = heroToken ? gameState.tableCards.find(c => c.id === heroToken.boundToCardId) : null;
      if (!heroCard) {
        socket.emit('error_message', '未选择英雄');
        return;
      }
      if(!canHeroEvolve(heroCard, gameState)){
        socket.emit('error_message', '英雄已达到最高等级或经验不足，无法进化');
        return;
      }
    }

    if (actionType === 'attack' || actionType === 'turret_attack') {
      helpers.checkAndResetChanting(heroToken.id);
      const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
      
      let ar = SkillEngine.getModifiedStat(heroToken.id, 'ar', gameState);
      const enhancementCard = gameState.activeEnhancementCardId
        ? (gameState.playAreaCards.find(c => c.id === gameState.activeEnhancementCardId) ||
          gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId))
        : null;

      ar += getAttackRangeBonusFromEnhancement(enhancementCard?.name);

      const attackerHex = pixelToHex(heroToken.x, heroToken.y);
      gameState.reachableCells = getAttackableHexes(attackerHex.q, attackerHex.r, ar, playerIndex, gameState, heroCard?.level || 1, actionType === 'turret_attack');
      gameState.phase = 'action_resolve';
      gameState.activeActionType = 'attack';
      gameState.selectedOption = actionType;
      gameState.selectedTokenId = heroToken.id;
    } else if (actionType === 'move') {
      helpers.checkAndResetChanting(heroToken.id);
      
      let mv = SkillEngine.getModifiedStat(heroToken.id, 'mv', gameState);
      const enhancementCard = gameState.activeEnhancementCardId
        ? (gameState.playAreaCards.find(c => c.id === gameState.activeEnhancementCardId) ||
          gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId))
        : null;

      mv += getMoveBonusFromEnhancement(enhancementCard?.name);

      const currentHex = pixelToHex(heroToken.x, heroToken.y);
      gameState.reachableCells = getReachableHexes(currentHex, mv, playerIndex, gameState);
      gameState.remainingMv = mv;
      gameState.phase = 'action_resolve';
      gameState.activeActionType = 'move';
      gameState.selectedTokenId = heroToken.id;
    } else if (actionType === 'skill') {
      helpers.checkAndResetChanting(heroToken.id);
      gameState.phase = 'action_select_skill';
    } else if (actionType === 'evolve') {
      helpers.checkAndResetChanting(heroToken.id);
      gameState.phase = 'action_resolve';
      gameState.activeActionType = 'evolve';
      gameState.selectedTokenId = heroToken.id;
      gameState.selectedTargetId = null;
      gameState.reachableCells = [];
    } else if (actionType === 'chant') {
      const hex = pixelToHex(heroToken.x, heroToken.y);
      const mc = (gameState.magicCircles || []).find(m => m && m.q === hex.q && m.r === hex.r && m.state === 'idle');
      if (!mc) {
        socket.emit('error_message', '英雄必须站在空闲的魔法阵上才能咏唱 (Hero must be on an idle magic circle to chant)');
        return;
      }
      // 咏唱动作直接结算，不需要再次点击确认 (Chant action resolves immediately)
      mc.state = 'chanting';
      mc.chantingTokenId = heroToken.id;
      helpers.addLog(`玩家${playerIndex + 1}的英雄开始咏唱`, playerIndex);
      
      await ActionEngine.finishAction(gameState, playerIndex, helpers, socket);
      return; // 直接返回，避免执行下方的 broadcastState
    } else if (actionType === 'fire') {
      const hex = pixelToHex(heroToken.x, heroToken.y);
      const mc = (gameState.magicCircles || []).find(m => m && m.q === hex.q && m.r === hex.r && m.state === 'chanting' && m.chantingTokenId === heroToken.id);
      if (!mc) {
        socket.emit('error_message', '英雄必须处于咏唱状态才能开火 (Hero must be chanting to fire)');
        return;
      }
      // Target is enemy castle
      const enemyIndex = 1 - playerIndex;
      gameState.reachableCells = gameState.map?.castles?.[enemyIndex as 0 | 1] || [];
      gameState.phase = 'action_resolve';
      gameState.activeActionType = 'fire';
      gameState.selectedTokenId = heroToken.id;
      gameState.notification = '选择敌方王城开火 (Select enemy castle to fire)';
    } else if (actionType === 'use_equipment') {
      helpers.checkAndResetChanting(heroToken.id);
      gameState.phase = 'action_select_equipment';
      gameState.activeActionType = 'use_equipment';
      gameState.selectedTokenId = heroToken.id;
    }
    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  /**
   * 处理使用装备卡主动技能逻辑
   */
  static async useEquipmentCard(
    gameState: GameState,
    playerIndex: number,
    equipmentCardId: string,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_select_equipment') return;

    const equipCard = (gameState.tableCards || []).find(c => c && c.id === equipmentCardId);
    if (!equipCard) {
      socket.emit('error_message', '找不到该装备 (Equipment not found)');
      return;
    }
    
    if (equipCard.usedInTurn) {
      socket.emit('error_message', '本回合已经使用过该装备 (Equipment already used this turn)');
      return;
    }

    const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
    if (!heroToken) return;

    // Apply effect based on name
    if (equipCard.name === '治疗药水') {
       equipCard.usedInTurn = true;
       // Discard item after use since it is consumable
       equipCard.equippedToId = undefined;
       if (!gameState.discardPiles.treasure) gameState.discardPiles.treasure = [];
       gameState.discardPiles.treasure.push(equipCard);
       gameState.tableCards = gameState.tableCards.filter(c => c && c.id !== equipmentCardId);
       
       // Process heal
       const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
       if (heroCard) {
          heroCard.damage = Math.max(0, (heroCard.damage || 0) - 1);
          helpers.addLog(`玩家${playerIndex + 1}使用了[${equipCard.name}]，恢复了1点生命值`, playerIndex);
       }
       await this.finishAction(gameState, playerIndex, helpers, socket);
    } else if (equipCard.name === '经验卷轴') {
       equipCard.usedInTurn = true;
       // Discard consumable
       equipCard.equippedToId = undefined;
       if (!gameState.discardPiles.treasure) gameState.discardPiles.treasure = [];
       gameState.discardPiles.treasure.push(equipCard);
       gameState.tableCards = gameState.tableCards.filter(c => c && c.id !== equipmentCardId);
       
       const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
       if (heroCard) {
          heroCard.xp = (heroCard.xp || 0) + 1;
          helpers.addLog(`玩家${playerIndex + 1}使用了[${equipCard.name}]，获得1点经验值`, playerIndex);
       }
       await this.finishAction(gameState, playerIndex, helpers, socket);
    } else if (equipCard.name === '冲刺卷轴' || equipCard.name === '远程战术') {
       equipCard.usedInTurn = true;
       // Discard consumable
       equipCard.equippedToId = undefined;
       if (!gameState.discardPiles.treasure) gameState.discardPiles.treasure = [];
       gameState.discardPiles.treasure.push(equipCard);
       gameState.tableCards = gameState.tableCards.filter(c => c && c.id !== equipmentCardId);

       const statType = equipCard.name === '冲刺卷轴' ? 'mv' : 'ar';
       const statName = equipCard.name === '冲刺卷轴' ? '移动' : '攻击';
       gameState.turnModifiers = gameState.turnModifiers || [];
       gameState.turnModifiers.push({ tokenId: heroToken.id, stat: statType, value: 1, type: 'add', sourceSkillId: 'equipment_' + equipCard.id });
       helpers.addLog(`玩家${playerIndex + 1}使用了[${equipCard.name}]，本回合${statName}范围+1`, playerIndex);
       await this.finishAction(gameState, playerIndex, helpers, socket);
    } else if (equipCard.name === '移动号角' || equipCard.name === '指挥旗') {
      const attackerHex = pixelToHex(heroToken.x, heroToken.y);
      const adjacentHexes = [
        { q: attackerHex.q + 1, r: attackerHex.r },
        { q: attackerHex.q + 1, r: attackerHex.r - 1 },
        { q: attackerHex.q, r: attackerHex.r - 1 },
        { q: attackerHex.q - 1, r: attackerHex.r },
        { q: attackerHex.q - 1, r: attackerHex.r + 1 },
        { q: attackerHex.q, r: attackerHex.r + 1 }
      ];
      const targetableHexes = adjacentHexes.filter(h => {
         const hasAlly = gameState.tokens.find(t => {
            if (t.type !== 'hero' || t.id === heroToken.id) return false;
            const tHex = pixelToHex(t.x, t.y);
            const isAlly = gameState.actionTokens.some(at => at.playerIndex === playerIndex && at.heroCardId === t.boundToCardId);
            return tHex.q === h.q && tHex.r === h.r && isAlly;
         });
         return hasAlly;
      });

      if (targetableHexes.length === 0) {
        socket.emit('error_message', '没有相邻的友方英雄可以成为目标 (No adjacent friendly heroes)');
        return;
      }

      equipCard.usedInTurn = true;
      if (equipCard.name === '移动号角') {
         equipCard.equippedToId = undefined;
         if (!gameState.discardPiles.treasure) gameState.discardPiles.treasure = [];
         gameState.discardPiles.treasure.push(equipCard);
         gameState.tableCards = gameState.tableCards.filter(c => c && c.id !== equipmentCardId);
      }
      // Need to select adjacent ally token
      gameState.phase = 'action_select_target';
      gameState.activeActionType = 'use_equipment';
      gameState.selectedTokenId = heroToken.id;
      
      gameState.reachableCells = targetableHexes;
      gameState.notification = '选择相邻友方英雄进行移动';
      
      // We hijack the activeSkillState to remember we are using this equipment
      gameState.activeSkillState = { equipmentEffect: 'move_ally', equipmentName: equipCard.name };
      helpers.addLog(`玩家${playerIndex + 1}使用了[${equipCard.name}]，请选择目标`, playerIndex);
      
      helpers.broadcastState();
      helpers.checkBotTurn();
    } else if (equipCard.name === '防御手套') {
      equipCard.usedInTurn = true;
      helpers.addLog(`玩家${playerIndex + 1}本回合激活了[${equipCard.name}]，可将任意卡牌视为防御卡`, playerIndex);
      await this.finishAction(gameState, playerIndex, helpers, socket);
    } else {
      socket.emit('error_message', '该装备没有主动技能 (This equipment has no active skill)');
    }
  }

  /**
   * 处理阶段推进逻辑 (Phase progression logic)
   */
  static proceedPhase(
    gameState: GameState,
    helpers: ActionHelpers,
    socket?: any
  ): void {
    gameState.lastEvolvedId = null;
    if (gameState.phase === 'supply') {
      const needsDiscard = Object.values(gameState.players).some(p => p && p.hand && p.hand.length > 5);
      if (needsDiscard) {
        gameState.phase = 'discard';
        helpers.addLog(`进入弃牌阶段`, -1);
      } else {
        gameState.phase = 'shop';
        gameState.selectedOption = null;
        gameState.selectedTargetId = null;
        gameState.activePlayerIndex = 1 - gameState.firstPlayerIndex;
        helpers.updateAvailableActions(gameState.activePlayerIndex);
        helpers.addLog(`进入商店阶段`, -1);
      }
      helpers.broadcastState();
      helpers.checkBotTurn();
    } else if (gameState.phase === 'end') {
      this.resolveEndPhase(gameState, helpers);
    }
  }

  /**
   * 处理目标选择逻辑 (Target selection logic)
   */
  static async resolveTargetSelection(
    gameState: GameState,
    playerIndex: number,
    targetId: string,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    if (playerIndex === gameState.activePlayerIndex) {
      
      gameState.selectedTargetId = targetId;
      
      if (gameState.phase === 'action_select_target' && gameState.activeActionType === 'use_equipment') {
        const equipmentName = gameState.activeSkillState?.equipmentName;
        if (equipmentName === '移动号角' || equipmentName === '指挥旗') {
          const targetToken = gameState.tokens.find(t => t.boundToCardId === targetId);
          if (!targetToken) {
             socket.emit('error_message', '无效的目标英雄 (Invalid target hero)');
             return;
          }
          
          helpers.addLog(`玩家${playerIndex + 1}使用此装备令目标英雄移动1格`, playerIndex);
          
          if (helpers.promptPlayer) {
            helpers.broadcastState();
            const targetHex = pixelToHex(targetToken.x, targetToken.y);
            gameState.reachableCells = getReachableHexes(targetHex, 1, playerIndex, gameState);
            const response = await helpers.promptPlayer(playerIndex, 'heal_move', { message: `请选择目标英雄的移动目标` });
            
            if (response && response.targetHex) {
              const { q, r } = response.targetHex;
              const newPos = hexToPixel(q, r);
              targetToken.x = newPos.x;
              targetToken.y = newPos.y;
              helpers.addLog(`玩家${playerIndex + 1}移动了被号令的英雄`, playerIndex);
            }
          }
          
          gameState.activeSkillState = null;
          await this.finishAction(gameState, playerIndex, helpers, socket);
          return;
        }
      }

      if (gameState.activeActionType === 'fire') {
        const heroToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
        if (!heroToken) return;
        
        if (!targetId.startsWith('castle_')) {
          socket.emit('error_message', '只能攻击敌方王城');
          return;
        }

        const parts = targetId.split('_');
        const cq = parseInt(parts[1]);
        const cr = parseInt(parts[2]);
        const isCastle0 = (gameState.map?.castles?.[0]?.some(c => c.q === cq && c.r === cr)) ?? false;
        const isCastle1 = (gameState.map?.castles?.[1]?.some(c => c.q === cq && c.r === cr)) ?? false;
        const castleIdx = isCastle0 ? 0 : 1;

        if (castleIdx === playerIndex) {
          socket.emit('error_message', '不能攻击自己的王城');
          return;
        }

        // 1. Damage castle
        await CombatLogic.resolveCastleAttack(gameState, playerIndex, castleIdx, helpers);

        // 2. Reset magic circle
        const hex = pixelToHex(heroToken.x, heroToken.y);
        const mc = gameState.magicCircles.find(m => m.q === hex.q && m.r === hex.r && m.state === 'chanting' && m.chantingTokenId === heroToken.id);
        if (mc) {
          mc.state = 'idle';
          mc.chantingTokenId = undefined;
        }

        // 3. Recoil
        const recoilHex = getRecoilHex(hex, { q: cq, r: cr }, gameState);
        const newPos = hexToPixel(recoilHex.q, recoilHex.r);
        heroToken.x = newPos.x;
        heroToken.y = newPos.y;
        helpers.addLog(`英雄受到后坐力后退了`, playerIndex);

        await this.finishAction(gameState, playerIndex, helpers, socket);
        return;
      }

      if (gameState.selectedOption === 'heal') {
        const heroCard = gameState.tableCards.find(c => c.id === targetId);
        if (heroCard) {
          gameState.phase = 'action_resolve';
          await this.finishAction(gameState, playerIndex, helpers, socket);
          return;
        }
      } 
      
      if (gameState.phase === 'buy' && gameState.selectedOption === 'buy') {
        const cardIndex = gameState.tableCards.findIndex(c => c && c.id === targetId);
        const card = gameState.tableCards[cardIndex];
        const gold = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
        if (cardIndex !== -1 && card && gold) {
          // Check if it's a treasure card (we don't want to buy a hero on the table during this)
          if (card.type && card.type.startsWith('treasure')) {
            const level = parseInt(card.type.replace('treasure', ''), 10) || 1;
            const cost = level === 3 ? 4 : level;
            if (gold.value >= cost) {
              // Deduct cost
              gold.value -= cost;
              const slot = { x: card.x, y: card.y, type: card.type };

              // Move item to player hand temporarily
              gameState.tableCards.splice(cardIndex, 1);
              
              const player = gameState.players[gameState.seats[playerIndex]];
              if (player) {
                player.hand.push({ ...card, faceUp: false, equippedToId: undefined } as any);
              }

              gameState.pendingEquipCardId = card.id;
              gameState.pendingEquipSlot = slot;
              gameState.phase = 'buy_select_equip_target';
              gameState.selectedOption = null;

              helpers.addLog(`玩家${playerIndex + 1}购买了等级 ${cost} 装备卡，消费 ${cost} 金币，正在选择装备目标`, playerIndex);
              
              helpers.broadcastState();
              helpers.checkBotTurn();
              return;
            } else {
              socket.emit('error_message', `金币不足！购买此装备需要 ${cost} 金币`);
              return;
            }
          } else {
            socket.emit('error_message', '请先点击要购买的装备卡！(只能购买装备卡)');
            return;
          }
        } else {
            socket.emit('error_message', '无效的选择');
            return;
        }
      }

      if (gameState.phase === 'buy_select_equip_target') {
        const player = gameState.players[gameState.seats[playerIndex]];
        const pendingCardId = gameState.pendingEquipCardId;
        
        let equipTargetHandCard = false;
        let targetHeroCardId: string | null = null;
        
        // Find click target - might be a token, or a card
        const token = gameState.tokens.find(t => t.id === targetId);
        if (token && token.boundToCardId) {
          targetHeroCardId = token.boundToCardId;
        } else {
          const tableCard = gameState.tableCards.find(c => c && c.id === targetId);
          if (tableCard && tableCard.type === 'hero') {
            targetHeroCardId = tableCard.id;
          } else if (targetId === player.id) { // REMOVED || targetId === pendingCardId
            equipTargetHandCard = true;
          }
        }
        
        if (targetHeroCardId || equipTargetHandCard) {
          // It's a valid choice
          const cardIndex = player.hand.findIndex(c => c.id === pendingCardId);
          if (cardIndex !== -1) {
            const card = player.hand[cardIndex];
            
            if (targetHeroCardId) {
              const heroCard = gameState.tableCards.find(c => c && c.id === targetHeroCardId);
              
              const isOwner = heroCard && ((playerIndex === 0 && heroCard.y > 0) || (playerIndex === 1 && heroCard.y < 0));
              if (!isOwner) {
                socket.emit('error_message', '只能将物品装备给自己的英雄！(Can only equip to your own heroes)');
                return;
              }

              if (heroCard) {
                // Look for LV3 replacement
                if (card.type === 'treasure3') {
                  const existingLV3Index = gameState.tableCards.findIndex(c => c && c.equippedToId === heroCard.id && c.type === 'treasure3');
                  if (existingLV3Index !== -1) {
                    const oldLV3 = gameState.tableCards.splice(existingLV3Index, 1)[0];
                    oldLV3.equippedToId = undefined;
                    if (!gameState.discardPiles.treasure) gameState.discardPiles.treasure = [];
                    gameState.discardPiles.treasure.push(oldLV3);
                    helpers.addLog(`玩家${playerIndex + 1}为英雄替换了原有的LV3装备`, playerIndex);
                  }
                }

                // Move from hand back to tableCards, equipped
                player.hand.splice(cardIndex, 1);
                (card as any).equippedToId = targetHeroCardId;
                (card as any).faceUp = true;
                
                // Calculate position relative to hero card based on how many cards are already equipped
                const equippedCards = gameState.tableCards.filter(c => c && c.equippedToId === heroCard.id);
                const idx = equippedCards.length;
                (card as any).x = heroCard.x;
                (card as any).y = heroCard.y > 0 ? (heroCard.y + 160 + (idx * 160)) : (heroCard.y - 160 - (idx * 160));
                
                gameState.tableCards.push(card as any);
                helpers.addLog(`玩家${playerIndex + 1}将装备卡装备给了英雄 [${heroCard.id}]`, playerIndex);

                // Handle excess equipment discard prompt
                const newEquippedCards = gameState.tableCards.filter(c => c && c.equippedToId === heroCard.id);
                if (newEquippedCards.length > 2 && helpers.promptPlayer) {
                  const response = await helpers.promptPlayer(playerIndex, 'discard_excess_equipment', { heroId: heroCard.id });
                  if (response && response.discardedCardId) {
                    const toDiscardIdx = gameState.tableCards.findIndex(c => c && c.id === response.discardedCardId);
                    if (toDiscardIdx !== -1) {
                      const discardedEquip = gameState.tableCards.splice(toDiscardIdx, 1)[0];
                      discardedEquip.equippedToId = undefined;
                      if (!gameState.discardPiles.treasure) gameState.discardPiles.treasure = [];
                      gameState.discardPiles.treasure.push(discardedEquip);
                      helpers.addLog(`玩家${playerIndex + 1}弃置了多余的装备卡`, playerIndex);
                      
                      // recalculate positions
                      const remainingEquipped = gameState.tableCards.filter(c => c && c.equippedToId === heroCard.id);
                      remainingEquipped.forEach((eq, i) => {
                        eq.x = heroCard.x;
                        eq.y = heroCard.y > 0 ? (heroCard.y + 160 + (i * 160)) : (heroCard.y - 160 - (i * 160));
                      });
                    }
                  }
                }
              }
            } else {
              helpers.addLog(`玩家${playerIndex + 1}未装备该装备卡，它将留在手牌中`, playerIndex);
            }
          }
          
          // REFILL SHOP LOGIC
          const slot = gameState.pendingEquipSlot;
          if (slot && slot.type) {
            const deckKey = slot.type as keyof typeof gameState.decks;
            let targetDeck = gameState.decks[deckKey];
            
            if (!targetDeck || targetDeck.length === 0) {
              const discardPile = gameState.discardPiles.treasure || [];
              const matchingCards = discardPile.filter(c => c.type === slot.type);
              
              if (matchingCards.length > 0) {
                 gameState.discardPiles.treasure = discardPile.filter(c => c.type !== slot.type);
                 matchingCards.sort(() => Math.random() - 0.5);
                 targetDeck = matchingCards;
                 gameState.decks[deckKey] = targetDeck as any;
                 helpers.addLog(`从装备弃牌区重新洗切了 ${slot.type} 牌堆`, -1);
              }
            }
            
            if (targetDeck && targetDeck.length > 0) {
               const newCard = targetDeck.pop()!;
               gameState.tableCards.push({
                 ...newCard,
                 x: slot.x,
                 y: slot.y,
                 faceUp: true,
                 equippedToId: undefined
               } as TableCard);
            }
          }

          gameState.pendingEquipCardId = null;
          gameState.pendingEquipSlot = null;
          gameState.notification = null;
          
          // Finish the phase accordingly
          if (gameState.buySource === 'shop') {
            gameState.phase = 'shop';
            gameState.activePlayerIndex = 1 - playerIndex;
          } else {
            const tokenToUse = gameState.actionTokens.find(t => t.id === gameState.activeActionTokenId);
            if (tokenToUse) tokenToUse.used = true;
            gameState.activeActionTokenId = null;
            gameState.activeHeroTokenId = null;
            gameState.selectedTokenId = null;
            gameState.activePlayerIndex = 1 - playerIndex;
            gameState.phase = 'action_play';
            helpers.checkAllTokensUsed();
          }
          
          gameState.buySource = null;
          helpers.broadcastState();
          helpers.checkBotTurn();
          return;
        } else {
          socket.emit('error_message', '请选择一个英雄目标，或点击自己来跳过');
          return;
        }
      }

      // If we are in action_resolve and it's an attack, transition to defense phase
      if (gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack') {
        
        const targetCard = gameState.tableCards.find(c => c.id === targetId);
        const monster = gameState.map?.monsters?.find(m => `monster_${m.q}_${m.r}` === targetId);
        const isCastle = targetId.startsWith('castle_');
        const isIcePillar = targetId.startsWith('ice_pillar_');
        const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
        
        if (!targetCard && !monster && !isCastle && !isIcePillar) {
          console.error(`select_target: Target not found. targetId=${targetId}`);
          socket.emit('error_message', `目标未找到 (Target not found).`);
          return;
        }
        if (!attackerToken) {
          console.error(`select_target: Attacker token not found. selectedTokenId=${gameState.selectedTokenId}`);
          socket.emit('error_message', `未选择攻击者 (Attacker not selected).`);
          return;
        }

        const attackerCard = gameState.tableCards.find(c => c.id === attackerToken.boundToCardId);
        
        const enhancementCard = gameState.activeEnhancementCardId 
          ? (gameState.playAreaCards.find(c => c.id === gameState.activeEnhancementCardId) || 
             gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId))
          : null;
        
        let ar = SkillEngine.getModifiedStat(attackerToken.id, 'ar', gameState);
        ar += getAttackRangeBonusFromEnhancement(enhancementCard?.name);

        const attackerHex = pixelToHex(attackerToken.x, attackerToken.y);
        let targetHex;
        if (monster) {
          targetHex = { q: monster.q, r: monster.r };
        } else if (isCastle) {
          const parts = targetId.split('_');
          targetHex = { q: parseInt(parts[1]), r: parseInt(parts[2]) };
        } else if (isIcePillar) {
          const pillarId = targetId.replace('ice_pillar_', '');
          const pillar = gameState.icePillars?.find(p => p.id === pillarId);
          if (!pillar) {
            socket.emit('error_message', `冰柱未找到 (Ice pillar not found).`);
            return;
          }
          targetHex = { q: pillar.q, r: pillar.r };
        } else {
          const targetToken = gameState.tokens.find(t => t.boundToCardId === targetCard!.id);
          targetHex = targetToken ? pixelToHex(targetToken.x, targetToken.y) : pixelToHex(targetCard!.x, targetCard!.y);
        }

        if (!isTargetInAttackRange(attackerHex, targetHex, ar, gameState, gameState.selectedOption === 'turret_attack')) {
          socket.emit('error_message', `目标不在攻击范围内 (Target out of range).`);
          return;
        }

        if (monster) {
          if (attackerCard) {
            helpers.addLog(`发起阶段: ${attackerCard.heroClass} 对 怪物 LV${monster.level} 发起了攻击`, playerIndex);
          }
          await CombatLogic.resolveMonsterAttack(gameState, playerIndex, monster.q, monster.r, helpers);
          await this.finishAction(gameState, playerIndex, helpers, socket);
          return;
        }

        if (isIcePillar) {
          const pillarId = targetId.replace('ice_pillar_', '');
          await CombatLogic.resolveIcePillarAttack(gameState, playerIndex, pillarId, helpers);
          await this.finishAction(gameState, playerIndex, helpers, socket);
          return;
        }

        if (isCastle) {
          const parts = targetId.split('_');
          const cq = parseInt(parts[1]);
          const cr = parseInt(parts[2]);
          const isCastle0 = (gameState.map?.castles?.[0]?.some(c => c.q === cq && c.r === cr)) ?? false;
          const isCastle1 = (gameState.map?.castles?.[1]?.some(c => c.q === cq && c.r === cr)) ?? false;
          const castleIdx = isCastle0 ? 0 : 1;
          
          if (!isCastle0 && !isCastle1) {
            socket.emit('error_message', '城堡目标无效');
            return;
          }

          if (castleIdx === playerIndex) {
            socket.emit('error_message', '不能攻击自己的城堡');
            return;
          }

          if (attackerCard) {
            helpers.addLog(`发起阶段: ${attackerCard.heroClass} 对 敌方城堡 发起了攻击`, playerIndex);
          }
          await CombatLogic.resolveCastleAttack(gameState, playerIndex, castleIdx, helpers);
          await this.finishAction(gameState, playerIndex, helpers, socket);
          return;
        }

        const isEnemy = (playerIndex === 0 && targetCard!.y < 0) || (playerIndex === 1 && targetCard!.y > 0);
        if (!isEnemy) {
          socket.emit('error_message', '只能攻击敌方单位');
          return;
        }
        
        if (attackerCard && targetCard) {
          await ActionEngine.initiateAttack(
            gameState,
            playerIndex,
            attackerCard.id,
            targetCard.id,
            helpers,
            socket
          );
          return;
        }
      }
      
      helpers.broadcastState();
      helpers.checkBotTurn();
    }
  }

  /**
   * 处理增强卡打出 (Play enhancement card)
   */
  static playEnhancementCard(
    gameState: GameState,
    playerIndex: number,
    cardId: string,
    helpers: ActionHelpers,
    socket: any
  ): void {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_play_enhancement') return;

    let card: any;
    let fromHand = false;

    // Check hand first
    const player = gameState.players[gameState.seats[playerIndex]];
    if (player) {
      const cardIndex = player.hand.findIndex((c: any) => c.id === cardId);
      if (cardIndex !== -1) {
        card = player.hand[cardIndex];
        fromHand = true;
      }
    }

    // Check equipped items (e.g. one-time items)
    if (!card) {
       const equipIndex = gameState.tableCards.findIndex(c => c && c.id === cardId && c.equippedToId);
       if (equipIndex !== -1) {
         card = gameState.tableCards[equipIndex];
         fromHand = false;
       }
    }

    if (!card) return;

    if (!isEnhancementCardName(card.name || '')) {
      socket.emit('error_message', '只能打出增强卡和一次性装备 (Can only play enhancement cards or one-time equipments)');
      return;
    }

    if (fromHand) {
      player.hand = player.hand.filter((c: any) => c.id !== card.id);
      gameState.discardPiles.action.push(card);
    } else {
      card.equippedToId = undefined;
      card.usedInTurn = true;
      gameState.tableCards = gameState.tableCards.filter(c => c && c.id !== card.id);
      if (!gameState.discardPiles.treasure) gameState.discardPiles.treasure = [];
      gameState.discardPiles.treasure.push(card);
    }

    gameState.activeEnhancementCardId = card.id;

    const { logs, nextPhase } = CardLogic.applyActionCard(
      card as any,
      gameState,
      playerIndex,
      {
        addLog: helpers.addLog,
        discardOpponentCard: helpers.discardOpponentCard
      }
    );

    logs.forEach((log: string) => helpers.addLog(log, playerIndex));

    if (nextPhase) {
      gameState.phase = nextPhase as any;
    }

    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  /**
   * 跳过增强卡阶段 (Pass enhancement phase)
   */
  static passEnhancement(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers,
    socket: any
  ): void {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_play_enhancement') return;

    this.resolveActionStart(gameState, playerIndex, helpers, socket);
  }

  /**
   * 开始结算行动 (Start resolving action)
   */
  static resolveActionStart(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers,
    socket: any
  ): void {
    const heroToken = gameState.tokens.find((t: any) => t.id === gameState.activeHeroTokenId);
    if (!heroToken) {
      this.finishAction(gameState, playerIndex, helpers, socket);
      return;
    }
    
    const heroCard = gameState.tableCards.find((c: any) => c.id === heroToken.boundToCardId);
    const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard?.heroClass);
    const levelData = heroData?.levels?.[heroCard?.level || 1];

    const enhancementCard = gameState.activeEnhancementCardId 
      ? (gameState.playAreaCards.find((c: any) => c.id === gameState.activeEnhancementCardId) || 
         gameState.discardPiles.action.find((c: any) => c.id === gameState.activeEnhancementCardId))
      : null;

    if (gameState.activeActionType === 'move') {
      let mv = levelData?.mv || 1;
      mv += getMoveBonusFromEnhancement(enhancementCard?.name);
      
      const hex = pixelToHex(heroToken.x, heroToken.y);
      gameState.reachableCells = getReachableHexes(hex, mv, playerIndex, gameState);
      gameState.selectedTokenId = heroToken.id;
      gameState.remainingMv = mv;
      gameState.phase = 'action_resolve';
      gameState.notification = null;
    } else if (gameState.activeActionType === 'attack') {
      let ar = levelData?.ar || 1;
      ar += getAttackRangeBonusFromEnhancement(enhancementCard?.name);
      
      const hex = pixelToHex(heroToken.x, heroToken.y);
      gameState.reachableCells = getAttackableHexes(hex.q, hex.r, ar, playerIndex, gameState, heroCard?.level || 1);
      gameState.selectedTokenId = heroToken.id;
      gameState.phase = 'action_resolve';
      gameState.notification = null;
    } else if (gameState.activeActionType === 'skill') {
      gameState.selectedTokenId = heroToken.id;
      gameState.phase = 'action_resolve';
      gameState.notification = null;
    } 
    helpers.broadcastState();
  }

  /**
   * 处理技能队列 (Process skill queue)
   */
  static async processSkillQueue(
    gameState: GameState,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    if (!gameState.skillQueue || gameState.skillQueue.length === 0) {
      return;
    }

    const item = gameState.skillQueue[0];
    item.status = 'executing';
    const { skillId, sourceTokenId, playerIndex, presetTargetId, presetTargetHex, ignoreConditions } = item;

    // 1. 切换当前行动英雄和玩家
    gameState.activeHeroTokenId = sourceTokenId;
    gameState.selectedTokenId = sourceTokenId;
    gameState.activePlayerIndex = playerIndex;
    gameState.phase = 'action_play'; // 重置阶段，确保新技能能正确开始

    // 2. 准备技能上下文
    const context = {
      gameState,
      playerIndex,
      sourceTokenId,
      skillId,
      targetTokenId: presetTargetId,
      targetHex: presetTargetHex,
      ignoreConditions
    };

    // 检查是否有合法目标（如果技能需要目标）
    const skillDef = skillRegistry.getSkill(skillId);
    if (skillDef && skillDef.targetType && skillDef.targetType !== 'none' && !presetTargetId && !presetTargetHex) {
      if (skillDef.getValidTargets) {
        const targets = skillDef.getValidTargets(context as any);
        if (targets.length === 0) {
          helpers.addLog(`【技能队列】${sourceTokenId} 无法发动 【${skillDef.name}】，因为没有合法目标。`, playerIndex);
          // 自动跳过当前任务并推进队列
          await this.finishAction(gameState, playerIndex, helpers, socket);
          return;
        }

        // 进入目标选择阶段
        gameState.phase = 'action_select_skill_target';
        gameState.activeSkillId = skillId;
        
        const { pixelToHex } = await import('../../shared/utils/hexUtils.ts');
        gameState.reachableCells = targets.map(target => {
          if (typeof target === 'string') {
            if (target.startsWith('monster_')) {
              const parts = target.split('_');
              return { q: parseInt(parts[1]), r: parseInt(parts[2]) };
            }
            const token = gameState.tokens.find(t => t.id === target);
            if (token) return pixelToHex(token.x, token.y);
          } else if (typeof target === 'object' && 'q' in target) {
            return target;
          }
          return null;
        }).filter(h => h !== null) as { q: number, r: number }[];
        
        helpers.addLog(`请选择 【${skillDef.name}】 的目标`, playerIndex);
        helpers.broadcastState();
        return; // 暂停队列执行，等待玩家选择目标
      }
    }

    // 3. 执行技能
    await this.useSkill(gameState, playerIndex, context, helpers, socket);
  }

  /**
   * 完成行动 (Finish action)
   */
  static async finishAction(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {

    // 检查是否有挂起的交互
    if (gameState.phase === 'action_remove_ember_zone') {
        helpers.broadcastState();
        helpers.checkBotTurn();
        return; // 短路，等待玩家操作
    }

    // 触发战斗结算后的技能回调
    await SkillEngine.onCombatResolved(gameState, {}, helpers);

    // 清除瞄准等临时 buff
    if (gameState.turnModifiers) {
      gameState.turnModifiers = gameState.turnModifiers.filter(mod => mod.sourceSkillId !== 'archer_aim');
    }

    // --- 技能队列处理逻辑 ---
    if (gameState.skillQueue && gameState.skillQueue.length > 0) {
      if (gameState.skillQueue[0].status === 'executing') {
        // 弹出刚刚完成的任务
        gameState.skillQueue.shift();
      }

      if (gameState.skillQueue.length > 0) {
        // 如果队列中还有任务，继续执行
        await this.processSkillQueue(gameState, helpers, socket);
        return;
      }
    }
    // ----------------------

    if (gameState.phase === 'action_resolve' && playerIndex === gameState.activePlayerIndex) {
      if (gameState.selectedOption === 'seize') {
        gameState.firstPlayerIndex = playerIndex;
        gameState.hasSeizedInitiative = true;
        helpers.addLog(`玩家${playerIndex + 1}抢占了先手`, playerIndex);
      } else if (gameState.selectedOption === 'spy') {
        helpers.discardOpponentCard(playerIndex);
        helpers.addLog(`玩家${playerIndex + 1}发动了间谍，弃掉了对手的一张手牌`, playerIndex);
      } else if (gameState.selectedOption === 'heal') {
        const heroId = gameState.selectedTargetId;
        const card = gameState.tableCards.find((c: any) => c.id === heroId);
        if (card) {
          const healAmount = card.damage || 0;
          card.damage = 0;
          const counter = gameState.counters.find((c: any) => c.type === 'damage' && c.boundToCardId === heroId);
          if (counter) counter.value = 0;
          helpers.addLog(`玩家${playerIndex + 1}回复了${card.heroClass}的生命`, playerIndex);
          
          const targetToken = gameState.tokens.find(t => t.boundToCardId === heroId);
          if (targetToken) {
            await SkillEngine.triggerEvent('onHeal', gameState, helpers, {
              eventSourceId: gameState.selectedTokenId,
              targetTokenId: targetToken.id,
              healAmount
            });
          }
        } 
      } else if (gameState.activeActionType === 'evolve') {
        const err_msg = HeroEngine.evolveHero(gameState, playerIndex, helpers);
        helpers.addLog(err_msg.reason, playerIndex);
      }
      
      if (gameState.activeActionType === 'move' && gameState.selectedTokenId) {
        await SkillEngine.triggerEvent('onMoveEnd', gameState, helpers, {
          eventSourceId: gameState.selectedTokenId
        });
      }
    }

    // Handle Commander's Follow-up skill
    if (gameState.pendingFollowUp && gameState.commanderTokenId) {
      const commanderToken = gameState.tokens.find(t => t.id === gameState.commanderTokenId);
      if (commanderToken) {
        gameState.activeHeroTokenId = gameState.commanderTokenId;
        gameState.phase = 'action_select_action';
        gameState.isFollowUpAction = true;
        gameState.pendingFollowUp = false;
        gameState.commanderTokenId = null;
        gameState.notification = '指挥官发动【跟进】：请选择移动或攻击。';
        helpers.broadcastState();
        helpers.checkBotTurn();
        return;
      }
    }

    if (gameState.wasDeepFreezeBroken && gameState.activeHeroTokenId) {
      if (gameState.statuses) {
        gameState.statuses = gameState.statuses.filter(s => !(s.tokenId === gameState.activeHeroTokenId && s.status === 'deep_freeze'));
      }
    }

    const token = gameState.actionTokens.find((t: any) => t.id === gameState.activeActionTokenId);
    if (token) token.used = true;

    gameState.activeActionTokenId = null;
    gameState.activeActionType = null;
    gameState.activeEnhancementCardId = null;
    gameState.activeSkillState = null;
    gameState.wasDeepFreezeBroken = false;
    gameState.isFollowUpAction = false;
    gameState.phase = 'action_play';
    gameState.selectedOption = null;
    gameState.selectedTargetId = null;
    gameState.lastPlayedCardId = null;
    gameState.pendingDefenseCardId = null;
    gameState.hasDefenseCard = false;
    gameState.canCounterAttack = false;
    gameState.isCounterAttack = false;
    gameState.isDefended = false;
    gameState.selectedTokenId = null;
    gameState.reachableCells = [];
    gameState.remainingMv = 0;
    gameState.movementHistory = [];
    if (gameState.attackInitiatorIndex !== undefined && gameState.attackInitiatorIndex !== null) {
      gameState.activePlayerIndex = 1 - gameState.attackInitiatorIndex;
    } else {
      gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
    }
    gameState.attackInitiatorIndex = null;
    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  static async removeEmberZone(
    gameState: GameState,
    playerIndex: number,
    q: number,
    r: number,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    if (gameState.phase !== 'action_remove_ember_zone') return;
    if (playerIndex !== gameState.activePlayerIndex) {
      socket.emit('error_message', '当前不是你的操作阶段');
      return;
    }

    const index = gameState.emberZones?.findIndex(e => e.q === q && e.r === r);
    if (index === undefined || index === -1) {
      socket.emit('error_message', '选择的格子上没有余烬区');
      return;
    }

    // Remove the selected ember zone
    gameState.emberZones!.splice(index, 1);
    helpers.addLog(`移除余烬区 (${q}, ${r})`, playerIndex);

    // After removing, check if we still exceed the limit (in case of double placement)
    if (gameState.emberZones!.length > 5) {
      helpers.addLog(`仍然超出上限，需继续移除余烬区`, playerIndex);
      helpers.broadcastState();
      helpers.checkBotTurn();
      return;
    }

    // Restore phase and active player
    const pendingParams = gameState.pendingEmberZoneParams;
    if (pendingParams) {
      gameState.phase = pendingParams.originalPhase || 'action_play';
      gameState.activePlayerIndex = pendingParams.originalActivePlayerIndex || 1 - playerIndex;
      gameState.pendingEmberZoneParams = undefined;
      
      // Let the system continue finish action if needed
      await this.finishAction(gameState, playerIndex, helpers, socket);
    } else {
      gameState.phase = 'action_play';
      helpers.broadcastState();
      helpers.checkBotTurn();
    }
  }

  /**
   * 跳过行动 (Pass action)
   */
  static passAction(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers,
    socket: any
  ): void {
    if (gameState.phase === 'action_play' && playerIndex === gameState.activePlayerIndex) {
      const availableTokens = gameState.actionTokens.filter((t: any) => t.playerIndex === playerIndex && !t.used);
      if (availableTokens.length > 0) {
        socket.emit('error_message', '请选择一个行动Token进行Pass (翻面)');
        return;
      }

      gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
      helpers.checkAllTokensUsed();
    }
  }

  /**
   * 处理弃牌完成逻辑 (Finish discard logic)
   */
  static finishDiscard(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers,
    socket: any
  ): void {
    const player = gameState.players[socket.id];
    if (!player || gameState.phase !== 'discard' || player.discardFinished) return;

    if (player.hand.length > 5) {
      socket.emit('error_message', `你还需要弃掉 ${player.hand.length - 5} 张牌。`);
      return;
    }

    player.discardFinished = true;
    player.discardHistory = []; // Clear history after finishing
    helpers.addLog(`玩家 ${player.name} 完成了弃牌`, -1);

    const allFinished = gameState.seats
      .filter(id => id !== null)
      .every(id => gameState.players[id!].discardFinished);

    if (allFinished) {
      ActionEngine.startShopPhase(gameState, helpers);
    } else {
      helpers.broadcastState();
    }
  }

  /**
   * 开始商店阶段 (Start shop phase)
   */
  static startShopPhase(gameState: GameState, helpers: ActionHelpers): void {
    helpers.setPhase('shop');
    gameState.shopPasses = 0;
    gameState.selectedOption = null;
    gameState.selectedTargetId = null;
    gameState.selectedHireCost = null;
    gameState.selectedHireCastle = null;
    gameState.activePlayerIndex = gameState.firstPlayerIndex;
    helpers.addLog(`进入商店阶段`, -1);
    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  /**
   * 开始回合结束阶段 (Start end phase)
   */
  static startEndPhase(gameState: GameState, helpers: ActionHelpers): void {
    helpers.setPhase('end');
    gameState.activePlayerIndex = gameState.firstPlayerIndex;
    gameState.consecutivePasses = 0;
    gameState.hasSeizedInitiative = false;

    gameState.selectedOption = null;
    gameState.selectedTargetId = null;
    gameState.selectedTokenId = null;
    gameState.selectedHireCost = null;
    gameState.selectedHireCastle = null;
    gameState.activeActionType = null;
    gameState.reachableCells = [];
    gameState.notification = null;

    // Reset equipment used status for the round
    if (gameState.tableCards) {
      gameState.tableCards.forEach(c => {
        if (c.usedInTurn !== undefined) {
          c.usedInTurn = false;
        }
      });
    }

    helpers.addLog(`--- 结束阶段开始 (end Phase Starts) ---`, -1);
    helpers.broadcastState();
    
    setTimeout(() => {
      if (gameState.phase === 'end') {
        this.proceedPhase(gameState, helpers);
      }
    }, 50);
  }

  static scoreEndPhaseReputation(
    gameState: GameState,
    helpers: ActionHelpers
  ): void {
    gameState.tokens.forEach(token => {
      const hex = pixelToHex(token.x, token.y);
      const isMagicCircle = gameState.magicCircles.some(
        mc => mc.q === hex.q && mc.r === hex.r
      );
      const isCrystal = hex.q === 0 && hex.r === 0;

      if (!isMagicCircle && !isCrystal) return;

      const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
      if (!card) return;

      const playerIdx = card.y > 0 ? 0 : 1;
      helpers.addReputation(
        playerIdx,
        1,
        isCrystal ? '占领水晶' : '占领魔法阵'
      );
    });
  }

  static advanceEndPhaseTimers(
    gameState: GameState
  ): { pendingRevivals: Array<{ heroCardId: string; playerIndex: 0 | 1 }> } {
    const countersToRemove = new Set<string>();
    const pendingRevivals: Array<{ heroCardId: string; playerIndex: 0 | 1 }> = [];
    const freeCastlesCount: Record<0 | 1, number> = { 0: 0, 1: 0 };

    // 统计双方空王城数
    for (let pIdx: 0 | 1 = 0; pIdx <= 1; pIdx = (pIdx + 1) as 0 | 1) {
      const playerCastles = gameState.map?.castles?.[pIdx] || [];
      for (const castleHex of playerCastles) {
        const pos = hexToPixel(castleHex.q, castleHex.r);
        const occupied = gameState.tokens.some(
          t => Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10
        );
        if (!occupied) {
          freeCastlesCount[pIdx]++;
        }
      }
    }

    for (const counter of gameState.counters) {
      if (counter.type !== 'time') continue;
      counter.value += 1;

      // 英雄死亡计时 -> 待复活
      if (counter.boundToCardId) {
        const heroCard = gameState.tableCards.find(c => c.id === counter.boundToCardId);
        if (heroCard?.type === 'hero') {
          if (counter.value >= 2) {
            const playerIndex: 0 | 1 = heroCard.y > 0 ? 0 : 1;
            if (freeCastlesCount[playerIndex] > 0) {
              pendingRevivals.push({
                heroCardId: heroCard.id,
                playerIndex
              });
              countersToRemove.add(counter.id);
              freeCastlesCount[playerIndex]--;
            } else {
              gameState.notification =
                (gameState.notification ? gameState.notification + ' ' : '') +
                `${heroCard.heroClass} 等待复活，但所有王城都被占用。 (Hero waiting to revive, but all castles are occupied.)`;
            }
          }
          continue;
        }
      }

      // 地图 time counter：陷阱 2 回合刷新，其它 3 回合刷新
      const hex = pixelToHex(counter.x, counter.y);
      const isTrap = gameState.map?.traps?.some(t => t.q === hex.q && t.r === hex.r);
      if (isTrap) {
        if (counter.value >= 2) {
          countersToRemove.add(counter.id);
          gameState.notification =
            (gameState.notification ? gameState.notification + ' ' : '') +
            `陷阱已重置！ (Trap reset!)`;
        }
        continue;
      }
      if (counter.value >= 3) {
        const isOccupied = gameState.tokens.some(
          t => Math.abs(t.x - counter.x) < 10 && Math.abs(t.y - counter.y) < 10
        );
        if (!isOccupied) {
          countersToRemove.add(counter.id);
          gameState.notification =
            (gameState.notification ? gameState.notification + ' ' : '') +
            `地图资源已刷新！ (Map resources refreshed!)`;
        }
      }
    }
    if (countersToRemove.size > 0) {
      gameState.counters = gameState.counters.filter(c => !countersToRemove.has(c.id));
    }
    return { pendingRevivals };
  }

  static async beginNextRound(
    gameState: GameState,
    helpers: ActionHelpers
  ): Promise<void> {
    // 把行动 token 翻回可用，除非英雄阵亡
    gameState.actionTokens.forEach(t => {
      if (t.heroCardId) {
        const isDead = gameState.counters.some(c => c.type === 'time' && c.boundToCardId === t.heroCardId);
        if (isDead) {
          t.used = true;
          return;
        }
      }
      t.used = false;
    });
    gameState.round += 1;
    gameState.roundActionCounts = {};
    gameState.suppressedTokensThisTurn = [];
    gameState.usedDispatchThisTurn = [];
    gameState.usedArrowRainThisTurn = [];
    gameState.isFollowUpAction = false;
    gameState.turnModifiers = [];
    // Only clear statuses that shouldn't persist across rounds
    if (gameState.statuses) {
      gameState.statuses = gameState.statuses.filter(s => s.status === 'deep_freeze' || s.status === 'shield');
    } else {
      gameState.statuses = [];
    }
    
    gameState.phase = 'action_play';
    gameState.activePlayerIndex = gameState.firstPlayerIndex;
    gameState.consecutivePasses = 0;
    gameState.hasSeizedInitiative = false;
    gameState.notification = null;
    Object.values(gameState.players).forEach((p: any) => {
      if (p) {
        p.discardFinished = false;
      }
    });
    helpers.addLog(`--- 第 ${gameState.round} 回合开始 ---`, -1);
    
    // 触发回合开始事件
    await SkillEngine.triggerEvent('onTurnStart', gameState, helpers);

    // --- 装备触发：侦察镜 (Scout Glass) --- //
    // 回合开始时，拥有侦察镜的玩家可以随机查看对手2张手牌
    for (const token of gameState.tokens) {
      if (token.boundToCardId) {
        const eq = gameState.tableCards.find(c => c && c.equippedToId === token.boundToCardId && c.name === '侦察镜');
        if (eq) {
          const ownerIndex = token.y > 0 ? 0 : 1;
          const oppIndex = 1 - ownerIndex;
          const opponent = gameState.players[oppIndex];
          if (opponent && opponent.hand && opponent.hand.length > 0) {
            // Shuffle and pick up to 2
            const handCards = [...opponent.hand];
            const shuffled = handCards.sort(() => 0.5 - Math.random());
            const picked = shuffled.slice(0, 2);
            
            const cardNames = picked.map(c => `[${c.name}]`).join(', ');
            helpers.addLog(`🔍 [侦察镜] 探测到对手的手牌包含：${cardNames}`, ownerIndex);
          }
        }
      }
    }

    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  static async addEmberZone(
    gameState: GameState,
    q: number,
    r: number,
    ownerIndex: number,
    sourceTokenId: string,
    helpers: ActionHelpers
  ): Promise<{ needRemoval: boolean }> {
    if (!gameState.emberZones) {
      gameState.emberZones = [];
    }

    // Check if the hex already has an ember zone, if so, we can just replace it or do nothing.
    // For now we assume placing on an existing one just refreshes it or we ignore.
    const existingIndex = gameState.emberZones.findIndex(e => e.q === q && e.r === r);
    if (existingIndex !== -1) {
      // Refresh it or do nothing, let's just do nothing and return.
      return { needRemoval: false };
    }

    gameState.emberZones.push({ q, r, ownerIndex, sourceTokenId });

    if (gameState.emberZones.length > 5) {
      if (gameState.phase !== 'action_remove_ember_zone') {
        // Need to prompt the user to remove one
        helpers.addLog(`余烬区数量已达上限(5个)！请移除一个已有的余烬区。`, ownerIndex);
        
        gameState.pendingEmberZoneParams = {
          q, r, ownerIndex, sourceTokenId,
          originalPhase: gameState.phase,
          originalActivePlayerIndex: gameState.activePlayerIndex
        };
        
        gameState.phase = 'action_remove_ember_zone';
        gameState.activePlayerIndex = ownerIndex;
      }
      
      // We don't broadcast here because we want the calling skill to finish its execution 
      // and let `finishAction` or whatever handles the queue eventually hit this phase and block.
      // But we need to return a flag so the caller knows to pause.
      return { needRemoval: true };
    }

    return { needRemoval: false };
  }

  static async resolveEndPhase(
    gameState: GameState,
    helpers: ActionHelpers
  ): Promise<void> {
    // 触发回合结束事件
    await SkillEngine.triggerEvent('onTurnEnd', gameState, helpers);

    // Apply Deep Freeze from Blizzard Zones
    if (gameState.blizzardZones) {
       // Apply to heroes
       if (gameState.tokens) {
          for (const targetToken of gameState.tokens) {
             if (!targetToken.heroClass) continue;
             
             const targetHex = pixelToHex(targetToken.x, targetToken.y);
             const blizzardZones = gameState.blizzardZones;
             const distToSource = Math.max(Math.abs(targetHex.q - blizzardZones.sourceHex.q), Math.abs(targetHex.r - blizzardZones.sourceHex.r), Math.abs(-targetHex.q - targetHex.r - (-blizzardZones.sourceHex.q - blizzardZones.sourceHex.r)));
             const distToPillar = Math.max(Math.abs(targetHex.q - blizzardZones.pillarHex.q), Math.abs(targetHex.r - blizzardZones.pillarHex.r), Math.abs(-targetHex.q - targetHex.r - (-blizzardZones.pillarHex.q - blizzardZones.pillarHex.r)));
             
             if (distToSource === 1 || distToPillar === 1) {
                const targetCard = gameState.tableCards.find(c => c.id === targetToken.boundToCardId);
                if (targetCard) {
                   if (!gameState.statuses) gameState.statuses = [];
                   // Apply if not already deeply frozen
                   if (!gameState.statuses.some(s => s.tokenId === targetToken.id && s.status === 'deep_freeze')) {
                     gameState.statuses.push({
                       tokenId: targetToken.id,
                       status: 'deep_freeze',
                       sourceSkillId: 'ice_mage_blizzard'
                     });
                     helpers.addLog(`${targetCard.heroClass} 在暴风雪区域中结束回合，被【深度冻结】！`, -1);
                   }
                }
             }
          }
       }
       
       // Apply to monsters
       if (gameState.map?.monsters) {
          for (const monster of gameState.map.monsters) {
             const blizzardZones = gameState.blizzardZones;
             const distToSource = Math.max(Math.abs(monster.q - blizzardZones.sourceHex.q), Math.abs(monster.r - blizzardZones.sourceHex.r), Math.abs(-monster.q - monster.r - (-blizzardZones.sourceHex.q - blizzardZones.sourceHex.r)));
             const distToPillar = Math.max(Math.abs(monster.q - blizzardZones.pillarHex.q), Math.abs(monster.r - blizzardZones.pillarHex.r), Math.abs(-monster.q - monster.r - (-blizzardZones.pillarHex.q - blizzardZones.pillarHex.r)));

             if (distToSource === 1 || distToPillar === 1) {
                if (!gameState.statuses) gameState.statuses = [];
                const monsterTokenId = `monster_${monster.q}_${monster.r}`;
                if (!gameState.statuses.some(s => s.tokenId === monsterTokenId && s.status === 'deep_freeze')) {
                   gameState.statuses.push({
                     tokenId: monsterTokenId,
                     status: 'deep_freeze',
                     sourceSkillId: 'ice_mage_blizzard'
                   });
                   helpers.addLog(`LV${monster.level}怪物 在暴风雪区域中结束回合，被【深度冻结】！`, -1);
                }
             }
          }
       }

       // Blizzard zone dissipates at the end of the turn
       delete gameState.blizzardZones;
    }

    // 结算余烬区
    if (gameState.emberZones && gameState.emberZones.length > 0) {
      const remainingEmberZones: any[] = [];
      for (const ember of gameState.emberZones) {
        let triggered = false;
        const pos = hexToPixel(ember.q, ember.r);

        // 检查所有英雄（包括敌我）
        const heroTokens = gameState.tokens.filter(t => {
          if (!t.heroClass) return false;
          return Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10;
        });

        for (const targetToken of heroTokens) {
          const targetCard = gameState.tableCards.find(c => c.id === targetToken.boundToCardId);
          if (targetCard) {
            triggered = true;
            
            const { CombatLogic } = await import('../combat/combatLogic.ts');
            await CombatLogic.applySpellDamageToHero(
              gameState,
              targetCard,
              targetToken,
              1, // 1点灼烧伤害
              ember.sourceTokenId,
              ember.ownerIndex,
              helpers as any,
              '余烬区'
            );
          }
        }

        // 检查怪物
        const monster = gameState.map?.monsters?.find(m => m.q === ember.q && m.r === ember.r);
        if (monster) {
          const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
          if (!hasTimer) {
            triggered = true;
            
            // 使用 applySpellDamageToMonster 直接造成法术伤害，不触发怪物反击，能正确处理经验和金币
            const { CombatLogic } = await import('../combat/combatLogic.ts');
            await CombatLogic.applySpellDamageToMonster(
              gameState, 
              monster, 
              1,  // 1点伤害 
              ember.sourceTokenId, 
              ember.ownerIndex, 
              helpers as any, 
              '余烬区'
            );
          }
        }

        if (!triggered) {
          remainingEmberZones.push(ember);
        } else {
          helpers.addLog(`【余烬区】余烬消散。`, ember.ownerIndex);
        }
      }
      gameState.emberZones = remainingEmberZones;
    }

    gameState.suppressedTokensThisTurn = [];
    gameState.usedDispatchThisTurn = [];
    gameState.usedArrowRainThisTurn = [];
    gameState.isFollowUpAction = false;
    gameState.turnModifiers = [];
    
    // Only clear statuses that shouldn't persist across rounds
    if (gameState.statuses) {
      gameState.statuses = gameState.statuses.filter(s => s.status === 'deep_freeze' || s.status === 'shield');
    } else {
      gameState.statuses = [];
    }

    gameState.actionTokens.forEach(t => {
      if (t.heroCardId) {
        const isDead = gameState.counters.some(c => c.type === 'time' && c.boundToCardId === t.heroCardId);
        if (isDead) {
          t.used = true;
          return;
        }
      }
      t.used = false;
    });
    this.scoreEndPhaseReputation(gameState, helpers);
    if (gameState.playAreaCards.length > 0) {
      gameState.discardPiles.action.push(...gameState.playAreaCards);
      gameState.playAreaCards = [];
    }
    const { pendingRevivals } = this.advanceEndPhaseTimers(gameState);
    if (pendingRevivals.length > 0) {
      gameState.pendingRevivals = pendingRevivals;
      gameState.phase = 'revival';
      gameState.activePlayerIndex = pendingRevivals[0].playerIndex;
      helpers.addLog(`进入复活阶段`, -1);
      helpers.broadcastState();
      helpers.checkBotTurn();
      return;
    }
    this.beginNextRound(gameState, helpers);    
  }

  static async useSkill(
    gameState: GameState,
    playerIndex: number,
    payload: { skillId: string, targetTokenId?: string, targetHex?: { q: number, r: number }, ignoreConditions?: boolean },
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    console.log(`[ActionEngine.useSkill] playerIndex=${playerIndex}, payload=${JSON.stringify(payload)}`);
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex) {
      console.log(`[ActionEngine.useSkill] Invalid player index or not active player`);
      return;
    }

    const skill = skillRegistry.getSkill(payload.skillId);
    if (!skill) {
      console.log(`[ActionEngine.useSkill] Skill not found: ${payload.skillId}`);
      helpers.addLog(`[系统] 技能 ${payload.skillId} 不存在`, playerIndex);
      return;
    }

    const sourceTokenId = gameState.activeHeroTokenId;
    if (!sourceTokenId) {
      console.log(`[ActionEngine.useSkill] No active hero token`);
      helpers.addLog(`[系统] 找不到当前行动英雄`, playerIndex);
      return;
    }

    let ignoreConditions = payload.ignoreConditions;
    if (gameState.skillQueue && gameState.skillQueue.length > 0) {
      const currentQueueItem = gameState.skillQueue[0];
      if (currentQueueItem.skillId === payload.skillId && currentQueueItem.sourceTokenId === sourceTokenId) {
        ignoreConditions = currentQueueItem.ignoreConditions;
      }
    }

    const context: SkillContext = {
      gameState,
      playerIndex,
      sourceTokenId,
      targetTokenId: payload.targetTokenId,
      targetHex: payload.targetHex,
      ignoreConditions
    };

    console.log(`[ActionEngine.useSkill] Executing skill ${payload.skillId}`);
    // Execute the skill
    const result = await SkillEngine.useActiveSkill(payload.skillId, context, helpers);
    console.log(`[ActionEngine.useSkill] Execution result: ${JSON.stringify(result)}`);

    if (result.inProgress) {
      helpers.broadcastState();
      helpers.checkBotTurn();
      return;
    }

    if (result.success) {
      helpers.addLog(`玩家${playerIndex + 1} 使用了技能【${skill.name}】`, playerIndex);
      
      // Clear skill selection state
      gameState.activeSkillId = null;
      
      // Only clear reachable cells if we're not in a phase that needs them
      const interactivePhases = [
        'action_defend',
        'action_resolve_attack',
        'action_resolve',
        'action_select_substitute'
      ];
      
      if (!interactivePhases.includes(gameState.phase)) {
        gameState.reachableCells = [];
      }
      
      // If the skill initiated combat or needs target selection, don't finish action yet
      if (interactivePhases.includes(gameState.phase)) {
        helpers.broadcastState();
        helpers.checkBotTurn();
        return;
      }

      // Finish the action
      await this.finishAction(gameState, playerIndex, helpers, socket);
    } else {
      helpers.addLog(`[系统] 技能使用失败: ${result.reason || '未知原因'}`, playerIndex);
      
      if (gameState.skillQueue && gameState.skillQueue.length > 0) {
        // Abort the queue and finish the action
        gameState.skillQueue = [];
        await this.finishAction(gameState, playerIndex, helpers, socket);
      } else {
        // Return to skill selection phase if failed
        gameState.phase = 'action_select_skill';
        gameState.activeSkillId = null;
        gameState.activeSkillState = null;
        gameState.reachableCells = [];
        helpers.broadcastState();
        helpers.checkBotTurn();
      }
    }
  }

  /**
   * 结算行动完成 (Finish resolve)
   */
  /**
   * 结束攻击结算 (End resolve attack)
   */
  static async endResolveAttack(
    gameState: GameState,
    attackerIndex: number,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    if (gameState.phase === 'action_defend') {
      // Transition to resolve phase
      gameState.phase = 'action_resolve_attack';
      await CombatLogic.resolveAttack(gameState, attackerIndex, helpers);
      
      // Trigger skill post-combat effects (like knockback) before counter-attack
      await SkillEngine.onCombatResolved(gameState, {}, helpers);

      // ----- Defensive and Offensive Equipment Triggers ----- //
      const targetToken = gameState.tokens.find((t: any) => t.boundToCardId === gameState.selectedTargetId);
      const attackerToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
      
      if (gameState.isDefended) {
        const defenderIndex = 1 - attackerIndex;
        // Target defended: Trigger target's 战术盾 and 防御符文
        if (targetToken) {
          const equipments = gameState.tableCards.filter(c => c && c.equippedToId === targetToken.boundToCardId);
          for (const eq of equipments) {
            if (!eq.name) continue;
            if ((eq.name === '战术盾' && !eq.usedInTurn) || eq.name === '防御符文') {
              eq.usedInTurn = true;
              let logMsg = `[${eq.name}] 生效，可移动1格`;
              if (eq.name === '防御符文') {
                eq.equippedToId = undefined;
                if (!gameState.discardPiles.treasure) gameState.discardPiles.treasure = [];
                gameState.discardPiles.treasure.push(eq);
                gameState.tableCards = gameState.tableCards.filter(c => c && c.id !== eq.id);
                logMsg += "（消耗）";
              }
              helpers.addLog(logMsg, defenderIndex);
              const resp = await helpers.promptPlayer!(defenderIndex, 'heal_move', { message: `请选择移动目标` });
              if (resp && resp.targetHex) {
                const pos = hexToPixel(resp.targetHex.q, resp.targetHex.r);
                targetToken.x = pos.x;
                targetToken.y = pos.y;
                socket.emit('item_moved', { type: 'token', id: targetToken.id, x: pos.x, y: pos.y });
              }
            }
          }
        }
        // Attacker failed attack: Trigger attacker's 战术腰带
        if (attackerToken) {
          const equipments = gameState.tableCards.filter(c => c && c.equippedToId === attackerToken.boundToCardId);
          for (const eq of equipments) {
            if (eq.name === '战术腰带' && !eq.usedInTurn) {
              eq.usedInTurn = true;
              helpers.addLog(`[战术腰带] 生效，攻击失败，可移动1格`, attackerIndex);
              const resp = await helpers.promptPlayer!(attackerIndex, 'heal_move', { message: `请选择移动目标` });
              if (resp && resp.targetHex) {
                const pos = hexToPixel(resp.targetHex.q, resp.targetHex.r);
                attackerToken.x = pos.x;
                attackerToken.y = pos.y;
                socket.emit('item_moved', { type: 'token', id: attackerToken.id, x: pos.x, y: pos.y });
              }
            }
          }
        }
      }
      
      if (gameState.isCounterAttack) {
        // Automate counter-attack resolution
        gameState.phase = 'action_resolve_attack_counter';
        await this.endResolveAttackCounter(gameState, attackerIndex, helpers, socket);
      } else {
        await this.finishAction(gameState, attackerIndex, helpers, socket);
      }
    }
  }

  /**
   * 结束反击结算 (End resolve attack counter)
   */
  static async endResolveAttackCounter(
    gameState: GameState,
    attackerIndex: number,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    if (gameState.phase === 'action_resolve_attack_counter') {
      // The original defender is performing the counter attack
      const defenderIndex = 1 - attackerIndex;
      await CombatLogic.resolveCounterAttack(gameState, defenderIndex, helpers);
      await this.finishAction(gameState, attackerIndex, helpers, socket);
    }
  }
}
