import { GameState, TableCard, Token } from '../../shared/types';
import { getHeroStat } from '../hero/heroLogic';
import { getAttackDamageBonusFromEnhancement } from '../card/enhancementModifiers';
import { HEROES_DATABASE } from '../../shared/config/heroes';
import { hexToPixel, pixelToHex, generateId } from '../../shared/utils/hexUtils';
import { REWARDS } from '../../shared/hex/tileLogic';
import { ActionHelpers } from '../action/actionEngine';

export class CombatLogic {
  /**
   * 结算攻击 (Resolve attack)
   */
  static resolveAttack(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers
  ): void {
    const attackerToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
    const targetId = gameState.selectedTargetId;
    const targetToken = gameState.tokens.find((t: any) => t.boundToCardId  === targetId);
    const targetCard = gameState.tableCards.find((c: any) => c.id === targetId);
    
    const isDefended = !!gameState.isDefended;
    const defenseCard = isDefended ? gameState.playAreaCards.find((c: any) => c.id === gameState.lastPlayedCardId) : null;

    if (targetToken && targetCard) {
      if (isDefended) {
        helpers.addLog(`${targetCard.heroClass} 使用了 ${defenseCard?.name || '防御牌'}，攻击被抵消`, 1 - playerIndex);
      } else {
        const attackerCard = gameState.tableCards.find((c: any) => c.id === attackerToken?.boundToCardId);
        const damage = this.calculateDamage(attackerCard, targetCard, false, gameState);

        targetCard.damage = (targetCard.damage || 0) + damage;
        let damageCounter = gameState.counters.find((c: any) => c.type === 'damage' && c.boundToCardId === targetCard.id);
        if (!damageCounter) {
          damageCounter = { id: generateId(), type: 'damage', x: targetToken.x, y: targetToken.y, value: 0, boundToCardId: targetCard.id };
          gameState.counters.push(damageCounter);
        }
        damageCounter.value = targetCard.damage;

        helpers.addLog(`${attackerCard?.heroClass} 对 ${targetCard.heroClass} 造成了 ${damage} 点伤害`, playerIndex);

        if (this.isHeroDead(targetCard, gameState)) {
          this.handleHeroDeath(targetCard, targetToken, 1 - playerIndex, helpers, gameState);
          const rewards = this.getCombatRewards(attackerCard, 'hero', true);
          if (rewards.reputation > 0) {
            helpers.addReputation(playerIndex, rewards.reputation, "击杀敌方英雄");
          }
          if (rewards.exp > 0) {
            this.addExp(attackerCard, rewards.exp, gameState);
          }
          if (rewards.gold > 0) {
            this.addGold(playerIndex, rewards.gold, gameState);
          }
        } else {
          const rewards = this.getCombatRewards(attackerCard, 'hero', false);
          if (rewards.exp > 0) {
            this.addExp(attackerCard, rewards.exp, gameState);
          }
        }
      }
    }
  }

  /**
   * 结算怪物攻击
   */
  static resolveMonsterAttack(
    gameState: GameState,
    playerIndex: number,
    q: number,
    r: number,
    helpers: ActionHelpers
  ): void {
    const monster = gameState.map?.monsters?.find(m => m.q === q && m.r === r);
    if (!monster) return;

    const pos = hexToPixel(q, r);
    const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
    if (hasTimer) return;

    const token = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
    if (!token) return;

    const heroCard = gameState.tableCards.find(c => c.id === token.boundToCardId);

    let damageCounter = gameState.counters.find(c => c.type === 'damage' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
    if (!damageCounter) {
      damageCounter = { id: generateId(), type: 'damage', x: pos.x, y: pos.y, value: 0 };
      gameState.counters.push(damageCounter);
    }
    
    let damage = 1; // Base damage
    const enhancementCard = gameState.activeEnhancementCardId
      ? (gameState.playAreaCards.find(c => c.id === gameState.activeEnhancementCardId) ||
         gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId))
      : null;

    damage += getAttackDamageBonusFromEnhancement(enhancementCard?.name);
    
    if (heroCard) {
      helpers.addLog(`发起阶段: ${heroCard.heroClass} 对 LV${monster.level}怪物 发起了攻击`, playerIndex);
    }
    
    damageCounter.value += damage;
    helpers.addLog(`结算阶段: LV${monster.level}怪物 受到 ${damage} 点伤害，当前受伤计数器为 ${damageCounter.value}`, playerIndex);

    if (damageCounter.value >= monster.level) {
      // Monster dies
      gameState.counters = gameState.counters.filter(c => c.id !== damageCounter!.id);
      gameState.counters.push({ id: generateId(), type: 'time', x: pos.x, y: pos.y, value: 0 });
      
      helpers.addLog(`阵亡阶段: LV${monster.level}怪物 已阵亡`, playerIndex);

      // Gain EXP and Gold
      if (heroCard) {
        const rewards = this.getCombatRewards(heroCard, 'monster', true, monster.level);
        
        if (rewards.exp > 0) this.addExp(heroCard, rewards.exp, gameState);
        if (rewards.gold > 0) this.addGold(playerIndex, rewards.gold, gameState);
        
        helpers.addLog(`奖励阶段: ${heroCard.heroClass} 击败了 LV${monster.level}怪物，获得 ${rewards.exp} 经验和 ${rewards.gold} 金币`, playerIndex);
        gameState.notification = `击杀怪物！获得 ${rewards.exp} 经验和 ${rewards.gold} 金币。`;
        
        // Reputation scoring
        if (rewards.reputation > 0) {
          helpers.addReputation(playerIndex, rewards.reputation, `击杀LV${monster.level}怪物`);
        }
      }
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
        if (this.isHeroDead(heroCard, gameState)) {
          this.handleHeroDeath(heroCard, token, playerIndex, helpers, gameState);
          gameState.notification += ` ${heroCard.heroClass} 阵亡！ (Hero died!)`;
        }
      }
    }
  }

  /**
   * 结算王城攻击
   */
  static resolveCastleAttack(
    gameState: GameState,
    playerIndex: number,
    enemyIndex: number,
    helpers: ActionHelpers
  ): void {
    gameState.castleHP[enemyIndex] = (gameState.castleHP[enemyIndex] || 3) - 1;
    
    // Reputation scoring for damaging castle
    helpers.addReputation(playerIndex, 2, "王城伤害");
    
    const token = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
    const heroCard = token ? gameState.tableCards.find(c => c.id === token.boundToCardId) : null;
    
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
  }

  /**
   * 结算反击 (Resolve counter attack)
   */
  static resolveCounterAttack(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers
  ): void {
    const attackerToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
    const attackerCard = gameState.tableCards.find((c: any) => c.id === attackerToken?.boundToCardId);
    const defenderCard = gameState.tableCards.find((c: any) => c.id === gameState.selectedTargetId);
    const defenderToken = gameState.tokens.find((t: any) => t.boundToCardId === gameState.selectedTargetId);

    if (attackerToken && attackerCard && defenderCard && defenderToken) {
      const damage = this.calculateDamage(defenderCard, attackerCard, true, gameState);

      attackerCard.damage = (attackerCard.damage || 0) + damage;
      let damageCounter = gameState.counters.find((c: any) => c.type === 'damage' && c.boundToCardId === attackerCard.id);
      if (!damageCounter) {
        damageCounter = { id: generateId(), type: 'damage', x: attackerToken.x, y: attackerToken.y, value: 0, boundToCardId: attackerCard.id };
        gameState.counters.push(damageCounter);
      }
      damageCounter.value = attackerCard.damage;

      helpers.addLog(`${defenderCard.heroClass} 对 ${attackerCard.heroClass} 进行了反击，造成了 ${damage} 点伤害`, playerIndex);

      if (this.isHeroDead(attackerCard, gameState)) {
        this.handleHeroDeath(attackerCard, attackerToken, playerIndex, helpers, gameState);
        const rewards = this.getCombatRewards(defenderCard, 'hero', true);
        if (rewards.reputation > 0) {
          helpers.addReputation(1 - playerIndex, rewards.reputation, "反击击杀敌方英雄");
        }
        if (rewards.exp > 0) {
          this.addExp(defenderCard, rewards.exp, gameState);
        }
        if (rewards.gold > 0) {
          this.addGold(1 - playerIndex, rewards.gold, gameState);
        }
      } else {
        const rewards = this.getCombatRewards(defenderCard, 'hero', false);
        if (rewards.exp > 0) {
          this.addExp(defenderCard, rewards.exp, gameState);
        }
      }
    }
  }

  /**
   * 增加经验值
   */
  static addExp(heroCard: TableCard, amount: number, gameState: GameState): void {
    const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === heroCard.id);
    if (expCounter) {
      expCounter.value += amount;
    }
  }

  /**
   * 增加金币
   */
  static addGold(playerIndex: number, amount: number, gameState: GameState): void {
    const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
    if (goldCounter) {
      goldCounter.value += amount;
    }
  }

  /**
   * 处理英雄阵亡
   */
  static handleHeroDeath(
    deadHeroCard: TableCard,
    deadHeroToken: Token,
    deadPlayerIndex: number,
    helpers: ActionHelpers,
    gameState: GameState
  ): void {
    helpers.addLog(`${deadHeroCard.heroClass} 阵亡了！`, deadPlayerIndex);
    
    // Reset damage
    deadHeroCard.damage = 0;
    const damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === deadHeroCard.id);
    if (damageCounter) damageCounter.value = 0;

    // Move token to hero card
    deadHeroToken.x = deadHeroCard.x;
    deadHeroToken.y = deadHeroCard.y;

    // Add time counter to hero card
    gameState.counters.push({ 
      id: generateId(), 
      type: 'time', 
      x: deadHeroCard.x, 
      y: deadHeroCard.y, 
      value: 0, 
      boundToCardId: deadHeroCard.id 
    });

    if (helpers.checkAndResetChanting) {
      helpers.checkAndResetChanting(deadHeroToken.id);
    }
  }

  static getHeroAttackRange(card: TableCard): number {
    const heroData = HEROES_DATABASE?.heroes?.find((h: any) => h.name === card.heroClass);
    const levelData = heroData?.levels?.[card.level || 1];
    return levelData?.ar || 1;
  }

  static getHeroMaxHp(card: TableCard): number {
    const heroData = HEROES_DATABASE?.heroes?.find((h: any) => h.name === card.heroClass);
    const levelData = heroData?.levels?.[card.level || 1];
    return levelData?.hp || 0;
  }

  static hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
    return Math.max(
      Math.abs(a.q - b.q),
      Math.abs(a.r - b.r),
      Math.abs((a.q + a.r) - (b.q + b.r))
    );
  }

  /**
   * 计算是否可以反击
   */
  static canCounterAttack(gameState: GameState, defenderIndex: number): boolean {
    const attackerToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
    const attackerCard = gameState.tableCards.find((c: any) => c.id === attackerToken?.boundToCardId);

    const defenderCard = gameState.tableCards.find((c: any) => c.id === gameState.selectedTargetId);
    const defenderToken = gameState.tokens.find((t: any) => t.boundToCardId === gameState.selectedTargetId);

    if (!attackerToken || !attackerCard || !defenderCard || !defenderToken) return false;

    // 条件1：先吃原始攻击后不能死
    const incomingDamage = this.calculateDamage(attackerCard, defenderCard, false, gameState);
    const defenderMaxHp = this.getHeroMaxHp(defenderCard);
    const defenderCurrentDamage = defenderCard.damage || 0;
    const survives = defenderCurrentDamage + incomingDamage < defenderMaxHp;

    if (!survives) return false;

    // 条件2：防守方攻击范围能打到原攻击者
    const defenderRange = this.getHeroAttackRange(defenderCard);
    const defenderHex = pixelToHex(defenderToken.x, defenderToken.y);
    const attackerHex = pixelToHex(attackerToken.x, attackerToken.y);
    const inRange = this.hexDistance(defenderHex, attackerHex) <= defenderRange;

    return inRange;
  }


  /**
   * 计算攻击造成的伤害
   */
  static calculateDamage(
    attacker: TableCard,
    defender: TableCard | null,
    isCounter: boolean,
    gameState: GameState,
    options?: { isEnhanced?: boolean }
  ): number {
    const heroData = HEROES_DATABASE?.heroes?.find((h: any) => h.name === attacker.heroClass);
    const levelData = heroData?.levels?.[attacker.level || 1];
    let damage = levelData?.atk || 1;

    if (!isCounter) {
      const enhancementCard = gameState.activeEnhancementCardId 
        ? (gameState.playAreaCards.find((c: any) => c.id === gameState.activeEnhancementCardId) || 
           gameState.discardPiles.action.find((c: any) => c.id === gameState.activeEnhancementCardId))
        : null;
      damage += getAttackDamageBonusFromEnhancement(enhancementCard?.name);
    }

    if (options?.isEnhanced) {
      damage += 1;
    }
    return damage;
  }

  /**
   * 检查英雄是否阵亡
   */
  static isHeroDead(hero: TableCard, gameState: GameState): boolean {
    if (!hero.heroClass || !hero.level) return false;
    const maxHP = getHeroStat(hero.heroClass, hero.level, 'hp');
    return (hero.damage || 0) >= maxHP;
  }

  /**
   * 获取战斗奖励
   */
  static getCombatRewards(
    attacker: TableCard,
    targetType: 'hero' | 'monster' | 'castle',
    isKill: boolean,
    targetLevel?: number
  ) {
    const rewards = {
      exp: 0,
      gold: 0,
      reputation: 0
    };

    if (targetType === 'hero') {
      rewards.exp = 1;
      if (isKill) {
        rewards.gold = 2;
        rewards.reputation = 1;
      }
    } else if (targetType === 'monster') {
      if (isKill) {
        if (targetLevel === 1) {
          rewards.exp = REWARDS.MONSTER.LV1.EXP;
          rewards.gold = REWARDS.MONSTER.LV1.GOLD;
          rewards.reputation = REWARDS.MONSTER.LV1.REP;
        } else if (targetLevel === 2) {
          rewards.exp = REWARDS.MONSTER.LV2.EXP;
          rewards.gold = REWARDS.MONSTER.LV2.GOLD;
          rewards.reputation = REWARDS.MONSTER.LV2.REP;
        } else if (targetLevel === 3) {
          rewards.exp = REWARDS.MONSTER.LV3.EXP;
          rewards.gold = REWARDS.MONSTER.LV3.GOLD;
          rewards.reputation = REWARDS.MONSTER.LV3.REP;
        }
      }
    } else if (targetType === 'castle') {
      rewards.exp = 1;
      rewards.reputation = 2;
    }

    return rewards;
  }
}
