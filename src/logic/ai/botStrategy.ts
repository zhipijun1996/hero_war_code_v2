import { GameState, Card, TableCard, Token, HexCoord, ActionToken } from '../../shared/types';
import { pixelToHex, hexToPixel, generateId, getHexDistance } from '../../shared/utils/hexUtils';
import { getHeroStat } from '../hero/heroLogic';
import { isTargetInAttackRange, getReachableHexes, getAttackableHexes } from '../map/mapLogic';

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
  | { type: 'select_option'; payload: { option: string } }
  | { type: 'select_target'; payload: { targetId: string } }
  | { type: 'pass_action' }
  | { type: 'select_hire_cost'; payload: { cost: number } }
  | { type: 'next_shop' }
  | { type: 'pass_shop' }  
  | { type: 'finish_action'}
  | { type: 'discard_card'; payload: { cardId: string } }
  | { type: 'finish_discard' }
  | { type: 'declare_defend' }
  | { type: 'declare_counter' }
  | { type: 'pass_defend' }  
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

      case 'action_select_option':
        return this.decideActionSelectOptionAction(gameState, playerIndex, heroesDatabase);

      case 'action_select_category':
      case 'action_options':
        return { type: 'select_action_category', payload: { category: 'direct_action' } };

      case 'action_common':
        return this.decideActionCommonAction(gameState, playerIndex);

      case 'action_select_hero':
      case 'action_select_substitute':
        return this.decideActionSelectHeroAction(gameState, playerIndex);

      case 'action_select_action':
        return this.decideActionSelectActionAction(gameState, playerIndex);

      case 'action_play_enhancement':
        return { type: 'pass_action' };

      case 'action_resolve':
        return this.decideActionResolveAction(gameState, playerIndex);

      case 'action_defend':
        return this.decideActionDefendAction(gameState, botPlayer, playerIndex);

      case 'action_play_defense':
        return this.decideActionPlayDefenseAction(gameState, botPlayer, playerIndex);

      case 'action_play_counter':
        return this.decideActionPlayCounterAction(gameState, botPlayer, playerIndex);

      case 'action_resolve_attack':
      case 'action_resolve_attack_counter':
      case 'action_resolve_counter':
        return { type: 'finish_action' };

      case 'shop':
        return this.decideShopAction(gameState, playerIndex);

      case 'discard':
        return this.decideDiscardAction(gameState, botPlayer);

      case 'revival':
        return this.decideRevivalAction(gameState, playerIndex);

      case 'supply':
      case 'end':
        return { type: 'none' };

      default:
        return { type: 'none' };
    }
  }

  private static decideRevivalAction(gameState: GameState, playerIndex: number): BotAction {
    const pending = gameState.pendingRevivals?.find(r => r.playerIndex === playerIndex);
    if (pending) {
      const playerCastles = gameState.map?.castles?.[playerIndex as 0 | 1] || [];
      let freeCastleIdx = -1;
      for (let i = 0; i < playerCastles.length; i++) {
        const pos = hexToPixel(playerCastles[i].q, playerCastles[i].r);
        const occupied = gameState.tokens.some(t => Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
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
    const availableTokens = gameState.actionTokens.filter(t => t.playerIndex === playerIndex && !t.used);
    if (availableTokens.length > 0) {
      const token = availableTokens[Math.floor(Math.random() * availableTokens.length)];
      return { type: 'click_action_token', payload: { tokenId: token.id } };
    } else {
      return { type: 'pass_action' };
    }
  }

  private static decideActionSelectOptionAction(gameState: GameState, playerIndex: number, heroesDatabase: any): BotAction {
    const isPlayer1 = playerIndex === 0;
    if (gameState.selectedOption) {
      const option = gameState.selectedOption;
      if (option === 'heal') {
        const myHeros = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (!isPlayer1 && c.y < 0)) && (c.damage || 0) > 0);
        if (myHeros.length > 0) {
          return { type: 'select_target', payload: { targetId: myHeros[0].id } };
        } else {
          return { type: 'finish_action' };
        }
      } else if (option === 'evolve') {
        const myHeros = gameState.tableCards.filter(c => {
          if (c.type !== 'hero' || !((isPlayer1 && c.y > 0) || (!isPlayer1 && c.y < 0))) return false;
          const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === c.heroClass);
          const levelData = heroData?.levels?.[c.level || 1];
          const expNeeded = levelData?.xp;
          const expCounter = gameState.counters.find(cnt => cnt.type === 'exp' && cnt.boundToCardId === c.id);
          return expCounter && typeof expNeeded === 'number' && expNeeded > 0 && expCounter.value >= expNeeded;
        });
        if (myHeros.length > 0) {
          return { type: 'select_target', payload: { targetId: myHeros[0].id } };
        } else {
          return { type: 'finish_action' };
        }
      } else if (option === 'buy') {
        if (gameState.decks.treasure1.length > 0) {
          return { type: 'select_option', payload: { option: 'treasure1' } };
        } else if (gameState.decks.treasure2.length > 0) {
          return { type: 'select_option', payload: { option: 'treasure2' } };
        } else if (gameState.decks.treasure3.length > 0) {
          return { type: 'select_option', payload: { option: 'treasure3' } };
        } else {
          return { type: 'finish_action' };
        }
      } else if (option === 'hire') {
        if (gameState.hireAreaCards.length > 0) {
          return { type: 'select_target', payload: { targetId: gameState.hireAreaCards[0].id } };
        } else {
          return { type: 'finish_action' };
        }
      }
    } else {
      const lastCard = gameState.playAreaCards[gameState.playAreaCards.length - 1];
      if (lastCard) {
        if (lastCard.name === '回复' || lastCard.name === '治疗药水') {
          return { type: 'select_option', payload: { option: 'heal' } };
        } else if (lastCard.name === '进化') {
          return { type: 'select_option', payload: { option: 'evolve' } };
        } else if (lastCard.name === '雇佣') {
          return { type: 'select_option', payload: { option: 'hire' } };
        } else if (lastCard.name === '间谍') {
          return { type: 'select_option', payload: { option: 'spy' } };
        } else if (lastCard.name === '抢先手') {
          return { type: 'select_option', payload: { option: 'seize' } };
        }
      } else if (gameState.activeActionTokenId) {
        const myHerosWithDamage = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (!isPlayer1 && c.y < 0)) && (c.damage || 0) > 0);
        if (myHerosWithDamage.length > 0) {
          return { type: 'select_option', payload: { option: 'heal' } };
        } else if (gameState.canEvolve) {
          return { type: 'select_option', payload: { option: 'evolve' } };
        } else {
          return { type: 'select_option', payload: { option: 'spy' } };
        }
      }
    }
    return { type: 'finish_action' };
  }

  private static decideActionCommonAction(gameState: GameState, playerIndex: number): BotAction {
    const activePlayerId = gameState.seats[playerIndex];
    const goldCounter = gameState.counters.find(c => c.type === 'gold' && c.boundToCardId === activePlayerId);
    const gold = goldCounter ? goldCounter.value : 0;
    
    if (gold >= 2) {
      return { type: 'select_common_action', payload: { action: 'recruit' } };
    } else if (gold > 0) {
      return { type: 'select_common_action', payload: { action: 'early_buy' } };
    } else {
      return { type: 'select_common_action', payload: { action: 'seize_initiative' } };
    }
  }

  private static decideActionSelectHeroAction(gameState: GameState, playerIndex: number): BotAction {
    const isPlayer1 = playerIndex === 0;
    const myHeroTokens = gameState.tokens.filter(t => {
      const c = gameState.tableCards.find(tc => tc.id === t.boundToCardId);
      const isAlive = !gameState.counters.some(counter => counter.type === 'time' && counter.boundToCardId === t.boundToCardId);
      return c && isAlive && ((isPlayer1 && c.y > 0) || (!isPlayer1 && c.y < 0));
    });
    if (myHeroTokens.length > 0) {
      const heroToken = myHeroTokens[Math.floor(Math.random() * myHeroTokens.length)];
      return { type: 'select_hero_for_action', payload: { tokenId: heroToken.id } }; // Reuse click_action_token for select_hero
    }
    return { type: 'pass_action' };
  }

  private static decideActionSelectActionAction(gameState: GameState, playerIndex: number): BotAction {
    const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
    if (!heroToken) {
      return { type: 'pass_action' };
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
    if (attackableCells.length > 0) {
      return { type: 'select_hero_action', payload: { action: 'attack' } };
    } 
    return { type: 'select_hero_action', payload: { action: 'move' } };
  }

  private static decideActionResolveAction(gameState: GameState, playerIndex: number): BotAction {
    const isPlayer1 = playerIndex === 0;
    if (gameState.activeActionType === 'move') {
      const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
      if (heroToken && gameState.reachableCells && gameState.reachableCells.length > 0) {
        // Try to move towards enemy castle
        const enemyCastle = isPlayer1 ? { q: 0, r: -4 } : { q: 0, r: 4 };
        let bestCell = gameState.reachableCells[0];
        let minDist = getHexDistance({ q: bestCell.q, r: bestCell.r }, { q: enemyCastle.q, r: enemyCastle.r });
        for (const cell of gameState.reachableCells) {
          const d = getHexDistance({ q: cell.q, r: cell.r }, { q: enemyCastle.q, r: enemyCastle.r });
          if (d < minDist) {
            minDist = d;
            bestCell = cell;
          }
        }
        return { type: 'move_token_to_cell', payload: { tokenId: heroToken.id, q: bestCell.q, r: bestCell.r } };
      }
      return { type: 'finish_action' };
    } else if (gameState.activeActionType === 'attack') {
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
    }
    return { type: 'finish_action' };
  }

  private static decideActionPlayDefenseAction(gameState: GameState, botPlayer: any, playerIndex: number): BotAction {
    const defenseCard = botPlayer.hand.find((c: Card) => c.name === '防御' || c.name === '闪避');
    if (defenseCard) {
      return { type: 'play_card', payload: { cardId: defenseCard.id } };
    }
    return { type: 'none' };
  }

  private static decideActionPlayCounterAction(gameState: GameState, botPlayer: any, playerIndex: number): BotAction {
    const counterCard = botPlayer.hand.find((c: Card) => c.name === '行动' || c.name === '强击');
    if (counterCard) {
      return { type: 'play_card', payload: { cardId: counterCard.id } };
    }
    return { type: 'none' };
  }

  private static getCellScore(cell: any): number {
    if (cell.targetType === 'hero') return 100;
    if (cell.targetType === 'castle') return 90;
    if (cell.targetType === 'monster') return 80;
    return 10;
  }

  private static decideActionDefendAction(gameState: GameState, botPlayer: any, playerIndex: number): BotAction {
    const isPlayer1 = playerIndex === 0;
    const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
    const defenderCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
    
    if (attackerToken && defenderCard) {
      const attackerCard = gameState.tableCards.find(c => c.id === attackerToken.boundToCardId);
      if (attackerCard) {
        const defenderMaxHP = getHeroStat(defenderCard.heroClass!, defenderCard.level, 'hp');
        const defenderHP = defenderMaxHP - (defenderCard.damage || 0);

        const hasDefenseInPlay = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
        const hasDefenseCardInPlay = gameState.playAreaCards.find(c => c.name === '防御' || c.name === '闪避');
        const hasDefenseInHand = botPlayer.hand.some((c: Card) => c.name === '防御' || c.name === '闪避');

        if (hasDefenseInPlay) {
          const defenderToken = gameState.tokens.find(t => t.boundToCardId === defenderCard.id);
          if (defenderToken && hasDefenseCardInPlay?.name === '防御') {
            const attackerHex = pixelToHex(attackerToken.x, attackerToken.y);
            const defenderHex = pixelToHex(defenderToken.x, defenderToken.y);
            const ar = getHeroStat(defenderCard.heroClass!, defenderCard.level, 'ar');
            
            if (isTargetInAttackRange(defenderHex, attackerHex, ar, gameState) && defenderHP >= 1) {
              return { type: 'declare_counter'};
            }
          }
          return { type: 'declare_defend'};
        } else if (hasDefenseInHand) {
          const defenseCard = botPlayer.hand.find((c: Card) => c.name === '防御' || c.name === '闪避');
          return { type: 'play_card', payload: { cardId: defenseCard.id } };
        }
      }
    }
    return { type: 'pass_defend' };
  }

  private static decideShopAction(gameState: GameState, playerIndex: number): BotAction {
    const activePlayerId = gameState.seats[playerIndex];
    if (!activePlayerId) return { type: 'pass_shop' };
    const player = gameState.players[activePlayerId];
    if (!player) return { type: 'pass_shop' };
    const goldCounter = gameState.counters.find(
      c => c.type === 'gold' && c.boundToCardId === activePlayerId
    );
    const gold = goldCounter ? goldCounter.value : 0;

    const playerCastles = gameState.map!.castles[playerIndex as 0 | 1];
    let freeCastleIdx = -1;
    for (let i = 0; i < playerCastles.length; i++) {
      const cCoord = playerCastles[i];
      const pos = hexToPixel(cCoord.q, cCoord.r);
      const occupied = gameState.tokens.some(t => Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
      if (!occupied) {
        freeCastleIdx = i;
        break;
      }
    }
       
    if (gameState.selectedOption === 'hire') {
      if (!gameState.selectedHireCost) {
        return { type: 'select_hire_cost', payload: { cost: 2 } };
      }
      if (!gameState.selectedTargetId && gameState.hireAreaCards.length > 0) {
        return { type: 'select_target', payload: { targetId: gameState.hireAreaCards[0].id } };
      }
      if (gameState.selectedHireCost && gameState.selectedTargetId && freeCastleIdx !== -1) {
        return {
          type: 'hire_hero',
          payload: {
            cardId: gameState.selectedTargetId,
            goldAmount: gameState.selectedHireCost,
            targetCastleIndex: freeCastleIdx
          }
        };
      }
    }

    if (
      freeCastleIdx !== -1 &&
      gold >= 2 &&
      gameState.hireAreaCards.length > 0
    ) {
      return { type: 'select_option', payload: { option: 'hire' } };
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
}
