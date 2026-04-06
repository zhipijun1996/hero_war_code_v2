import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionEngine } from '../action/actionEngine';
import { HeroEngine } from '../hero/heroEngine';
import { CombatLogic } from '../combat/combatLogic';
import { createMockGameState, createMockActionHelpers } from './testState';
import { hexToPixel } from '../../shared/utils/hexUtils';

describe('Game Engine Core Operations', () => {
  let gameState: any;
  let helpers: any;

  beforeEach(() => {
    gameState = createMockGameState();
    helpers = createMockActionHelpers();
    // Mock alignHireArea for HeroEngine.hireHero
    helpers.alignHireArea = vi.fn();
  });

  describe('Hiring', () => {
    it('should hire a hero from the hire area', () => {
      const playerIndex = 0;
      const cardId = 'hero-card-1';
      
      gameState.phase = 'shop';
      gameState.activePlayerIndex = playerIndex;
      gameState.hireAreaCards = [{
        id: cardId,
        type: 'hero',
        heroClass: '战士', 
        level: 1,
        cost: 5,
        frontImage: '',
        backImage: '',
        faceUp: true
      }];
      gameState.map.castles[0] = [{ q: -5, r: 0 }];
      
      // Setup gold counter
      gameState.counters = [{
        id: 'gold-0',
        type: 'gold',
        x: -150,
        y: 550,
        value: 10
      }];

      const result = HeroEngine.hireHero(gameState, playerIndex, cardId, 5, 0, helpers);

      expect(result.success).toBe(true);
      expect(gameState.tokens.length).toBe(1);
      expect(gameState.tokens[0].heroClass).toBe('战士');
      expect(gameState.hireAreaCards.length).toBe(0);
      expect(gameState.counters[0].value).toBe(5);
    });
  });

  describe('Combat', () => {
    it('should resolve an attack and apply damage', () => {
      const playerIndex = 0;
      const attackerId = 'attacker-token';
      const targetCardId = 'target-card';
      
      gameState.tokens = [
        { id: attackerId, x: 0, y: 0, boundToCardId: 'attacker-card', heroClass: 'Warrior' },
        { id: 'target-token', x: 100, y: 0, boundToCardId: targetCardId, heroClass: 'Mage' }
      ];
      gameState.tableCards = [
        { id: 'attacker-card', heroClass: 'Warrior', level: 1, damage: 0 },
        { id: targetCardId, heroClass: 'Mage', level: 1, damage: 0 }
      ];
      gameState.selectedTokenId = attackerId;
      gameState.selectedTargetId = targetCardId;
      gameState.activePlayerIndex = playerIndex;

      // Mock calculateDamage to return a fixed value
      vi.spyOn(CombatLogic, 'calculateDamage').mockReturnValue(2);

      CombatLogic.resolveAttack(gameState, playerIndex, helpers);

      const targetCard = gameState.tableCards.find(c => c.id === targetCardId);
      expect(targetCard.damage).toBe(2);
      expect(helpers.addLog).toHaveBeenCalledWith(expect.stringContaining('造成了 2 点伤害'), playerIndex);
    });

    it('should resolve a counter-attack', () => {
      const playerIndex = 0;
      const attackerId = 'attacker-token';
      const targetCardId = 'target-card';
      
      gameState.tokens = [
        { id: attackerId, x: 0, y: 0, boundToCardId: 'attacker-card', heroClass: 'Warrior' },
        { id: 'target-token', x: 100, y: 0, boundToCardId: targetCardId, heroClass: 'Mage' }
      ];
      gameState.tableCards = [
        { id: 'attacker-card', heroClass: 'Warrior', level: 1, damage: 0 },
        { id: targetCardId, heroClass: 'Mage', level: 1, damage: 0 }
      ];
      gameState.selectedTokenId = attackerId;
      gameState.selectedTargetId = targetCardId;
      gameState.activePlayerIndex = playerIndex;

      vi.spyOn(CombatLogic, 'calculateDamage').mockReturnValue(1);

      CombatLogic.resolveCounterAttack(gameState, 1 - playerIndex, helpers);

      const attackerCard = gameState.tableCards.find(c => c.id === 'attacker-card');
      expect(attackerCard.damage).toBe(1);
      expect(helpers.addLog).toHaveBeenCalledWith(expect.stringContaining('进行了反击'), 1 - playerIndex);
    });

    it('should handle defense with a card', () => {
      const playerIndex = 0;
      const attackerId = 'attacker-token';
      const targetCardId = 'target-card';
      
      gameState.tokens = [
        { id: attackerId, x: 0, y: 0, boundToCardId: 'attacker-card', heroClass: 'Warrior' },
        { id: 'target-token', x: 100, y: 0, boundToCardId: targetCardId, heroClass: 'Mage' }
      ];
      gameState.tableCards = [
        { id: 'attacker-card', heroClass: 'Warrior', level: 1, damage: 0 },
        { id: targetCardId, heroClass: 'Mage', level: 1, damage: 0 }
      ];
      gameState.selectedTokenId = attackerId;
      gameState.selectedTargetId = targetCardId;
      gameState.activePlayerIndex = playerIndex;
      gameState.isDefended = true;
      gameState.lastPlayedCardId = 'defense-card-id';
      gameState.playAreaCards = [{ id: 'defense-card-id', name: 'Shield' }];

      CombatLogic.resolveAttack(gameState, playerIndex, helpers);

      const targetCard = gameState.tableCards.find(c => c.id === targetCardId);
      expect(targetCard.damage).toBe(0);
      expect(helpers.addLog).toHaveBeenCalledWith(expect.stringContaining('攻击被抵消'), 1 - playerIndex);
    });
  });

  describe('Evolution', () => {
    it('should evolve a hero when enough exp is gained', () => {
      const playerIndex = 0;
      const tokenId = 'hero-token';
      const cardId = 'hero-card';
      
      gameState.tokens = [{ id: tokenId, x: 0, y: 0, boundToCardId: cardId, heroClass: '战士', lv: 1 }];
      gameState.tableCards = [{ id: cardId, heroClass: '战士', level: 1, damage: 0 }];
      gameState.counters = [{ id: 'exp-counter', type: 'exp', boundToCardId: cardId, value: 5 }];
      gameState.selectedTokenId = tokenId;
      gameState.activeHeroTokenId = tokenId;
      gameState.activeActionType = 'evolve';
      gameState.activePlayerIndex = playerIndex;

      // Mock finishAction to avoid side effects
      vi.spyOn(ActionEngine, 'finishAction').mockImplementation(async () => {});

      ActionEngine.resolveActionStart(gameState, playerIndex, helpers, {});

      const heroCard = gameState.tableCards[0];
      const heroToken = gameState.tokens[0];
      expect(heroCard.level).toBe(2);
      expect(heroToken.lv).toBe(2);
      expect(gameState.counters[0].value).toBe(3); // 5 - 2 = 3
    });
  });
});
