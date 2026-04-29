import { GameState, Card, TableCard, Token, HexCoord, ActionToken } from '../../shared/types/index.ts';
import { pixelToHex, hexToPixel, generateId, getHexDistance } from '../../shared/utils/hexUtils.ts';
import { getHeroStat } from '../hero/heroLogic.ts';
import { isTargetInAttackRange, getReachableHexes, getAttackableHexes } from '../map/mapLogic.ts';
import { canHeroEvolve } from '../hero/heroLogic.ts';
import { isEnhancementCardName } from '../card/enhancementModifiers.ts';
import { skillRegistry } from '../skills/skillRegistry.ts';
import { HEROES_DATABASE } from '../../shared/config/heroes.ts';

export type BotAction = 
  | { type: 'play_card'; payload: { cardId: string; targetCastleIndex?: number; targetId?: string } }
  | { type: 'revive_hero'; payload: { heroCardId: string; targetCastleIndex: number } }
  | { type: 'hire_hero'; payload: { cardId: string; goldAmount: number; targetCastleIndex: number } }
  | { type: 'move_token_to_cell'; payload: { tokenId: string; q: number; r: number } }
  | { type: 'click_action_token'; payload: { tokenId: string } }
  | { type: 'select_action_category'; payload: { category: string } }
  | { type: 'select_common_action'; payload: { action: string } }
  | { type: 'select_hero_for_action'; payload: { tokenId: string } }
  | { type: 'select_hero_action'; payload: { action: string } }
  | { type: 'select_target'; payload: { targetId: string } }
  | { type: 'pass_action' }
  | { type: 'select_hire_cost'; payload: { cost: number } }
  | { type: 'select_hire_castle'; payload: { castle: number } } 
  | { type: 'start_buy'} 
  | { type: 'start_hire' }      
  | { type: 'next_shop' }
  | { type: 'pass_shop' }  
  | { type: 'finish_action'}
  | { type: 'discard_card'; payload: { cardId: string } }
  | { type: 'finish_discard' }
  | { type: 'undo_play' }
  | { type: 'declare_defend' }
  | { type: 'declare_counter' }
  | { type: 'pass_defend' }  
  | { type: 'skill_interrupt_response'; payload: { response: any } }
  | { type: 'use_skill'; payload: { skillId: string; targetTokenId?: string; targetHex?: { q: number; r: number } } }
  | { type: 'select_skill_target'; payload: { skillId: string } }
  | { type: 'remove_ember_zone'; payload: { q: number; r: number } }
  | { type: 'none' };

export class BotStrategy {
  static decideNextAction(gameState: GameState, playerIndex: number, heroesDatabase: any): BotAction {
    const activePlayerId = gameState.seats[playerIndex];
    if (!activePlayerId) return { type: 'none' };
    
    const botPlayer = gameState.players[activePlayerId];
    if (!botPlayer || !botPlayer.hand) return { type: 'none' };

    const isPlayer1 = playerIndex === 0;
    const currentPhase = gameState.phase;

    switch (currentPhase) {
      case 'setup':
        return this.decideSetupAction(gameState, botPlayer, playerIndex);
      
      case 'action_play':
        return this.decideActionPlayAction(gameState, playerIndex);

      case 'action_options':
        return this.decideActionOptionsAction(gameState, botPlayer, playerIndex);

      case 'action_common':
        return this.decideActionCommonAction(gameState, playerIndex);

      case 'action_select_hero':
      case 'action_select_substitute':
        return this.decideActionSelectHeroAction(gameState, playerIndex);

      case 'revival':
        return this.decideRevivalAction(gameState, playerIndex);

      case 'action_select_action':
        return this.decideActionSelectActionAction(gameState, playerIndex, heroesDatabase);

      case 'action_select_skill':
        return this.decideActionSelectSkillAction(gameState, playerIndex, heroesDatabase);

      case 'action_select_skill_target':
        return this.decideActionSelectSkillTargetAction(gameState, playerIndex);

      case 'action_play_enhancement':
        return this.decideActionPlayEnhancementAction(gameState, botPlayer, playerIndex);

      case 'action_resolve':
        return this.decideActionResolveAction(gameState, playerIndex);

      case 'action_defend':
        return this.decideActionDefendAction(gameState, botPlayer, playerIndex);

      case 'action_resolve_attack':
      case 'action_resolve_attack_counter':
        return { type: 'none' };

      case 'action_remove_ember_zone':
        return this.decideActionRemoveEmberZoneAction(gameState, playerIndex);

      case 'shop':
        return this.decideShopAction(gameState, playerIndex);

      case 'hire':
        return this.decideHireAction(gameState, playerIndex);

      case 'discard':
        return this.decideDiscardAction(gameState, botPlayer);

      case 'skill_interrupt_prompt':
        return this.decideSkillInterruptAction(gameState, playerIndex);

      case 'supply':
      case 'end':
        return { type: 'none' };

      default:
        return { type: 'none' };
    }
  }

  private static decideActionRemoveEmberZoneAction(gameState: GameState, playerIndex: number): BotAction {
    // Just remove the first one 
    if (gameState.emberZones && gameState.emberZones.length > 0) {
      const zoneToRemove = gameState.emberZones[0];
      return { type: 'remove_ember_zone', payload: { q: zoneToRemove.q, r: zoneToRemove.r } };
    }
    return { type: 'none' };
  }

  private static decideSkillInterruptAction(gameState: GameState, playerIndex: number): BotAction {
    const prompt = gameState.pendingSkillPrompt;
    if (prompt && prompt.playerIndex === playerIndex) {
      if (prompt.promptType === 'suppression_discard' || prompt.promptType === 'discard_card') {
        const botPlayer = gameState.players[gameState.seats[playerIndex]];
        if (botPlayer && botPlayer.hand && botPlayer.hand.length > 0) {
          // Discard the first card
          const response = prompt.promptType === 'suppression_discard' 
            ? { discardedCardId: botPlayer.hand[0].id }
            : { discardedCardIds: [botPlayer.hand[0].id] };
          return { type: 'skill_interrupt_response', payload: { response } };
        } else {
          // Cannot discard, cancel move
          return { type: 'skill_interrupt_response', payload: { response: null } };
        }
      }

      if (prompt.promptType === 'select_skill') {
        const skills = prompt.context?.skills || [];
        if (skills.length > 0) {
          // Pick a random skill (or the first one)
          const choice = skills[Math.floor(Math.random() * (skills.length > 1 ? skills.length - 1 : 1))].id;
          return { type: 'skill_interrupt_response', payload: { response: choice } };
        }
      }

      if (prompt.promptType === 'heal_move' || prompt.promptType === 'thief_move') {
        if (gameState.reachableCells && gameState.reachableCells.length > 0) {
          const randomHex = gameState.reachableCells[Math.floor(Math.random() * gameState.reachableCells.length)];
          return { type: 'skill_interrupt_response', payload: { response: { targetHex: randomHex } } };
        }
        return { type: 'skill_interrupt_response', payload: { response: null } };
      }

      // For other skills like guardian_swap, bots always say yes
      return { type: 'skill_interrupt_response', payload: { response: true } };
    }
    return { type: 'none' };
  }

  private static decideRevivalAction(gameState: GameState, playerIndex: number): BotAction {
    const pending = gameState.pendingRevivals?.find(r => r && r.playerIndex === playerIndex);
    if (pending) {
      const playerCastles = gameState.map?.castles?.[playerIndex as 0 | 1] || [];
      let freeCastleIdx = -1;
      for (let i = 0; i < playerCastles.length; i++) {
        const pos = hexToPixel(playerCastles[i].q, playerCastles[i].r);
        const occupied = gameState.tokens.some(t => t && Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
        if (!occupied) {
          freeCastleIdx = i;
          break;
        }
      }
      if (freeCastleIdx !== -1) {
        return { type: 'revive_hero', payload: { heroCardId: pending.heroCardId, targetCastleIndex: freeCastleIdx } };
      }
    }
    return { type: 'none' };
  }

  private static decideSetupAction(gameState: GameState, botPlayer: any, playerIndex: number): BotAction {
    const activePlayerId = gameState.seats[playerIndex];
    if (!activePlayerId) return { type: 'none' };
    
    const playedCount = Number(gameState.heroPlayedCount[activePlayerId] || 0);
    if (playedCount < 2) {
      const heroCards = (botPlayer.hand || []).filter((c: Card) => c && c.type === 'hero');
      if (heroCards.length > 0) {
        // Prioritize hero with largest AR
        const sortedHeroes = [...heroCards].sort((a, b) => {
          const arA = getHeroStat(a.heroClass || '', 1, 'ar');
          const arB = getHeroStat(b.heroClass || '', 1, 'ar');
          return arB - arA;
        });
        const heroCard = sortedHeroes[0];
        
        // Find a free castle
        const playerCastles = gameState.map?.castles?.[playerIndex as 0 | 1] || [];
        let freeCastleIdx = 0;
        for (let i = 0; i < playerCastles.length; i++) {
          const cCoord = playerCastles[i];
          const pos = hexToPixel(cCoord.q, cCoord.r);
          const occupied = gameState.tokens.some(t => t && Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
          if (!occupied) {
            freeCastleIdx = i;
            break;
          }
        }
        
        return { type: 'play_card', payload: { cardId: heroCard.id, targetCastleIndex: freeCastleIdx } };
      }
    }
    return { type: 'none' };
  }

  private static decideActionPlayAction(gameState: GameState, playerIndex: number): BotAction {
    const availableTokens = (gameState.actionTokens || []).filter(t => t && t.playerIndex === playerIndex && !t.used);
    if (availableTokens.length > 0) {
      const token = availableTokens[Math.floor(Math.random() * availableTokens.length)];
      return { type: 'click_action_token', payload: { tokenId: token.id } };
    } else {
      return { type: 'pass_action' };
    }
  }

  private static decideActionCommonAction(gameState: GameState, playerIndex: number): BotAction {
    const goldY = playerIndex === 0 ? 550 : -700;
    const goldCounter = gameState.counters.find(c => c.type === 'gold' && Math.abs(c.y - goldY) < 100);
    const gold = goldCounter ? goldCounter.value : 0;
    
    if (gold >= 2) {
      return { type: 'select_common_action', payload: { action: 'hire' } };
    } else if (gold < 0) {
      return { type: 'select_common_action', payload: { action: 'early_buy' } };
    } else {
      return { type: 'select_common_action', payload: { action: 'seize_initiative' } };
    } 
  }

  private static decideActionSelectHeroAction(gameState: GameState, playerIndex: number): BotAction {
    const isPlayer1 = playerIndex === 0;
    const myHeroTokens = gameState.tokens.filter(t => {
      if (!t) return false;
      const c = gameState.tableCards.find(tc => tc && tc.id === t.boundToCardId);
      const isAlive = !gameState.counters.some(counter => counter && counter.type === 'time' && counter.boundToCardId === t.boundToCardId);
      const isCorrectPlayer = (isPlayer1 && c && c.y > 0) || (!isPlayer1 && c && c.y < 0);
      
      if (gameState.phase === 'action_select_substitute' && t.id === gameState.activeHeroTokenId) {
        return false;
      }
      
      return c && isAlive && isCorrectPlayer;
    });
    if (myHeroTokens.length > 0) {
      const heroToken = myHeroTokens[Math.floor(Math.random() * myHeroTokens.length)];
      return { type: 'select_hero_for_action', payload: { tokenId: heroToken.id } }; // Reuse click_action_token for select_hero
    }
    return { type: 'pass_action' };
  }

  private static getValidActiveSkills(gameState: GameState, playerIndex: number, heroesDatabase: any, heroTokenId: string) {
    const validSkills: any[] = [];
    const heroToken = gameState.tokens.find(t => t.id === heroTokenId);
    if (!heroToken) return validSkills;
    const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
    if (!heroCard) return validSkills;
    
    const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard.heroClass || h.id === heroCard.heroClass);
    if (!heroData) return validSkills;
    
    const levelData = heroData.levels[heroCard.level.toString() || '1'];
    const skills = levelData?.skills || [];
    
    for (const s of skills) {
      const skillId = s.id || s.name;
      const skillDef = skillRegistry.getSkill(skillId);
      if (skillDef && skillDef.kind === 'active') {
        const context = { gameState, playerIndex, sourceTokenId: heroTokenId };
        
        let canUse = true;
        if (skillDef.canUse) {
          const result = skillDef.canUse(context);
          if (typeof result === 'boolean') {
            canUse = result;
          } else {
            canUse = result.canUse;
          }
        }
        
        if (canUse && skillDef.getValidTargets) {
          const targets = skillDef.getValidTargets(context);
          if (targets.length === 0) {
            canUse = false;
          } else {
            // Predict if we would score it >= 0
            const reachableCells = targets.map(target => {
              if (typeof target === 'string') {
                if (target.startsWith('monster_') || target.startsWith('icepillar_') || target.startsWith('castle_')) {
                  const parts = target.split('_');
                  return { q: parseInt(parts[1]), r: parseInt(parts[2]) };
                }
                if (target.includes('_')) {
                  const parts = target.split('_');
                  return { q: parseInt(parts[0]), r: parseInt(parts[1]) };
                }
                const token = gameState.tokens.find((t: any) => t.id === target);
                if (token) return pixelToHex(token.x, token.y);
              } else if (typeof target === 'object' && 'q' in target) {
                return target;
              }
              return null;
            }).filter((h: any) => h !== null) as { q: number, r: number }[];

            if (reachableCells.length > 0) {
              const { bestScore } = this.getBestSkillTargetScore(gameState, playerIndex, skillId, reachableCells);
              if (bestScore < 0) {
                canUse = false; // AI thinks all targets are bad
              }
            } else {
              canUse = false;
            }
          }
        }
        
        if (canUse) {
          validSkills.push(skillId);
        }
      }
    }
    return validSkills;
  }

  private static decideActionSelectActionAction(gameState: GameState, playerIndex: number, heroesDatabase: any): BotAction {
    const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
    if (!heroToken) {
      return { type: 'pass_action' };
    }

    // Deep freeze check: if active action is deep freeze break, bot must break it
    if (gameState.phase === 'action_deep_freeze_break') {
      return { type: 'select_common_action', payload: { action: 'deep_freeze_break' } };
    }

    const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
    const ar = getHeroStat(heroCard?.heroClass || '', heroCard?.level || 1, 'ar');
    const hex = pixelToHex(heroToken.x, heroToken.y);
      
    const attackableCells = getAttackableHexes(
      hex.q,
      hex.r,
      ar,
      playerIndex,
      gameState,
      heroCard?.level || 1
    );

    // 1. Magic Circle Priority (Chant/Fire)
    const mc = (gameState.magicCircles || []).find(m => m && m.q === hex.q && m.r === hex.r);
    if (mc) {
      if (mc.state === 'idle') {
        return { type: 'select_hero_action', payload: { action: 'chant' } };
      } else if (mc.state === 'chanting' && mc.chantingTokenId === heroToken.id) {
        return { type: 'select_hero_action', payload: { action: 'fire' } };
      }
    }

    // 2. Active Skill Priority
    const validSkills = this.getValidActiveSkills(gameState, playerIndex, heroesDatabase, heroToken.id);
    // Add a 30% chance to skip skill and move/attack instead, to prevent AI from getting stuck spamming 0-cost skills
    if (validSkills.length > 0 && Math.random() > 0.3) {
      return { type: 'select_hero_action', payload: { action: 'skill' } };
    }
    
    // 2.5 Turret Attack Priority
    const turret = (gameState.map?.turrets || []).find(t => t.q === hex.q && t.r === hex.r);
    if (turret) {
      // If we can attack something from here, use turret_attack
      const turretAttackableCells = getAttackableHexes(
        hex.q,
        hex.r,
        ar, // Turret ignores ar
        playerIndex,
        gameState,
        heroCard?.level || 1,
        true
      );
      if (turretAttackableCells.length > 0) {
        return { type: 'select_hero_action', payload: { action: 'turret_attack' } };
      }
    }

    // 3. High-Value Attack Priority (Hero or Castle)
    const hasHighValueTarget = attackableCells.some(cell => cell.targetType === 'hero' || cell.targetType === 'castle');
    if (hasHighValueTarget) {
      return { type: 'select_hero_action', payload: { action: 'attack' } };
    }

    // 3. Evolution Priority
    if (heroCard && heroCard.level < 3) {
      const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === heroCard.id);
      const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard?.heroClass);
      const levelData = heroData?.levels?.[heroCard?.level || 1];
      const expNeeded = levelData?.xp;
      if (expCounter && typeof expNeeded === 'number' && expCounter.value >= expNeeded) {
        return { type: 'select_hero_action', payload: { action: 'evolve' } };
      }
    }

    // 4. Low-Value Attack (Monster)
    if (attackableCells.length > 0) {
      return { type: 'select_hero_action', payload: { action: 'attack' } };
    }

    // 5. Default to Move
    return { type: 'select_hero_action', payload: { action: 'move' } };
  }

  private static decideActionSelectSkillAction(gameState: GameState, playerIndex: number, heroesDatabase: any): BotAction {
    if (!gameState.activeHeroTokenId) {
      return { type: 'undo_play' };
    }
    const validSkills = this.getValidActiveSkills(gameState, playerIndex, heroesDatabase, gameState.activeHeroTokenId);
    
    if (validSkills.length > 0) {
      // Pick randomly to avoid getting stuck on the same valid skill
      const chosenSkillId = validSkills[Math.floor(Math.random() * validSkills.length)]; 
      
      const skillDef = skillRegistry.getSkill(chosenSkillId);
      if (skillDef?.targetType && skillDef.targetType !== 'none') {
        return { type: 'select_skill_target', payload: { skillId: chosenSkillId } };
      } else {
        return { type: 'use_skill', payload: { skillId: chosenSkillId } };
      }
    }
    return { type: 'undo_play' };
  }

  private static getBestSkillTargetScore(gameState: GameState, playerIndex: number, skillId: string, reachableCells: {q: number, r: number}[]): { bestTarget: { q: number, r: number }, bestScore: number } {
    const shuffledCells = [...reachableCells].sort(() => Math.random() - 0.5);
    let bestTarget = shuffledCells[0];
    let bestScore = -9999;

    for (const cell of shuffledCells) {
      let score = 0;
      const targetToken = gameState.tokens.find(t => {
        const tHex = pixelToHex(t.x, t.y);
        return tHex.q === cell.q && tHex.r === cell.r;
      });
      const isCastle0 = gameState.map?.castles?.[0]?.some(c => c.q === cell.q && c.r === cell.r);
      const isCastle1 = gameState.map?.castles?.[1]?.some(c => c.q === cell.q && c.r === cell.r);
      const monster = gameState.map?.monsters?.find((m: any) => m.q === cell.q && m.r === cell.r);

      const activeSkill = skillId;

      // 1. 冰法师：冰柱 (Ice Pillar)
      if (activeSkill === 'ice_pillar' && !targetToken && !monster && !isCastle0 && !isCastle1) {
          score += 10;
          let minEnemyHeroDist = 999;
          
          // 找到距离最近的敌人英雄
          gameState.tokens.forEach(t => {
              const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
              if (card) {
                const isEnemy = playerIndex === 0 ? card.y < 0 : card.y > 0;
                if (isEnemy) {
                    const dist = getHexDistance(cell, pixelToHex(t.x, t.y));
                    if (dist < minEnemyHeroDist) minEnemyHeroDist = dist;
                }
              }
          });

          if (minEnemyHeroDist === 1) score += 100; // 相邻敌方英雄，完美位置！
          else score -= 500; // 如果敌方英雄不在相邻位置，放冰柱意义不大，反而挡路

          // 如果场上冰柱数量已经达到或超过3个，降低再放冰柱的收益
          if (gameState.icePillars && gameState.icePillars.length >= 3) {
              score -= 150 * gameState.icePillars.length;
          }

          // 惩罚放在自己相邻的格子，坚决避免卡自己
          const activeHeroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
          if (activeHeroToken) {
              const myHex = pixelToHex(activeHeroToken.x, activeHeroToken.y);
              if (getHexDistance(cell, myHex) <= 1) {
                  score -= 1000;
              }
          }
      } 
      // 2. 治疗 (Heal) - 倾向给血量最少/残血队友回血
      else if (activeSkill === 'heal' || activeSkill === 'holy_prayer') {
          if (targetToken) {
              const tOwner = (targetToken as any).playerIndex || (targetToken as any).playerIdx;
              const isAlly = tOwner !== undefined ? tOwner === playerIndex : ((playerIndex === 0 && targetToken.y > 0) || (playerIndex === 1 && targetToken.y < 0));
              if (isAlly) {
                  score += 100;
                  // 根据损失血量加分，血越少分越高
                  const card = gameState.tableCards.find(c => c.id === targetToken.boundToCardId);
                  if (card) {
                      const maxHp = (targetToken as any).maxHp || 3; // roughly 3
                      score += (maxHp - (targetToken as any).hp) * 30;
                  }
              } else {
                  score -= 100; // 别奶敌人！
              }
          } else {
              score -= 50; 
          }
      }
      // 3. 通用攻击技能/普通攻击逻辑
      else if (targetToken) {
        const tOwner = (targetToken as any).playerIndex || (targetToken as any).playerIdx;
        const isEnemy = tOwner !== undefined ? tOwner !== playerIndex : ((playerIndex === 0 && targetToken.y < 0) || (playerIndex === 1 && targetToken.y > 0));
        if (isEnemy) {
          score += 100; 
          if (targetToken.heroClass) score += 50; 
          // 优先攻击残血，如果有机会击杀直接打满分
          if ((targetToken as any).hp <= 2) score += 40;
          if ((targetToken as any).hp === 1) score += 80;
        } else {
          score -= 100; 
        }
      } else if (monster) {
        score += 50;
        if ((monster as any).hp <= 2) score += 20; 
      } else if ((isCastle0 && playerIndex !== 0) || (isCastle1 && playerIndex !== 1)) {
        score += 80;
      } else {
        score += 5; // 如果技能必须打空地（比如闪现等）
        
        if (gameState.blizzardZones && gameState.blizzardZones.sourceHex.q === cell.q && gameState.blizzardZones.sourceHex.r === cell.r) {
          score -= 50;
        }
        if (gameState.emberZones?.some(e => e.q === cell.q && e.r === cell.r)) {
          score -= 50;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestTarget = cell;
      }
    }

    return { bestTarget, bestScore };
  }

  private static decideActionSelectSkillTargetAction(gameState: GameState, playerIndex: number): BotAction {
    if (!gameState.activeSkillId || !gameState.reachableCells || gameState.reachableCells.length === 0) {
      return { type: 'undo_play' };
    }

    const { bestTarget, bestScore } = this.getBestSkillTargetScore(gameState, playerIndex, gameState.activeSkillId, gameState.reachableCells);

    if (bestScore < 0) {
      return { type: 'undo_play' };
    }

    const hex = { q: bestTarget.q, r: bestTarget.r };

    let targetTokenId: string | undefined = undefined;

    // Simulate what the UI does in targetClickHandlers.ts
    const finalTargetToken = gameState.tokens.find(t => {
      const tHex = pixelToHex(t.x, t.y);
      return tHex.q === hex.q && tHex.r === hex.r;
    });

    const isFinalCastle0 = gameState.map?.castles?.[0]?.some(c => c.q === hex.q && c.r === hex.r);
    const isFinalCastle1 = gameState.map?.castles?.[1]?.some(c => c.q === hex.q && c.r === hex.r);
    const finalMonster = gameState.map?.monsters?.find((m: any) => m.q === hex.q && m.r === hex.r);

    if (finalTargetToken) {
      targetTokenId = finalTargetToken.id;
    } else if (finalMonster) {
      targetTokenId = `monster_${finalMonster.q}_${finalMonster.r}`;
    } else if (isFinalCastle0 || isFinalCastle1) {
      targetTokenId = `castle_${hex.q}_${hex.r}`;
    }

    return { 
      type: 'use_skill', 
      payload: { 
        skillId: gameState.activeSkillId, 
        targetTokenId, 
        targetHex: hex 
      } 
    };
  }

  private static decideActionResolveAction(gameState: GameState, playerIndex: number): BotAction {
    const isPlayer1 = playerIndex === 0;
    if (gameState.activeActionType === 'move') {
      const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
      if (heroToken && gameState.reachableCells && gameState.reachableCells.length > 0) {
        
        const card = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
        const isRanged = card && (card as any).ar !== undefined && (card as any).ar > 1;
        const attackRange = (card as any)?.ar || 1;
        const myCurrentHex = pixelToHex(heroToken.x, heroToken.y);

        // 获取所有敌人
        const enemyTokens = gameState.tokens.filter(t => { 
           const tOwner = (t as any).playerIndex !== undefined ? (t as any).playerIndex : (t as any).playerIdx;
           return tOwner !== undefined ? tOwner !== playerIndex : ((playerIndex === 0 && t.y < 0) || (playerIndex === 1 && t.y > 0));
        });
        const monsters = gameState.map?.monsters || [];
        const enemyCastles = gameState.map?.castles?.[1 - playerIndex as 0 | 1] || [];

        let bestCell = gameState.reachableCells[0];
        let bestScore = -9999;

        const idleMagicCircles = (gameState.magicCircles || []).filter(m => m && m.state === 'idle');

        for (const cell of gameState.reachableCells) {
            let score = 0;

            // --- 0. 魔法阵权重 ---
            // 如果踩在魔法阵上，是个好主意
            let minMagicCircleDist = 999;
            idleMagicCircles.forEach(mc => {
                const dist = getHexDistance(cell, {q: mc.q, r: mc.r});
                if (dist < minMagicCircleDist) minMagicCircleDist = dist;
            });
            
            if (minMagicCircleDist === 0) {
                score += 80; // 踩中魔法阵
            } else {
                score -= Math.min(minMagicCircleDist, 5) * 6; // 稍微引导往魔法阵走
            }

            // --- 1. 距离敌人的情况 ---
            let minEnemyDist = 999;
            enemyTokens.forEach(e => {
                if ((e as any).hp > 0) {
                    const dist = getHexDistance(cell, pixelToHex(e.x, e.y));
                    if (dist < minEnemyDist) minEnemyDist = dist;
                }
            });
            monsters.forEach(m => {
                const dist = getHexDistance(cell, {q: m.q, r: m.r});
                if (dist < minEnemyDist) minEnemyDist = dist;
            });
            let minCastleDist = 999;
            enemyCastles.forEach(c => {
                const dist = getHexDistance(cell, {q: c.q, r: c.r});
                if (dist < minCastleDist) minCastleDist = dist;
            });
            
            if (minEnemyDist === 999) minEnemyDist = minCastleDist; // 没有敌人时走向城堡

            if (isRanged) {
                // 远程职业放风筝逻辑：
                if (minEnemyDist === attackRange) score += 60;
                else if (minEnemyDist > attackRange) score -= minEnemyDist * 5; 
                else if (minEnemyDist < attackRange) score -= (attackRange - minEnemyDist) * 30; // 离太近了，严厉扣分，快跑！
            } else {
                // 近战职业追击逻辑：
                if (minEnemyDist === 1) score += 80; 
                else score -= (minEnemyDist * 10);
            }

            // --- 2. 避免危险地形（如果是法师要避开火/冰） ---
            if (gameState.blizzardZones && gameState.blizzardZones.sourceHex.q === cell.q && gameState.blizzardZones.sourceHex.r === cell.r) score -= 30;
            if (gameState.emberZones?.some(e => e.q === cell.q && e.r === cell.r)) score -= 30;

            // --- 3. 兜底推进：稍微倾向于往前走 ---
            const castleDistScore = (20 - minCastleDist); 
            score += (castleDistScore * 2);

            if (score > bestScore) {
                bestScore = score;
                bestCell = cell;
            }
        }

        if (getHexDistance({q: bestCell.q, r: bestCell.r}, myCurrentHex) === 0 && bestScore <= 0) {
            return { type: 'finish_action' }; // 不动
        }

        return { type: 'move_token_to_cell', payload: { tokenId: heroToken.id, q: bestCell.q, r: bestCell.r } };
      }
      return { type: 'finish_action' };
    }
 else if (gameState.activeActionType === 'attack') {
      if (gameState.reachableCells && gameState.reachableCells.length > 0) {
        let bestTargetId: string | null = null;
        let bestScore = -1;
        
        for (const cell of gameState.reachableCells) {
          let candidateTargetId: string | null = null;
          const score = this.getCellScore(cell);
          if (cell.targetType === 'hero') {
            const targetToken = gameState.tokens.find(t => {
              const tHex = pixelToHex(t.x, t.y);
              return tHex.q === cell.q && tHex.r === cell.r;
            });
            if (targetToken) {
              const targetCard = gameState.tableCards.find(tc => tc.id === targetToken.boundToCardId);
              if (targetCard) {
                candidateTargetId = targetCard.id;
              }
            }
          } else if (cell.targetType === 'castle') {
            candidateTargetId = `castle_${cell.q}_${cell.r}`;
          } else if (cell.targetType === 'monster') {
            candidateTargetId = `monster_${cell.q}_${cell.r}`;
          }
          if (candidateTargetId && score > bestScore) {
            bestScore = score;
            bestTargetId = candidateTargetId;
          }
        }
        
        if (bestTargetId) {
          return { type: 'select_target', payload: { targetId: bestTargetId } };
        }
      }
      return { type: 'finish_action' };
    } else if (gameState.activeActionType === 'chant') {
      // Chant target is self/current cell
      const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
      if (heroToken) {
        return { type: 'select_target', payload: { targetId: heroToken.id } };
      }
      return { type: 'finish_action' };
    } else if (gameState.activeActionType === 'fire') {
      if (gameState.reachableCells && gameState.reachableCells.length > 0) {
        const cell = gameState.reachableCells[0];
        return { type: 'select_target', payload: { targetId: `castle_${cell.q}_${cell.r}` } };
      }
      return { type: 'finish_action' };
    }
    return { type: 'finish_action' };
  }

  private static getCellScore(cell: any): number {
    if (cell.targetType === 'hero') return 100;
    if (cell.targetType === 'castle') return 90;
    if (cell.targetType === 'monster') return 80;
    return 10;
  }

  private static decideActionDefendAction(gameState: GameState, botPlayer: any, playerIndex: number): BotAction {
    const attackerToken = gameState.tokens.find(t => t && t.id === gameState.selectedTokenId);
    const defenderCard = gameState.tableCards.find(c => c && c.id === gameState.selectedTargetId);
    
    if (attackerToken && defenderCard) {
      const attackerCard = gameState.tableCards.find(c => c && c.id === attackerToken.boundToCardId);
      if (attackerCard) {
        const defenderMaxHP = getHeroStat(defenderCard.heroClass!, defenderCard.level, 'hp');
        const defenderHP = defenderMaxHP - (defenderCard.damage || 0);

        const hasDefenseInPlay = !!gameState.hasDefenseCard;
        const hasDefenseCardInPlay = gameState.pendingDefenseCardId ? gameState.playAreaCards?.find(c => c && c.id === gameState.pendingDefenseCardId) : null ;
        const hasDefenseInHand = botPlayer.hand?.some((c: Card) => c && c.name === '防御' );

        if (hasDefenseInPlay) {
          const defenderToken = gameState.tokens.find(t => t && t.boundToCardId === defenderCard.id);
          const isDefenseCard = hasDefenseCardInPlay?.name === '防御';
          const attackerHex = pixelToHex(attackerToken.x, attackerToken.y);
          const defenderHex = defenderToken ? pixelToHex(defenderToken.x, defenderToken.y) : null;
          const ar = getHeroStat(defenderCard.heroClass!, defenderCard.level, 'ar');

          // 修正逻辑: 只有在 defenderToken 存在、打出的防御牌名字是“防御”、
          // 且 gameState.canCounterAttack 为 true、且目标在反击范围内、且防御者存活时，才尝试反击。
          if (defenderToken && defenderHex && isDefenseCard && gameState.canCounterAttack === true && isTargetInAttackRange(defenderHex, attackerHex, ar, gameState) && defenderHP >= 1) {
            return { type: 'declare_counter'};
          } else {
            return { type: 'declare_defend'};
          }
        } else if (hasDefenseInHand) {
          const defenseCard = botPlayer.hand.find((c: Card) => c && c.name === '防御');
          if (defenseCard) {
            return { type: 'play_card', payload: { cardId: defenseCard.id } };
          }
        } else if (botPlayer.hand?.length > 0) {
          // Check for resolute
          let hasResolute = false;
          const defTok = gameState.tokens.find(t => t && t.boundToCardId === defenderCard.id);
          if (defTok?.heroClass) {
            const hData = HEROES_DATABASE.heroes.find(h => h.name === defTok.heroClass || h.id === defTok.heroClass);
            if (hData) {
               const lvData = hData.levels[defTok.lv.toString()];
               if (lvData?.skills?.some(s => s.id === 'resolute')) {
                 hasResolute = true;
               }
            }
          }
          if (hasResolute) {
            // Find the least useful card to discard
            const cardToDiscard = botPlayer.hand.find(c => c.type === 'action' && c.name !== '普通攻击') || botPlayer.hand[0];
            return { type: 'play_card', payload: { cardId: cardToDiscard.id } };
          }
        }
      }
    }
    return { type: 'pass_defend' };
  }

  private static decideShopAction(gameState: GameState, playerIndex: number): BotAction {
    const goldY = playerIndex === 0 ? 550 : -700;
    const goldCounter = gameState.counters.find(c => c && c.type === 'gold' && Math.abs(c.y - goldY) < 100);
    const gold = goldCounter ? goldCounter.value : 0;

    const playerCastles = gameState.map?.castles?.[playerIndex as 0 | 1] || [];
    let freeCastleIdx = -1;
    for (let i = 0; i < playerCastles.length; i++) {
      const cCoord = playerCastles[i];
      const pos = hexToPixel(cCoord.q, cCoord.r);
      const occupied = gameState.tokens.some(t => t && Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
      if (!occupied) {
        freeCastleIdx = i;
        break;
      }
    }
        
    const myHeroes = gameState.tableCards.filter(c =>
      c && c.type === 'hero' && ((playerIndex === 0 && c.y > 0) || (playerIndex === 1 && c.y < 0))
    );
    if (
      freeCastleIdx !== -1 &&
      gold >= 2 &&
      (gameState.hireAreaCards?.length || 0) > 0 &&
      myHeroes.length < 4
    ) {
      return { type: 'start_hire' };
    }

    return { type: 'pass_shop' };
  }

  private static decideHireAction(gameState: GameState, playerIndex: number): BotAction {
    const playerCastles = gameState.map?.castles?.[playerIndex as 0 | 1] || [];
    let freeCastleIdx = -1;
    for (let i = 0; i < playerCastles.length; i++) {
      const cCoord = playerCastles[i];
      const pos = hexToPixel(cCoord.q, cCoord.r);
      const occupied = gameState.tokens.some(t => t && Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
      if (!occupied) {
        freeCastleIdx = i;
        break;
      }
    }
        
    if (gameState.phase === 'hire') {
      if (!gameState.selectedHireCost) {
          return { type: 'select_hire_cost', payload: { cost: 2 } };
      }
      if (gameState.selectedHireCastle == null) {
        return { type: 'select_hire_castle', payload: { castle: freeCastleIdx } };
      }
      if (!gameState.selectedTargetId && (gameState.hireAreaCards?.length || 0) > 0) {
        return { type: 'select_target', payload: { targetId: gameState.hireAreaCards[0].id } };
      }
      if (gameState.selectedHireCost != null && gameState.selectedTargetId && gameState.selectedHireCastle != null) {
        return {
          type: 'hire_hero',
          payload: {
            cardId: gameState.selectedTargetId,
            goldAmount: gameState.selectedHireCost,
            targetCastleIndex: gameState.selectedHireCastle
          }
        };
      }
    }

    return { type: 'pass_shop' };
  }  

  private static getCardValueForDiscard(card: Card, gameState: GameState, playerIndex: number): number {
    if (!card) return 0;
    if (card.name === '防御') return 100; // Never want to discard Defense
    if (card.type === 'hero') {
      const myHeroesCount = gameState.tableCards.filter(c => c && c.type === 'hero' && ((playerIndex === 0 && c.y > 0) || (playerIndex === 1 && c.y < 0))).length;
      if (myHeroesCount >= 4) return 5; // Low value if table is full
      return 60; // Still useful to hire
    }
    if (card.name === '强击') return 80;
    if (card.name === '回复' || card.name === '治疗药水') return 70;
    if (card.name === '冲刺' || card.name === '冲刺卷轴') return 60;
    if (card.name === '间谍') return 50;
    if (card.name === '远攻' || card.name === '远程战术') return 40;
    if (card.name === '替身') return 30;
    return 20;
  }

  private static decideDiscardAction(gameState: GameState, botPlayer: any): BotAction {
    if (botPlayer.hand && botPlayer.hand.length > 5) {
      const playerIndex = gameState.seats.indexOf(botPlayer.id);
      const sortedHand = [...botPlayer.hand].sort((a, b) => this.getCardValueForDiscard(a, gameState, playerIndex) - this.getCardValueForDiscard(b, gameState, playerIndex));
      return { type: 'discard_card', payload: { cardId: sortedHand[0].id } };
    } else {
      return { type: 'finish_discard' };
    }
  }

  private static calculateAttackableCells(token: Token, ar: number, gameState: GameState): any[] {
    const attackerHex = pixelToHex(token.x, token.y);
    const targets: any[] = [];
    
    // Check enemy heroes
    gameState.tokens.forEach(t => {
      if (t.id === token.id) return;
      const targetCard = gameState.tableCards.find(c => c.id === t.boundToCardId);
      if (!targetCard || targetCard.type !== 'hero') return;
      
      // Check if enemy
      const isAttackerP1 = token.y > 0;
      const isTargetP1 = t.y > 0;
      if (isAttackerP1 === isTargetP1) return;
      
      const targetHex = pixelToHex(t.x, t.y);
      if (isTargetInAttackRange(attackerHex, targetHex, ar, gameState)) {
        targets.push({ targetType: 'hero', tokenId: t.id, targetId: targetCard.id });
      }
    });
    
    // Check enemy castles
    const enemyIndex = token.y > 0 ? 1 : 0;
    const enemyCastles = gameState.map?.castles[enemyIndex as 0 | 1] || [];
    enemyCastles.forEach((cCoord, idx) => {
      if (isTargetInAttackRange(attackerHex, cCoord, ar, gameState)) {
        targets.push({ targetType: 'castle', castleIndex: idx });
      }
    });
    
    return targets;
  }

  private static evaluateEnhancement(cardName: string | undefined | null, gameState: GameState, playerIndex: number, heroToken: any, heroCard: any): number {
    if (!cardName) return -1;
    if (cardName === '回复' || cardName === '治疗药水') {
      return (heroCard && heroCard.damage && heroCard.damage > 0) ? 100 : -1;
    }
    if (cardName === '间谍') {
      const opponentId = gameState.seats?.[1 - playerIndex];
      const opponent = opponentId ? gameState.players[opponentId] : null;
      return (opponent && opponent.hand && opponent.hand.length > 0) ? 80 : -1;
    }
    if (cardName === '强击') return 60;
    if (cardName === '冲刺' || cardName === '冲刺卷轴') return 50;
    if (cardName === '远攻' || cardName === '远程战术') return 40;
    if (cardName === '替身') return (heroCard && heroCard.damage && heroCard.damage >= 2) ? 70 : 10;
    return 20;
  }

  private static decideActionOptionsAction(gameState: GameState, botPlayer: any, playerIndex: number): BotAction {
    const heroToken = gameState.tokens.find(t => t && t.id === gameState.activeHeroTokenId);
    const heroCard = heroToken ? gameState.tableCards.find(c => c && c.id === heroToken.boundToCardId) : null;
    
    const enhancementCards = (botPlayer.hand || []).filter((c: Card) => c && isEnhancementCardName(c.name));
    
    let bestScore = -1;
    for (const card of enhancementCards) {
      const score = this.evaluateEnhancement(card.name, gameState, playerIndex, heroToken, heroCard);
      if (score > bestScore) {
        bestScore = score;
      }
    }
    
    if (bestScore > 0) {
      return { type: 'select_action_category', payload: { category: 'play_card' } };
    }
    return { type: 'select_action_category', payload: { category: 'direct_action' } };
  }

  private static decideActionPlayEnhancementAction(gameState: GameState, botPlayer: any, playerIndex: number): BotAction {
    const heroToken = gameState.tokens.find(t => t && t.id === gameState.activeHeroTokenId);
    const heroCard = heroToken ? gameState.tableCards.find(c => c && c.id === heroToken.boundToCardId) : null;
    
    const enhancementCards = (botPlayer.hand || []).filter((c: Card) => c && isEnhancementCardName(c.name));
    
    let bestScore = -1;
    let bestCard = null;
    for (const card of enhancementCards) {
      const score = this.evaluateEnhancement(card.name, gameState, playerIndex, heroToken, heroCard);
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }
    
    if (bestCard && bestScore > 0) {
      return { type: 'play_card', payload: { cardId: bestCard.id } };
    }
    return { type: 'pass_action' };
  }
}
