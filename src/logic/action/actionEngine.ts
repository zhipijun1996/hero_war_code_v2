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
  promptPlayer?: (playerIndex: number, promptType: string, context: any) => Promise<boolean>;
}

export class ActionEngine {
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
                  CombatLogic.handleHeroDeath(heroCard, token, playerIndex, helpers, gameState);
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
              helpers.addLog(`发起阶段: ${heroCard.heroClass} 使用炮台对 ${targetCard.heroClass} 发起了攻击`, playerIndex);
            }

            gameState.selectedTargetId = targetToken.boundToCardId || null;
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
            return;
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
              helpers.addLog(`发起阶段: ${heroCard.heroClass} 对 ${targetCard.heroClass} 发起了攻击`, playerIndex);
            }

            gameState.selectedTargetId = targetToken.boundToCardId || null;
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
            return;
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
        gameState.phase = 'action_options';
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
    
    if (subPhases.includes(gameState.phase)) {
      // Reset action-specific state
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
      gameState.notification = null;
      
      gameState.phase = 'action_options';
      helpers.broadcastState();
      return;
    }

    gameState.activeActionTokenId = null;
    gameState.activeHeroTokenId = null;
    gameState.activeEnhancementCardId = null;
    gameState.phase = 'action_play';
    gameState.notification = null;
    helpers.broadcastState();
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
  static selectCommonAction(
    gameState: GameState,
    playerIndex: number,
    action: 'open_chest' | 'early_buy' | 'seize_initiative' | 'hire',
    helpers: ActionHelpers,
    socket: any
  ): void {
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
              if (player) {
                player.hand.push(treasureCard);
                helpers.addLog(`玩家${playerIndex + 1}开启了${chestType}级宝箱，获得了${goldReward}金币和一张宝藏卡`, playerIndex);
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

    if (gameState.phase === 'action_select_hero') {
      gameState.activeHeroTokenId = heroTokenId;
      gameState.phase = 'action_options';
      gameState.notification = null;
      helpers.broadcastState();
      helpers.checkBotTurn();
    } else if (gameState.phase === 'action_select_substitute') {
      gameState.activeHeroTokenId = heroTokenId;
      gameState.phase = 'action_select_action';
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
    actionType: 'move' | 'attack' | 'skill' | 'evolve' | 'chant' | 'fire',
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

    if (actionType === 'attack') {
      helpers.checkAndResetChanting(heroToken.id);
      const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
      
      let ar = SkillEngine.getModifiedStat(heroToken.id, 'ar', gameState);
      const enhancementCard = gameState.activeEnhancementCardId
        ? (gameState.playAreaCards.find(c => c.id === gameState.activeEnhancementCardId) ||
          gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId))
        : null;

      ar += getAttackRangeBonusFromEnhancement(enhancementCard?.name);

      const attackerHex = pixelToHex(heroToken.x, heroToken.y);
      gameState.reachableCells = getAttackableHexes(attackerHex.q, attackerHex.r, ar, playerIndex, gameState, heroCard?.level || 1);
      gameState.phase = 'action_resolve';
      gameState.activeActionType = 'attack';
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
    }
    helpers.broadcastState();
    helpers.checkBotTurn();
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

      if (gameState.phase === 'action_select_skill_target') {
        const skillId = gameState.activeSkillId;
        if (!skillId) return;
        
        // Call useSkill with the selected target
        await this.useSkill(gameState, playerIndex, { skillId, targetTokenId: targetId }, helpers, socket);
        return;
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

      // If we are in action_resolve and it's an attack, transition to defense phase
      if (gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack') {
        
        const targetCard = gameState.tableCards.find(c => c.id === targetId);
        const monster = gameState.map?.monsters?.find(m => `monster_${m.q}_${m.r}` === targetId);
        const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
        const isCastle = targetId.startsWith('castle_');
        
        if (!targetCard && !monster && !isCastle) {
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
        const attackerHeroData = heroesDatabase?.heroes?.find((h: any) => h.name === attackerCard?.heroClass);
        const attackerLevelData = attackerHeroData?.levels?.[attackerCard?.level || 1];
        
        const enhancementCard = gameState.activeEnhancementCardId 
          ? (gameState.playAreaCards.find(c => c.id === gameState.activeEnhancementCardId) || 
             gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId))
          : null;
        let ar = attackerLevelData?.ar || 1;
        ar += getAttackRangeBonusFromEnhancement(enhancementCard?.name);
        if (gameState.selectedOption === 'turret_attack') ar += 1;

        const attackerHex = pixelToHex(attackerToken.x, attackerToken.y);
        let targetHex;
        if (monster) {
          targetHex = { q: monster.q, r: monster.r };
        } else if (isCastle) {
          const parts = targetId.split('_');
          targetHex = { q: parseInt(parts[1]), r: parseInt(parts[2]) };
        } else {
          const targetToken = gameState.tokens.find(t => t.boundToCardId === targetCard!.id);
          targetHex = targetToken ? pixelToHex(targetToken.x, targetToken.y) : pixelToHex(targetCard!.x, targetCard!.y);
        }

        if (!isTargetInAttackRange(attackerHex, targetHex, ar, gameState)) {
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
        
        if (attackerCard) {
          helpers.addLog(`发起阶段: ${attackerCard.heroClass} 对 ${targetCard!.heroClass} 发起了攻击`, playerIndex);
        }

        const targetToken = gameState.tokens.find(t => t.boundToCardId === targetCard!.id);
        gameState.selectedTargetId = targetToken ? targetToken.boundToCardId || null : targetCard!.id;
        gameState.phase = 'action_defend';
        gameState.notification = null;
        gameState.pendingDefenseCardId = null;
        gameState.hasDefenseCard = false;
        gameState.canCounterAttack = false;
        gameState.lastPlayedCardId = null;
        gameState.isCounterAttack = false;
        gameState.isDefended = false;
        gameState.attackInitiatorIndex = playerIndex;
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        gameState.reachableCells = [];
        helpers.addLog(`请玩家${gameState.activePlayerIndex + 1}打出防御卡，或选择Pass`, gameState.activePlayerIndex);
        helpers.broadcastState();
        helpers.checkBotTurn();
        return;
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

    const player = gameState.players[socket.id];
    if (!player) return;

    const cardIndex = player.hand.findIndex((c: any) => c.id === cardId);
    if (cardIndex === -1) return;

    const card = player.hand[cardIndex];
    
    if (!isEnhancementCardName(card.name || '')) {
      socket.emit('error_message', '只能打出增强卡');
      return;
    }

    player.hand.splice(cardIndex, 1);
    gameState.discardPiles.action.push(card);
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
   * 完成行动 (Finish action)
   */
  static async finishAction(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers,
    socket: any
  ): Promise<void> {
    // 触发战斗结算后的技能回调
    await SkillEngine.onCombatResolved(gameState, {}, helpers);

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

    const token = gameState.actionTokens.find((t: any) => t.id === gameState.activeActionTokenId);
    if (token) token.used = true;

    gameState.activeActionTokenId = null;
    gameState.activeActionType = null;
    gameState.activeEnhancementCardId = null;
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
    // 把行动 token 翻回可用
    gameState.actionTokens.forEach(t => {
      t.used = false;
    });
    gameState.round += 1;
    gameState.roundActionCounts = {};
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

    helpers.broadcastState();
    helpers.checkBotTurn();
  }

  static async resolveEndPhase(
    gameState: GameState,
    helpers: ActionHelpers
  ): Promise<void> {
    // 触发回合结束事件
    await SkillEngine.triggerEvent('onTurnEnd', gameState, helpers);

    gameState.actionTokens.forEach(t => {
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
    payload: { skillId: string, targetTokenId?: string, targetHex?: { q: number, r: number } },
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

    const context: SkillContext = {
      gameState,
      playerIndex,
      sourceTokenId,
      targetTokenId: payload.targetTokenId,
      targetHex: payload.targetHex
    };

    console.log(`[ActionEngine.useSkill] Executing skill ${payload.skillId}`);
    // Execute the skill
    const result = await SkillEngine.useActiveSkill(payload.skillId, context, helpers);
    console.log(`[ActionEngine.useSkill] Execution result: ${JSON.stringify(result)}`);

    if (result.success) {
      helpers.addLog(`玩家${playerIndex + 1} 使用了技能【${skill.name}】`, playerIndex);
      
      // Clear skill selection state
      gameState.activeSkillId = null;
      gameState.reachableCells = [];
      
      // If the skill initiated combat, don't finish action yet
      if (gameState.phase === 'action_defend' || gameState.phase === 'action_resolve_attack') {
        helpers.broadcastState();
        helpers.checkBotTurn();
        return;
      }

      // Finish the action
      await this.finishAction(gameState, playerIndex, helpers, socket);
    } else {
      helpers.addLog(`[系统] 技能使用失败: ${result.reason || '未知原因'}`, playerIndex);
      // Return to skill selection phase if failed
      gameState.phase = 'action_select_skill';
      gameState.activeSkillId = null;
      gameState.reachableCells = [];
      helpers.broadcastState();
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
