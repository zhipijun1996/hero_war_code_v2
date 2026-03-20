import { GameState, GamePhase } from '../../shared/types';
import { pixelToHex, hexToPixel, generateId } from '../../shared/utils/hexUtils';
import { getPathDist, resolveTileEffect, getReachableHexes, isTargetInAttackRange, getAttackableHexes } from '../map/mapLogic';
import { isHeroDead } from '../combat/combatLogic';
import { HEROES_DATABASE } from '../../shared/config/heroes';
import { REWARDS } from '../../shared/hex/tileLogic';

const heroesDatabase = HEROES_DATABASE;

export interface ActionHelpers {
  addLog: (message: string, playerIndex?: number) => void;
  broadcastState: () => void;
  checkBotTurn: () => void;
  setPhase: (phase: GamePhase) => void;
  checkAndResetChanting: (tokenId: string) => void;
  addReputation: (playerIndex: number, amount: number, reason: string) => void;
  // For nested handler calls
  finish_resolve: (socket: any) => void;
  end_resolve_attack: (socket: any) => void;
  checkAllTokensUsed: () => void;
  updateAvailableActions: (playerIndex: number) => void;
}

export class ActionEngine {
  /**
   * 处理移动逻辑 (Move logic)
   */
  static moveTokenToCell(
    gameState: GameState,
    playerIndex: number,
    q: number,
    r: number,
    helpers: ActionHelpers,
    socket: any
  ): void {
    const enhancementCard = gameState.activeEnhancementCardId 
      ? gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId) 
      : null;

    if ((gameState.phase === 'action_select_option' || gameState.phase === 'action_resolve') && 
        playerIndex === gameState.activePlayerIndex && 
        gameState.selectedTokenId) {
      
      const token = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
      if (token && gameState.reachableCells.some(c => c.q === q && c.r === r)) {
        if (gameState.selectedOption === 'move' || 
            gameState.selectedOption === 'sprint' || 
            (gameState.phase === 'action_resolve' && gameState.activeActionType === 'move')) {
          
          const currentHex = pixelToHex(token.x, token.y);
          const dist = getPathDist(currentHex, { q, r }, gameState);
          
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
                if (isHeroDead(heroCard, gameState)) {
                  helpers.addLog(`玩家${playerIndex + 1}的英雄被陷阱击杀！`, playerIndex);
                  heroCard.damage = 0;
                  if (damageCounter) damageCounter.value = 0;
                  
                  // Remove token from map, place on hero card
                  token.x = heroCard.x;
                  token.y = heroCard.y;
                  
                  // Add time counter to hero card
                  gameState.counters.push({ 
                    id: generateId(), 
                    type: 'time', 
                    x: heroCard.x, 
                    y: heroCard.y, 
                    value: 0, 
                    boundToCardId: heroCard.id 
                  });
                  helpers.checkAndResetChanting(token.id);
                }
              }
              
              // Place time counter on trap
              gameState.counters.push({ id: generateId(), type: 'time', x: pos.x, y: pos.y, value: 0 });
            }

            // Increment action count for this token if it's the first move in this action
            const hasMovedThisAction = gameState.movementHistory?.some(step => 
              step.tokenId === token.id && 
              step.mvCost > 0 && 
              step !== gameState.movementHistory![gameState.movementHistory!.length - 1]
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
          const monster = gameState.map!.monsters.find(m => m.q === q && m.r === r);
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
                const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === token.boundToCardId);
                const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
                
                let expGain = 0;
                let goldGain = 0;
                let repGain = 0;

                if (monster.level === 1) {
                  expGain = REWARDS.MONSTER.LV1.EXP;
                  goldGain = REWARDS.MONSTER.LV1.GOLD;
                  repGain = REWARDS.MONSTER.LV1.REP;
                } else if (monster.level === 2) {
                  expGain = REWARDS.MONSTER.LV2.EXP;
                  goldGain = REWARDS.MONSTER.LV2.GOLD;
                  repGain = REWARDS.MONSTER.LV2.REP;
                } else if (monster.level === 3) {
                  expGain = REWARDS.MONSTER.LV3.EXP;
                  goldGain = REWARDS.MONSTER.LV3.GOLD;
                  repGain = REWARDS.MONSTER.LV3.REP;
                }

                if (expCounter) expCounter.value += expGain;
                if (goldCounter) goldCounter.value += goldGain;
                
                helpers.addLog(`奖励阶段: ${heroCard?.heroClass} 击败了 LV${monster.level}怪物，获得 ${expGain} 经验和 ${goldGain} 金币`, playerIndex);
                gameState.notification = `击杀怪物！获得 ${expGain} 经验和 ${goldGain} 金币。`;
                
                // Reputation scoring
                if (repGain > 0) {
                  helpers.addReputation(playerIndex, repGain, `击杀LV${monster.level}怪物`);
                }
              } else {
                // Turret attack does not trigger counter-attack from monster
                helpers.addLog(`反击阶段: 炮台攻击不会触发怪物的反击`, playerIndex);
              }
            }
          }
          
          const enemyCastle = gameState.map!.castles[1 - playerIndex as 0 | 1].find(c => c.q === q && c.r === r);
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
            gameState.lastPlayedCardId = null;
            gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
            gameState.reachableCells = [];
            helpers.broadcastState();
            helpers.checkBotTurn();
            return;
          }

          // Finish action
          helpers.finish_resolve(socket);
          return;
        } else if (gameState.selectedOption === 'attack' || (gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack')) {
          // Interrupt chanting when performing an action
          helpers.checkAndResetChanting(token.id);

          // Handle attack on hex
          const monster = gameState.map!.monsters.find(m => m.q === q && m.r === r);
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
              
              let damage = 1; // Base damage
              const enhancementCard = gameState.activeEnhancementCardId 
                ? gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId) 
                : null;
              if (enhancementCard?.name === '强击') damage += 1;
              damageCounter.value += damage;
              
              const heroCard = gameState.tableCards.find(c => c.id === token.boundToCardId);
              if (heroCard) {
                helpers.addLog(`发起阶段: ${heroCard.heroClass} 对 LV${monster.level}怪物 发起了攻击`, playerIndex);
              }
              helpers.addLog(`结算阶段: LV${monster.level}怪物 受到 ${damage} 点伤害，当前受伤计数器为 ${damageCounter.value}`, playerIndex);

              if (damageCounter.value >= monster.level) {
                // Monster dies
                gameState.counters = gameState.counters.filter(c => c.id !== damageCounter!.id);
                gameState.counters.push({ id: generateId(), type: 'time', x: pos.x, y: pos.y, value: 0 });
                
                helpers.addLog(`阵亡阶段: LV${monster.level}怪物 已阵亡`, playerIndex);

                // Gain EXP and Gold
                const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === token.boundToCardId);
                const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
                
                let expGain = 0;
                let goldGain = 0;
                let repGain = 0;

                if (monster.level === 1) {
                  expGain = REWARDS.MONSTER.LV1.EXP;
                  goldGain = REWARDS.MONSTER.LV1.GOLD;
                  repGain = REWARDS.MONSTER.LV1.REP;
                } else if (monster.level === 2) {
                  expGain = REWARDS.MONSTER.LV2.EXP;
                  goldGain = REWARDS.MONSTER.LV2.GOLD;
                  repGain = REWARDS.MONSTER.LV2.REP;
                } else if (monster.level === 3) {
                  expGain = REWARDS.MONSTER.LV3.EXP;
                  goldGain = REWARDS.MONSTER.LV3.GOLD;
                  repGain = REWARDS.MONSTER.LV3.REP;
                }

                if (expCounter) expCounter.value += expGain;
                if (goldCounter) goldCounter.value += goldGain;
                
                helpers.addLog(`奖励阶段: ${heroCard?.heroClass} 击败了 LV${monster.level}怪物，获得 ${expGain} 经验和 ${goldGain} 金币`, playerIndex);
                gameState.notification = `击杀怪物！获得 ${expGain} 经验和 ${goldGain} 金币。`;
                
                // Reputation scoring
                if (repGain > 0) {
                  helpers.addReputation(playerIndex, repGain, `击杀LV${monster.level}怪物`);
                }

                gameState.reachableCells = [];
                if (gameState.phase === 'action_resolve') {
                  helpers.finish_resolve(socket); 
                } else {
                  helpers.broadcastState();
                  helpers.checkBotTurn();
                }
                return;
              } else {
                // Monster counter-attacks
                if (heroCard) {
                  heroCard.damage = (heroCard.damage || 0) + 1;
                  const heroDamageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === heroCard.id);
                  if (heroDamageCounter) heroDamageCounter.value = heroCard.damage;
                  helpers.addLog(`反击阶段: LV${monster.level}怪物 存活，触发反击！${heroCard.heroClass} 受到 1 点伤害`, playerIndex);
                  helpers.addLog(`结算阶段: ${heroCard.heroClass} 当前受伤计数器为 ${heroCard.damage}`, playerIndex);
                  gameState.notification = `攻击怪物！怪物反击造成 1 点伤害。 (Attacked monster! Monster counter-attacked for 1 damage.)`;
                  
                  // Check hero death
                  const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard.heroClass);
                  const levelData = heroData?.levels?.[heroCard.level || 1];
                  const hp = levelData?.hp || 3;
                  if (heroCard.damage >= hp) {
                    // Hero dies
                    heroCard.damage = 0;
                    if (heroDamageCounter) heroDamageCounter.value = 0;
                    
                    // Remove token from map, place on hero card
                    token.x = heroCard.x;
                    token.y = heroCard.y;
                    
                    // Add time counter to hero card
                    gameState.counters.push({ id: generateId(), type: 'time', x: heroCard.x, y: heroCard.y, value: 0, boundToCardId: heroCard.id });
                    helpers.checkAndResetChanting(token.id);
                    
                    helpers.addLog(`阵亡阶段: ${heroCard.heroClass} 已阵亡`, playerIndex);
                    gameState.notification += ` ${heroCard.heroClass} 阵亡！ (Hero died!)`;
                  }
                }
              }
              
              // Finish attack action
              gameState.selectedOption = null;
              gameState.selectedTargetId = null;
              gameState.selectedTokenId = null;
              gameState.reachableCells = [];
              helpers.addLog(`玩家${playerIndex + 1}攻击了怪物并等待结算完成`, playerIndex);
              if (gameState.phase === 'action_resolve') {
                helpers.finish_resolve(socket);
              } else {
                helpers.broadcastState();
                helpers.checkBotTurn();
              }
              return;
            }
          }
          
          // Attack enemy castle
          const enemyIndex = 1 - playerIndex;
          const enemyCastles = gameState.map!.castles[enemyIndex as 0 | 1];
          const isEnemyCastle = enemyCastles.some(c => c.q === q && c.r === r);
          if (isEnemyCastle) {
            const enemyUnit = gameState.tokens.find(t => {
              const hex = pixelToHex(t.x, t.y);
              return hex.q === q && hex.r === r;
            });
            if (!enemyUnit) {
              const enemyIndex = 1 - playerIndex;
              gameState.castleHP[enemyIndex] = (gameState.castleHP[enemyIndex] || 3) - 1;
              
              // Reputation scoring for damaging castle
              helpers.addReputation(playerIndex, 2, "王城伤害");
              
              const heroCard = gameState.tableCards.find(c => c.id === token.boundToCardId);
              if (heroCard) {
                helpers.addLog(`发起阶段: ${heroCard.heroClass} 对 玩家${enemyIndex + 1}王城 发起了攻击`, playerIndex);
              }
              helpers.addLog(`结算阶段: 玩家${enemyIndex + 1}王城 受到 1 点伤害，当前受伤计数器为 ${3 - gameState.castleHP[enemyIndex]}`, playerIndex);

              if (gameState.castleHP[enemyIndex] <= 0) {
                helpers.addLog(`阵亡阶段: 玩家${enemyIndex + 1}王城 已被摧毁`, playerIndex);
              }

              gameState.notification = `王城受到攻击！玩家 ${enemyIndex + 1} 的王城 HP 剩余 ${gameState.castleHP[enemyIndex]}。`;
              
              if (gameState.castleHP[enemyIndex] <= 0) {
                gameState.notification = `游戏结束！玩家 ${playerIndex + 1} 摧毁了敌方王城，获得胜利！`;
                gameState.gameStarted = false;
              }
              
              // Finish attack action
              gameState.selectedOption = null;
              gameState.selectedTargetId = null;
              gameState.selectedTokenId = null;
              gameState.reachableCells = [];
              if (gameState.phase === 'action_resolve') {
                helpers.finish_resolve(socket);
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
            gameState.lastPlayedCardId = null;
            gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
            gameState.reachableCells = [];
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
         gameState.phase !== 'action_select_hero' && gameState.phase !== 'action_select_card' && 
         gameState.phase !== 'action_select_action')) return;

    const token = gameState.actionTokens.find(t => t.id === tokenId);
    if (!token || token.playerIndex !== playerIndex || token.used) return;

    gameState.activeActionTokenId = tokenId;
    gameState.activeEnhancementCardId = null; // Reset enhancement card
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
    const subPhases = ['action_select_card', 'action_select_action', 'action_common', 'action_play_enhancement', 'action_select_substitute'];
    if (subPhases.includes(gameState.phase)) {
      gameState.phase = 'action_options';
      gameState.notification = null;
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
      gameState.phase = 'action_select_card';
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
    action: 'open_chest' | 'early_buy' | 'seize_initiative' | 'recruit',
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
        const chest = gameState.map!.chests.find(ch => ch.q === hex.q && ch.r === hex.r);
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
        gameState.phase = 'action_select_option';
        gameState.selectedOption = 'buy';
        gameState.notification = null;
        helpers.broadcastState();
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
    } else if (action === 'recruit') {
      const gold = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
      if (gold && gold.value >= 2) {
        gameState.canHire = true;
        gameState.phase = 'action_select_option';
        gameState.selectedOption = 'hire';
        gameState.notification = null;
        helpers.broadcastState();
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
  static selectHeroAction(
    gameState: GameState,
    playerIndex: number,
    actionType: 'move' | 'attack' | 'skill' | 'evolve',
    helpers: ActionHelpers,
    socket: any
  ): void {
    if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_select_action') return;

    const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
    if (!heroToken) {
      socket.emit('error_message', '未选择英雄 (No hero selected)');
      return;
    }

    if (actionType === 'evolve') {
      const heroCard = heroToken ? gameState.tableCards.find(c => c.id === heroToken.boundToCardId) : null;
      if (heroCard && heroCard.level < 3) {
        const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard.heroClass);
        const levelData = heroData?.levels?.[heroCard.level || 1];
        const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === heroCard.id);
        const expNeeded = levelData?.xp;
        if (!expCounter || typeof expNeeded !== 'number' || expCounter.value < expNeeded) {
          socket.emit('error_message', '经验不足，无法进化 (Not enough EXP to evolve)');
          return;
        }
      } else {
        socket.emit('error_message', '英雄已达到最高等级 (Hero is already at max level)');
        return;
      }
    }

    if (actionType === 'attack') {
      const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
      const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard?.heroClass);
      const levelData = heroData?.levels?.[heroCard?.level || 1];
      
      let ar = levelData?.ar || 1;
      const enhancementCard = gameState.activeEnhancementCardId 
        ? gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId) 
        : null;
      if (enhancementCard?.name === '远攻' || enhancementCard?.name === '远程战术') ar += 1;

      const attackerHex = pixelToHex(heroToken.x, heroToken.y);
      gameState.reachableCells = getAttackableHexes(attackerHex.q, attackerHex.r, ar, playerIndex, gameState, heroCard?.level || 1);
      gameState.phase = 'action_resolve';
      gameState.activeActionType = 'attack';
      gameState.selectedTokenId = heroToken.id;
      gameState.notification = '选择攻击目标 (Select attack target)';
    } else if (actionType === 'move') {
      const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
      const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard?.heroClass);
      const levelData = heroData?.levels?.[heroCard?.level || 1];
      
      let mv = levelData?.mv || 2;
      const enhancementCard = gameState.activeEnhancementCardId 
        ? gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId) 
        : null;
      if (enhancementCard?.name === '冲刺' || enhancementCard?.name === '冲刺卷轴') mv += 1;

      const currentHex = pixelToHex(heroToken.x, heroToken.y);
      gameState.reachableCells = getReachableHexes(currentHex, mv, playerIndex, gameState);
      gameState.remainingMv = mv;
      gameState.phase = 'action_resolve';
      gameState.activeActionType = 'move';
      gameState.selectedTokenId = heroToken.id;
      gameState.notification = '选择移动目标 (Select move target)';
    } else if (actionType === 'skill') {
      gameState.phase = 'action_select_skill';
      gameState.notification = '选择技能 (Select skill)';
    } else if (actionType === 'evolve') {
      gameState.phase = 'action_select_option';
      gameState.selectedOption = 'evolve';
      gameState.selectedTokenId = heroToken.id;
      gameState.notification = '确认进化 (Confirm evolve)';
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
    socket: any
  ): void {
    gameState.lastEvolvedId = null;
    if (gameState.phase === 'supply') {
      const needsDiscard = Object.values(gameState.players).some(p => p && p.hand && p.hand.length > 5);
      if (needsDiscard) {
        gameState.phase = 'discard';
        helpers.addLog(`进入弃牌阶段`, -1);
      } else {
        gameState.phase = 'shop';
        gameState.activePlayerIndex = 1 - gameState.firstPlayerIndex;
        helpers.updateAvailableActions(gameState.activePlayerIndex);
        helpers.addLog(`进入商店阶段`, -1);
      }
      helpers.broadcastState();
      helpers.checkBotTurn();
    } else if (gameState.phase === 'end') {
      // Reputation scoring for end of round
      gameState.tokens.forEach(token => {
        const hex = pixelToHex(token.x, token.y);
        const isMagicCircle = gameState.magicCircles.some(mc => mc.q === hex.q && mc.r === hex.r);
        const isCrystal = hex.q === 0 && hex.r === 0;
        
        if (isMagicCircle || isCrystal) {
          const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
          if (card) {
            const playerIdx = card.y > 0 ? 0 : 1;
            helpers.addReputation(playerIdx, 1, isCrystal ? "占领水晶" : "占领魔法阵");
          }
        }
      });

      // Execute end round logic
      if (gameState.playAreaCards.length > 0) {
        gameState.discardPiles.action.push(...gameState.playAreaCards);
        gameState.playAreaCards = [];
      }
      
      const countersToRemove: string[] = [];
      const pendingRevivals: any[] = [];
      const freeCastlesCount = { 0: 0, 1: 0 };
      
      // Count free castles for each player
      for (let pIdx = 0; pIdx < 2; pIdx++) {
        const playerCastles = gameState.map!.castles[pIdx as 0 | 1];
        for (const cCoord of playerCastles) {
          const pos = hexToPixel(cCoord.q, cCoord.r);
          const occupied = gameState.tokens.some(t => Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
          if (!occupied) {
            freeCastlesCount[pIdx as 0 | 1]++;
          }
        }
      }
      
      gameState.counters.forEach(counter => {
        if (counter.type === 'time') {
          counter.value += 1;
          
          if (counter.boundToCardId) {
            const heroCard = gameState.tableCards.find(c => c.id === counter.boundToCardId);
            if (heroCard && heroCard.type === 'hero') {
              if (counter.value >= 3) {
                const isPlayer1 = heroCard.y > 0;
                const playerIndex = isPlayer1 ? 0 : 1;
                
                if (freeCastlesCount[playerIndex as 0 | 1] > 0) {
                  pendingRevivals.push({ heroCardId: heroCard.id, playerIndex });
                  countersToRemove.push(counter.id);
                  freeCastlesCount[playerIndex as 0 | 1]--;
                } else {
                  counter.value = 2; // Keep it at 2 so it tries again next round
                  gameState.notification = (gameState.notification ? gameState.notification + ' ' : '') + `${heroCard.heroClass} 等待复活，但所有王城都被占用。 (Hero waiting to revive, but all castles are occupied.)`;
                }
              }
              return;
            }
          }
          
          // Refresh monsters/chests/traps
          const hex = pixelToHex(counter.x, counter.y);
          const isTrap = gameState.map!.traps?.some(t => t.q === hex.q && t.r === hex.r);
          if (isTrap) {
            if (counter.value >= 2) {
              countersToRemove.push(counter.id);
              gameState.notification = (gameState.notification ? gameState.notification + ' ' : '') + `陷阱已重置！ (Trap reset!)`;
            }
          } else if (counter.value >= 3) {
            const isOccupied = gameState.tokens.some(t => Math.abs(t.x - counter.x) < 10 && Math.abs(t.y - counter.y) < 10);
            if (!isOccupied) {
              countersToRemove.push(counter.id);
              gameState.notification = (gameState.notification ? gameState.notification + ' ' : '') + `地图资源已刷新！ (Map resources refreshed!)`;
            }
          }
        }
      });
      
      if (countersToRemove.length > 0) {
        gameState.counters = gameState.counters.filter(c => !countersToRemove.includes(c.id));
      }

      if (pendingRevivals.length > 0) {
        gameState.pendingRevivals = pendingRevivals;
        gameState.phase = 'revival';
        gameState.activePlayerIndex = pendingRevivals[0].playerIndex;
        helpers.addLog(`进入复活阶段`, -1);
        helpers.broadcastState();
        helpers.checkBotTurn();
        return;
      }
      
      gameState.round += 1;
      gameState.roundActionCounts = {};
      gameState.phase = 'action_play';
      gameState.activePlayerIndex = gameState.firstPlayerIndex;
      gameState.consecutivePasses = 0;
      gameState.hasSeizedInitiative = false;
      
      // Reset discardFinished for next round
      Object.values(gameState.players).forEach(p => p.discardFinished = false);
      
      helpers.broadcastState();
      helpers.checkBotTurn();
    }
  }

  /**
   * 处理目标选择逻辑 (Target selection logic)
   */
  static resolveTargetSelection(
    gameState: GameState,
    playerIndex: number,
    targetId: string,
    helpers: ActionHelpers,
    socket: any
  ): void {
    if ((gameState.phase === 'action_select_option' || 
         gameState.phase === 'action_defend' || 
         gameState.phase === 'shop' || 
         gameState.phase === 'action_resolve') && 
        playerIndex === gameState.activePlayerIndex) {
      
      gameState.selectedTargetId = targetId;
      
      // Immediate execution for evolve and heal to remove "Confirm" step
      if (gameState.phase === 'action_select_option') {
        if (gameState.selectedOption === 'evolve') {
          helpers.finish_resolve(socket);
          return;
        }
        if (gameState.selectedOption === 'heal') {
          helpers.finish_resolve(socket);
          return;
        }
      }

      // If we are in action_resolve and it's an attack, transition to defense phase
      if ((gameState.phase === 'action_resolve' && gameState.activeActionType === 'attack') || 
          (gameState.phase === 'action_select_option' && (gameState.selectedOption === 'attack' || gameState.selectedOption === 'turret_attack'))) {
        
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
        if (enhancementCard?.name === '远攻' || enhancementCard?.name === '远程战术') ar += 1;
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
          gameState.selectedTargetId = `monster_${monster.q}_${monster.r}`;
          gameState.phase = 'action_resolve_attack';
          helpers.end_resolve_attack(socket);
          return;
        }

        if (isCastle) {
          const parts = targetId.split('_');
          const cq = parseInt(parts[1]);
          const cr = parseInt(parts[2]);
          const castleIdx = (cq === 0 && cr === -4) || (gameState.map?.castles[0]?.some(c => c.q === cq && c.r === cr)) ? 0 : 1;
          
          if (castleIdx === playerIndex) {
            socket.emit('error_message', '不能攻击自己的城堡');
            return;
          }

          if (attackerCard) {
            helpers.addLog(`发起阶段: ${attackerCard.heroClass} 对 敌方城堡 发起了攻击`, playerIndex);
          }
          gameState.selectedTargetId = targetId;
          gameState.phase = 'action_resolve_attack';
          helpers.end_resolve_attack(socket);
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
        gameState.lastPlayedCardId = null;
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        gameState.reachableCells = [];
        helpers.broadcastState();
        helpers.checkBotTurn();
        return;
      }
      
      helpers.broadcastState();
    }
  }
}
