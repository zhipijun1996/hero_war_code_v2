import { GameState, Card, TableCard, Token, HexCoord, ActionToken } from '../../shared/types/index.ts';
import { pixelToHex, hexToPixel, generateId, getHexDistance } from '../../shared/utils/hexUtils.ts';
import { getHeroStat } from '../hero/heroLogic.ts';
import { isTargetInAttackRange, getReachableHexes, getAttackableHexes } from '../map/mapLogic.ts';
import { canHeroEvolve } from '../hero/heroLogic.ts';
import { isEnhancementCardName } from '../card/enhancementModifiers.ts';
import { skillRegistry } from '../skills/skillRegistry.ts';

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

  private static decideActionSelectSkillTargetAction(gameState: GameState, playerIndex: number): BotAction {
    if (!gameState.activeSkillId || !gameState.reachableCells || gameState.reachableCells.length === 0) {
      return { type: 'undo_play' };
    }

    // Simple target value scoring to pick the best skill target, with random shuffle for tie-breaking
    const shuffledCells = [...gameState.reachableCells].sort(() => Math.random() - 0.5);
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

      if (targetToken) {
        const tOwner = (targetToken as any).playerIndex || (targetToken as any).playerIdx;
        const isEnemy = tOwner !== undefined ? tOwner !== playerIndex : ((playerIndex === 0 && targetToken.y < 0) || (playerIndex === 1 && targetToken.y > 0));
        if (isEnemy) {
          score += 100; // Found enemy unit
          if (targetToken.heroClass) score += 50; // Priority to heroes
        } else {
          score -= 100; // Found ally unit (avoid friendly fire, though heals would reverse this logic)
        }
      } else if (monster) {
        score += 50; // Found monster
      } else if ((isCastle0 && playerIndex !== 0) || (isCastle1 && playerIndex !== 1)) {
        score += 80; // Enemy castle
      } else {
        score += 10; // Empty hex
        
        // Ice Mage's blizzard penalty for already-frozen hexes
        if (gameState.blizzardZones && gameState.blizzardZones.sourceHex.q === cell.q && gameState.blizzardZones.sourceHex.r === cell.r) {
          score -= 50;
        }
        // Fire Mage's ember zone penalty for existing ember hexes
        if (gameState.emberZones?.some(e => e.q === cell.q && e.r === cell.r)) {
          score -= 50;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestTarget = cell;
      }
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
        // Find target: nearest idle magic circle or enemy castle
        const idleMagicCircles = (gameState.magicCircles || []).filter(m => m && m.state === 'idle');
        const enemyIndex = 1 - playerIndex;
        const enemyCastles = gameState.map?.castles?.[enemyIndex as 0 | 1] || [];
        let targetPos = enemyCastles.length > 0 ? { q: enemyCastles[0].q, r: enemyCastles[0].r } : (isPlayer1 ? { q: 0, r: -4 } : { q: 0, r: 4 }); // Default to enemy castle
        
        if (idleMagicCircles.length > 0) {
          const currentHex = pixelToHex(heroToken.x, heroToken.y);
          let nearestMC = idleMagicCircles[0];
          let minMCdist = getHexDistance(currentHex, { q: nearestMC.q, r: nearestMC.r });
          for (const mc of idleMagicCircles) {
            const d = getHexDistance(currentHex, { q: mc.q, r: mc.r });
            if (d < minMCdist) {
              minMCdist = d;
              nearestMC = mc;
            }
          }
          targetPos = { q: nearestMC.q, r: nearestMC.r };
        }

        let bestCell = gameState.reachableCells[0];
        let minDist = getHexDistance({ q: bestCell.q, r: bestCell.r }, targetPos);
        for (const cell of gameState.reachableCells) {
          const d = getHexDistance({ q: cell.q, r: cell.r }, targetPos);
          if (d < minDist) {
            minDist = d;
            bestCell = cell;
          }
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

  private static decideDiscardAction(gameState: GameState, botPlayer: any): BotAction {
    if (botPlayer.hand.length > 5) {
      const cardToDiscard = botPlayer.hand[Math.floor(Math.random() * botPlayer.hand.length)];
      return { type: 'discard_card', payload: { cardId: cardToDiscard.id } };
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

  private static decideActionOptionsAction(gameState: GameState, botPlayer: any, playerIndex: number): BotAction {
    // If we have enhancement cards, we might want to play them
    const enhancementCards = (botPlayer.hand || []).filter((c: Card) => isEnhancementCardName(c.name));
    if (enhancementCards.length > 0) {
      // For now, let's just always try to play an enhancement if we have one
      return { type: 'select_action_category', payload: { category: 'play_card' } };
    }
    return { type: 'select_action_category', payload: { category: 'direct_action' } };
  }

  private static decideActionPlayEnhancementAction(gameState: GameState, botPlayer: any, playerIndex: number): BotAction {
    const enhancementCards = (botPlayer.hand || []).filter((c: Card) => isEnhancementCardName(c.name));
    if (enhancementCards.length > 0) {
      // Pick the first one for now
      return { type: 'play_card', payload: { cardId: enhancementCards[0].id } };
    }
    return { type: 'pass_action' };
  }
}
