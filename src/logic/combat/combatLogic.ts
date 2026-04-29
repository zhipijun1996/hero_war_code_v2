import { GameState, TableCard, Token } from '../../shared/types/index.ts';
import { getHeroStat } from '../hero/heroLogic.ts';
import { getAttackDamageBonusFromEnhancement } from '../card/enhancementModifiers.ts';
import { HEROES_DATABASE } from '../../shared/config/heroes.ts';
import { hexToPixel, pixelToHex, generateId } from '../../shared/utils/hexUtils.ts';
import { REWARDS } from '../../shared/hex/tileLogic.ts';
import { ActionHelpers } from '../action/actionEngine.ts';
import { SkillEngine } from '../skills/skillEngine.ts';
import { isTargetInAttackRange } from '../map/mapLogic.ts';

export class CombatLogic {
  /**
   * 结算攻击 (Resolve attack)
   */
  static async resolveAttack(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers
  ): Promise<void> {
    const attackerToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
    const targetId = gameState.selectedTargetId;
    const targetToken = gameState.tokens.find((t: any) => t.boundToCardId  === targetId);
    const targetCard = gameState.tableCards.find((c: any) => c.id === targetId);
    
    const isDefended = !!gameState.isDefended;
    const defenseCard = isDefended ? gameState.playAreaCards.find((c: any) => c.id === gameState.lastPlayedCardId) : null;

    if (targetToken && targetCard) {
      if (isDefended) {
        helpers.addLog(`${targetCard.heroClass} 使用了 ${defenseCard?.name || '防御牌'}，攻击被抵消`, 1 - playerIndex);
        await SkillEngine.triggerEvent('onDefended', gameState, helpers, {
          attackerTokenId: attackerToken?.id,
          defenderTokenId: targetToken.id,
          defenseCardId: defenseCard?.id
        });
      } else {
        const attackerCard = gameState.tableCards.find((c: any) => c.id === attackerToken?.boundToCardId);
        
        // 触发攻击前事件
        await SkillEngine.triggerEvent('onAttackStart', gameState, helpers, { 
          eventSourceId: attackerToken?.id,
          eventTargetId: targetToken.id 
        });

        let damage = this.calculateDamage(attackerCard, targetCard, false, gameState);

        // Apply deep_freeze modifier
        let isFrozen = false;
        if (gameState.statuses) {
          const frozenIndex = gameState.statuses.findIndex(s => s.tokenId === targetToken.id && s.status === 'deep_freeze');
          if (frozenIndex !== -1) {
            gameState.statuses.splice(frozenIndex, 1);
            isFrozen = true;
            damage += 1; // 破冰伤害+1
            helpers.addLog(`${targetCard.heroClass} 被打破了深度冻结状态！受到额外碎冰伤害。`, playerIndex);
          }
        }

        targetCard.damage = (targetCard.damage || 0) + damage;
        let damageCounter = gameState.counters.find((c: any) => c.type === 'damage' && c.boundToCardId === targetCard.id);
        if (!damageCounter) {
          damageCounter = { id: generateId(), type: 'damage', x: targetToken.x, y: targetToken.y, value: 0, boundToCardId: targetCard.id };
          gameState.counters.push(damageCounter);
        }
        damageCounter.value = targetCard.damage;

        // Remove shield if present
        if (gameState.statuses) {
          const shieldIndex = gameState.statuses.findIndex(s => s.tokenId === targetToken.id && s.status === 'shield');
          if (shieldIndex !== -1) {
            gameState.statuses.splice(shieldIndex, 1);
            helpers.addLog(`${targetCard.heroClass} 的圣盾破碎了！`, playerIndex);
          }
        }

        helpers.checkAndResetChanting(targetToken.id);
        helpers.addLog(`${attackerCard?.heroClass} 对 ${targetCard.heroClass} 造成了 ${damage} 点伤害`, playerIndex);

        // 触发受到伤害事件
        await SkillEngine.triggerEvent('onDamageTaken', gameState, helpers, {
          eventSourceId: targetToken.id,
          attackerTokenId: attackerToken?.id,
          damage
        });

        // 触发造成伤害事件
        await SkillEngine.triggerEvent('onDamageDealt', gameState, helpers, {
          eventSourceId: attackerToken?.id,
          targetTokenId: targetToken.id,
          damage
        });

        if (this.isHeroDead(targetCard, gameState)) {
          // 触发击杀事件
          await SkillEngine.triggerEvent('onKill', gameState, helpers, {
            eventSourceId: attackerToken?.id,
            killedTokenId: targetToken.id,
            targetType: 'hero'
          });

          await this.handleHeroDeath(targetCard, targetToken, 1 - playerIndex, helpers, gameState);
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
   * 对怪物造成法术/环境伤害 (不会触发怪物的反击)
   */
  static async applySpellDamageToMonster(
    gameState: GameState,
    monster: any, // {q, r, level, ...}
    damage: number,
    sourceTokenId: string, // Damage source
    playerIndex: number,
    helpers: ActionHelpers,
    skillName: string
  ): Promise<boolean> {
    const pos = hexToPixel(monster.q, monster.r);
    
    // 如果怪物已经被时间锁定了（刚死并倒计时），跳过
    const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
    if (hasTimer) return false;

    let damageCounter = gameState.counters.find(c => c.type === 'damage' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
    if (!damageCounter) {
      damageCounter = { id: generateId(), type: 'damage', x: pos.x, y: pos.y, value: 0 };
      gameState.counters.push(damageCounter);
    }
    
    let actualDamage = damage;
    if (gameState.statuses) {
      const monsterTokenId = `monster_${monster.q}_${monster.r}`;
      const frozenIndex = gameState.statuses.findIndex(s => s.tokenId === monsterTokenId && s.status === 'deep_freeze');
      if (frozenIndex !== -1) {
        gameState.statuses.splice(frozenIndex, 1);
        actualDamage += 1;
        helpers.addLog(`【${skillName}】LV${monster.level}怪物 被打破了深度冻结状态！受到额外碎冰伤害。`, playerIndex);
      }
    }

    damageCounter.value += actualDamage;
    helpers.addLog(`【${skillName}】LV${monster.level}怪物 受到 ${actualDamage} 点魔法伤害！(当前受伤: ${damageCounter.value})`, playerIndex);

    // 触发魔法伤害Dealt事件 (如果有技能监听魔法伤害的话)
    await SkillEngine.triggerEvent('onDamageDealt', gameState, helpers, {
      eventSourceId: sourceTokenId,
      targetType: 'monster',
      damage: damage,
      isSpell: true
    });

    if (damageCounter.value >= monster.level) {
      // 怪物死亡
      gameState.counters = gameState.counters.filter(c => c.id !== damageCounter!.id);
      
      const monsterIndex = gameState.map?.monsters?.findIndex(m => m === monster);
      const origin = (monsterIndex !== undefined && monsterIndex !== -1) 
        ? gameState.mapConfig?.monsters?.[monsterIndex] 
        : null;
      
      const respawnPos = origin ? hexToPixel(origin.q, origin.r) : pos;
      gameState.counters.push({ id: generateId(), type: 'time', x: respawnPos.x, y: respawnPos.y, value: 0 });
      
      if (origin) {
        monster.q = origin.q;
        monster.r = origin.r;
      }
      
      helpers.addLog(`【${skillName}】击杀了 LV${monster.level}怪物！`, playerIndex);

      await SkillEngine.triggerEvent('onKill', gameState, helpers, {
        eventSourceId: sourceTokenId,
        targetType: 'monster',
        isSpell: true
      });

      // 寻找到导致伤害的卡牌去发奖励
      const sourceToken = gameState.tokens.find((t: any) => t.id === sourceTokenId);
      const sourceCard = sourceToken ? gameState.tableCards.find(c => c.id === sourceToken.boundToCardId) : null;
      
      if (sourceCard) {
        const rewards = this.getCombatRewards(sourceCard, 'monster', true, monster.level);
        if (rewards.exp > 0) this.addExp(sourceCard, rewards.exp, gameState);
        if (rewards.gold > 0) this.addGold(playerIndex, rewards.gold, gameState);
        
        helpers.addLog(`奖励阶段: ${sourceCard.heroClass} 击败了 LV${monster.level}怪物，获得 ${rewards.exp} 经验和 ${rewards.gold} 金币`, playerIndex);
        
        if (rewards.reputation > 0) {
          helpers.addReputation(playerIndex, rewards.reputation, `击杀LV${monster.level}怪物`);
        }
      }
      return true; // killed
    }
    return false; // alive
  }

  /**
   * 对英雄造成法术/环境伤害
   */
  static async applySpellDamageToHero(
    gameState: GameState,
    targetCard: TableCard,
    targetToken: any,
    damage: number,
    sourceTokenId: string, // Damage source
    playerIndex: number, // The player who caused the damage
    helpers: ActionHelpers,
    skillName: string
  ): Promise<boolean> {
    const ownerIndex = targetCard.y > 0 ? 0 : 1;
    let actualDamage = damage;

    // Apply deep_freeze modifier
    let isFrozen = false;
    if (gameState.statuses) {
      const frozenIndex = gameState.statuses.findIndex(s => s.tokenId === targetToken.id && s.status === 'deep_freeze');
      if (frozenIndex !== -1) {
        gameState.statuses.splice(frozenIndex, 1);
        isFrozen = true;
        actualDamage += 1; // 破冰伤害+1
        helpers.addLog(`${targetCard.heroClass} 被打破了深度冻结状态！受到额外碎冰伤害。`, playerIndex);
      }
    }

    // Apply shield reduction if present
    if (gameState.statuses) {
      const shieldIndex = gameState.statuses.findIndex(s => s.tokenId === targetToken.id && s.status === 'shield');
      if (shieldIndex !== -1) {
        actualDamage = Math.max(0, actualDamage - 1);
        gameState.statuses.splice(shieldIndex, 1);
        helpers.addLog(`${targetCard.heroClass} 的圣盾破碎了！吸收了伤害。`, playerIndex);
      }
    }

    if (actualDamage <= 0) {
      return false;
    }

    targetCard.damage = (targetCard.damage || 0) + actualDamage;
    let damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === targetCard.id);
    if (!damageCounter) {
      damageCounter = { id: generateId(), type: 'damage', x: targetToken.x, y: targetToken.y, value: 0, boundToCardId: targetCard.id };
      gameState.counters.push(damageCounter);
    }
    damageCounter.value = targetCard.damage;

    helpers.addLog(`【${skillName}】${targetCard.heroClass} 受到 ${actualDamage} 点魔法伤害！(当前受伤: ${damageCounter.value})`, playerIndex);

    // 触发魔法受击/Dealt事件
    await SkillEngine.triggerEvent('onDamageTaken', gameState, helpers, {
      eventSourceId: targetToken.id,
      attackerTokenId: sourceTokenId,
      damage: actualDamage,
      isSpell: true
    });

    await SkillEngine.triggerEvent('onDamageDealt', gameState, helpers, {
      eventSourceId: sourceTokenId,
      sourceType: 'hero',
      targetTokenId: targetToken.id,
      damage: actualDamage,
      isSpell: true
    });

    if (this.isHeroDead(targetCard, gameState)) {
      helpers.addLog(`【${skillName}】击杀了 ${targetCard.heroClass}！`, playerIndex);
      
      await SkillEngine.triggerEvent('onKill', gameState, helpers, {
        eventSourceId: sourceTokenId,
        targetType: 'hero',
        isSpell: true
      });

      const sourceToken = gameState.tokens.find((t: any) => t.id === sourceTokenId);
      const sourceCard = sourceToken ? gameState.tableCards.find(c => c.id === sourceToken.boundToCardId) : null;
      
      if (sourceCard) {
        const rewards = this.getCombatRewards(sourceCard, 'hero', true);
        if (rewards.exp > 0) this.addExp(sourceCard, rewards.exp, gameState);
        if (rewards.gold > 0) this.addGold(playerIndex, rewards.gold, gameState);
        if (rewards.reputation > 0) {
          helpers.addReputation(playerIndex, rewards.reputation, `击杀敌方英雄`);
        }
      }

      await this.handleHeroDeath(targetCard, targetToken, ownerIndex, helpers as any, gameState);
      return true;
    }
    return false;
  }

  /**
   * 对冰柱等环境物造成法术/环境被波及伤害
   */
  static async applySpellDamageToTerrain(
    gameState: GameState,
    targetHex: { q: number; r: number },
    damage: number,
    sourceTokenId: string,
    playerIndex: number,
    helpers: ActionHelpers,
    skillName: string
  ): Promise<boolean> {
    if (!gameState.icePillars) return false;
    
    const pillarIndex = gameState.icePillars.findIndex(p => p.q === targetHex.q && p.r === targetHex.r);
    if (pillarIndex === -1) return false;
    
    let pillar = gameState.icePillars[pillarIndex];
    pillar.hp -= damage;
    
    helpers.addLog(`【${skillName}】对冰柱造成了 ${damage} 点魔法伤害！`, playerIndex);
    
    if (pillar.hp <= 0) {
      gameState.icePillars.splice(pillarIndex, 1);
      helpers.addLog(`冰柱被击碎了！`, playerIndex);
      
      await SkillEngine.triggerEvent('onTerrainDestroyed', gameState, helpers, {
        terrainType: 'ice_pillar',
        terrainId: pillar.id,
        q: pillar.q,
        r: pillar.r,
        ownerIndex: pillar.ownerIndex,
        sourceTokenId: pillar.sourceTokenId,
        cause: 'spell_damage'
      });
      return true;
    }
    return false;
  }

  /**
   * 主动攻击冰柱 (普通攻击)
   */
  static async resolveIcePillarAttack(
    gameState: GameState,
    playerIndex: number,
    icePillarId: string,
    helpers: ActionHelpers
  ): Promise<void> {
    if (!gameState.icePillars) return;
    
    const pillarIndex = gameState.icePillars.findIndex(p => p.id === icePillarId);
    if (pillarIndex === -1) return;
    
    const pillar = gameState.icePillars[pillarIndex];
    
    const attackerToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
    if (!attackerToken) return;

    const attackerCard = gameState.tableCards.find(c => c.id === attackerToken.boundToCardId);
    if (!attackerCard) return;

    helpers.addLog(`发起阶段: ${attackerCard.heroClass} 对 冰柱 发起了攻击`, playerIndex);

    let baseAtk = SkillEngine.getModifiedStat(attackerToken.id, 'atk', gameState);
    const enhancementCard = gameState.activeEnhancementCardId 
      ? (gameState.playAreaCards.find(c => c.id === gameState.activeEnhancementCardId) || 
         gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId))
      : null;
      
    if (enhancementCard) baseAtk += 1;
    if (gameState.selectedOption === 'turret_attack') baseAtk += 1;

    helpers.addLog(`结算阶段: 攻击命中！造成 ${baseAtk} 点物理伤害`, playerIndex);
    pillar.hp -= baseAtk;
    
    // Trigger onDamageDealt for normal attack
    await SkillEngine.triggerEvent('onDamageDealt', gameState, helpers, {
      eventSourceId: attackerToken.id,
      sourceType: 'hero',
      targetType: 'terrain',
      damage: baseAtk
    });

    if (pillar.hp <= 0) {
      gameState.icePillars.splice(pillarIndex, 1);
      helpers.addLog(`冰柱被击碎了！`, playerIndex);
      
      await SkillEngine.triggerEvent('onTerrainDestroyed', gameState, helpers, {
        terrainType: 'ice_pillar',
        terrainId: pillar.id,
        q: pillar.q,
        r: pillar.r,
        ownerIndex: pillar.ownerIndex,
        sourceTokenId: pillar.sourceTokenId,
        cause: 'attack'
      });
    }

    // Since it's a structural target, no counter-attack from it.
  }

  /**
   * 结算怪物攻击
   */
  static async resolveMonsterAttack(
    gameState: GameState,
    playerIndex: number,
    q: number,
    r: number,
    helpers: ActionHelpers
  ): Promise<void> {
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

    // Apply deep freeze modifier
    let isFrozen = false;
    if (gameState.statuses) {
      const monsterTokenId = `monster_${monster.q}_${monster.r}`;
      const frozenIndex = gameState.statuses.findIndex(s => s.tokenId === monsterTokenId && s.status === 'deep_freeze');
      if (frozenIndex !== -1) {
        gameState.statuses.splice(frozenIndex, 1);
        isFrozen = true;
        damage += 1;
        helpers.addLog(`LV${monster.level}怪物 被打破了深度冻结状态！受到额外碎冰伤害。`, playerIndex);
      }
    }
    
    if (heroCard) {
      helpers.addLog(`发起阶段: ${heroCard.heroClass} 对 LV${monster.level}怪物 发起了攻击`, playerIndex);
      await SkillEngine.triggerEvent('onAttackStart', gameState, helpers, {
        eventSourceId: token.id,
        targetType: 'monster'
      });
    }
    
    damageCounter.value += damage;
    helpers.addLog(`结算阶段: LV${monster.level}怪物 受到 ${damage} 点伤害，当前受伤计数器为 ${damageCounter.value}`, playerIndex);

    // 触发造成伤害事件 (Hero -> Monster)
    await SkillEngine.triggerEvent('onDamageDealt', gameState, helpers, {
      eventSourceId: token.id,
      targetType: 'monster',
      damage
    });

    if (damageCounter.value >= monster.level) {
      // Monster dies
      gameState.counters = gameState.counters.filter(c => c.id !== damageCounter!.id);
      
      // Find origin from mapConfig
      const monsterIndex = gameState.map?.monsters?.findIndex(m => m === monster);
      const origin = (monsterIndex !== undefined && monsterIndex !== -1) 
        ? gameState.mapConfig?.monsters?.[monsterIndex] 
        : null;
      
      const respawnPos = origin ? hexToPixel(origin.q, origin.r) : pos;
      
      gameState.counters.push({ id: generateId(), type: 'time', x: respawnPos.x, y: respawnPos.y, value: 0 });
      
      // Reset monster position to origin
      if (origin) {
        monster.q = origin.q;
        monster.r = origin.r;
      }
      
      helpers.addLog(`阵亡阶段: LV${monster.level}怪物 已阵亡，复活计时器已放置在初始位置 (${monster.q}, ${monster.r})`, playerIndex);

      // 触发击杀事件
      await SkillEngine.triggerEvent('onKill', gameState, helpers, {
        eventSourceId: token.id,
        targetType: 'monster'
      });

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
        let monsterDamage = 1;
        
        // Apply shield reduction
        if (gameState.statuses) {
          const shieldIndex = gameState.statuses.findIndex(s => s.tokenId === token.id && s.status === 'shield');
          if (shieldIndex !== -1) {
            monsterDamage = Math.max(0, monsterDamage - 1);
            gameState.statuses.splice(shieldIndex, 1);
            helpers.addLog(`${heroCard.heroClass} 的圣盾破碎了！`, playerIndex);
          }
        }

        heroCard.damage = (heroCard.damage || 0) + monsterDamage;
        const heroDamageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === heroCard.id);
        if (heroDamageCounter) heroDamageCounter.value = heroCard.damage;
        helpers.checkAndResetChanting(token.id);
        helpers.addLog(`反击阶段: LV${monster.level}怪物 存活，触发反击！${heroCard.heroClass} 受到 ${monsterDamage} 点伤害`, playerIndex);
        helpers.addLog(`结算阶段: ${heroCard.heroClass} 当前受伤计数器为 ${heroCard.damage}`, playerIndex);
        gameState.notification = `攻击怪物！怪物反击造成 ${monsterDamage} 点伤害。 (Attacked monster! Monster counter-attacked for ${monsterDamage} damage.)`;
        
        await SkillEngine.triggerEvent('onDamageTaken', gameState, helpers, {
          eventSourceId: token.id,
          damage: monsterDamage,
          sourceType: 'monster'
        });

        // 触发造成伤害事件 (Monster -> Hero)
        await SkillEngine.triggerEvent('onDamageDealt', gameState, helpers, {
          sourceType: 'monster',
          targetTokenId: token.id,
          damage: monsterDamage
        });

        // Check hero death
        if (this.isHeroDead(heroCard, gameState)) {
          // 触发击杀事件 (Monster -> Hero)
          await SkillEngine.triggerEvent('onKill', gameState, helpers, {
            sourceType: 'monster',
            killedTokenId: token.id,
            targetType: 'hero'
          });

          await this.handleHeroDeath(heroCard, token, playerIndex, helpers, gameState);
          gameState.notification += ` ${heroCard.heroClass} 阵亡！ (Hero died!)`;
        }
      }
    }
  }

  /**
   * 结算王城攻击
   */
  static async resolveCastleAttack(
    gameState: GameState,
    playerIndex: number,
    enemyIndex: number,
    helpers: ActionHelpers
  ): Promise<void> {
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
  static async resolveCounterAttack(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers
  ): Promise<void> {
    const attackerToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
    const attackerCard = gameState.tableCards.find((c: any) => c.id === attackerToken?.boundToCardId);
    const defenderCard = gameState.tableCards.find((c: any) => c.id === gameState.selectedTargetId);
    const defenderToken = gameState.tokens.find((t: any) => t.boundToCardId === gameState.selectedTargetId);

    if (attackerToken && attackerCard && defenderCard && defenderToken) {
      // Check if target is still in range after potential knockback
      const attackerHex = pixelToHex(attackerToken.x, attackerToken.y);
      const defenderHex = pixelToHex(defenderToken.x, defenderToken.y);
      const ar = SkillEngine.getModifiedStat(defenderToken.id, 'ar', gameState);
      
      if (!isTargetInAttackRange(defenderHex, attackerHex, ar, gameState)) {
        helpers.addLog(`反击失败：${attackerCard.heroClass} 已超出 ${defenderCard.heroClass} 的反击射程`, playerIndex);
        return;
      }

      // 触发反击开始事件
      await SkillEngine.triggerEvent('onCounterAttackStart', gameState, helpers, {
        eventSourceId: defenderToken.id,
        eventTargetId: attackerToken.id
      });

      const damage = this.calculateDamage(defenderCard, attackerCard, true, gameState);

      attackerCard.damage = (attackerCard.damage || 0) + damage;
      let damageCounter = gameState.counters.find((c: any) => c.type === 'damage' && c.boundToCardId === attackerCard.id);
      if (!damageCounter) {
        damageCounter = { id: generateId(), type: 'damage', x: attackerToken.x, y: attackerToken.y, value: 0, boundToCardId: attackerCard.id };
        gameState.counters.push(damageCounter);
      }
      damageCounter.value = attackerCard.damage;

      // Remove shield if present
      if (gameState.statuses) {
        const shieldIndex = gameState.statuses.findIndex(s => s.tokenId === attackerToken.id && s.status === 'shield');
        if (shieldIndex !== -1) {
          gameState.statuses.splice(shieldIndex, 1);
          helpers.addLog(`${attackerCard.heroClass} 的圣盾破碎了！`, playerIndex);
        }
      }

      helpers.checkAndResetChanting(attackerToken.id);
      helpers.addLog(`${defenderCard.heroClass} 对 ${attackerCard.heroClass} 进行了反击，造成了 ${damage} 点伤害`, playerIndex);

      // 触发受到伤害事件
      await SkillEngine.triggerEvent('onDamageTaken', gameState, helpers, {
        eventSourceId: attackerToken.id,
        attackerTokenId: defenderToken.id,
        damage
      });

      // 触发造成伤害事件
      await SkillEngine.triggerEvent('onDamageDealt', gameState, helpers, {
        eventSourceId: defenderToken.id,
        targetTokenId: attackerToken.id,
        damage
      });

      if (this.isHeroDead(attackerCard, gameState)) {
        // 触发击杀事件
        await SkillEngine.triggerEvent('onKill', gameState, helpers, {
          eventSourceId: defenderToken.id,
          killedTokenId: attackerToken.id,
          targetType: 'hero'
        });

        await this.handleHeroDeath(attackerCard, attackerToken, playerIndex, helpers, gameState);
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
  static async handleHeroDeath(
    deadHeroCard: TableCard,
    deadHeroToken: Token,
    deadPlayerIndex: number,
    helpers: ActionHelpers,
    gameState: GameState
  ): Promise<void> {
    helpers.addLog(`${deadHeroCard.heroClass} 阵亡了！`, deadPlayerIndex);
    
    // 触发英雄阵亡事件
    await SkillEngine.triggerEvent('onHeroDeath', gameState, helpers, {
      eventSourceId: deadHeroToken.id
    });

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

  static getHeroAttackRange(card: TableCard, gameState: GameState): number {
    const token = gameState.tokens.find(t => t.boundToCardId === card.id);
    if (!token) return 1;
    return SkillEngine.getModifiedStat(token.id, 'ar', gameState);
  }

  static getHeroMaxHp(card: TableCard, gameState: GameState): number {
    const token = gameState.tokens.find(t => t.boundToCardId === card.id);
    if (!token) return 3;
    return SkillEngine.getModifiedStat(token.id, 'hp', gameState);
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

    // Check if defender used resolute skill instead of normal defense card
    if ((gameState as any).usedResoluteForDefense) {
      return false;
    }

    // Check if defender has 'hardened' skill (legacy)
    if (defenderToken.heroClass) {
      const heroData = HEROES_DATABASE.heroes.find(h => h.name === defenderToken.heroClass || h.id === defenderToken.heroClass);
      if (heroData) {
        const levelData = heroData.levels[defenderToken.lv.toString()];
        if (levelData && levelData.skills) {
          const hasHardened = levelData.skills.some(s => s.id === 'hardened');
          if (hasHardened) return false;
        }
      }
    }

    // 条件1：先吃原始攻击后不能死
    const incomingDamage = this.calculateDamage(attackerCard, defenderCard, false, gameState);
    const defenderMaxHp = this.getHeroMaxHp(defenderCard, gameState);
    const defenderCurrentDamage = defenderCard.damage || 0;
    const survives = defenderCurrentDamage + incomingDamage < defenderMaxHp;

    if (!survives) return false;

    // 条件2：防守方攻击范围能打到原攻击者
    const defenderRange = this.getHeroAttackRange(defenderCard, gameState);
    const defenderHex = pixelToHex(defenderToken.x, defenderToken.y);
    const attackerHex = pixelToHex(attackerToken.x, attackerToken.y);
    
    return isTargetInAttackRange(defenderHex, attackerHex, defenderRange, gameState);
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
    const attackerToken = gameState.tokens.find(t => t.boundToCardId === attacker.id);
    let damage = attackerToken ? SkillEngine.getModifiedStat(attackerToken.id, 'atk', gameState) : 1;
    if (damage === 0) damage = 1; // 至少造成1点伤害 (At least 1 damage)

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

    // Apply shield reduction
    if (defender) {
      const defenderToken = gameState.tokens.find(t => t.boundToCardId === defender.id);
      if (defenderToken && gameState.statuses?.some(s => s.tokenId === defenderToken.id && s.status === 'shield')) {
        damage = Math.max(0, damage - 1);
      }
    }

    return damage;
  }

  /**
   * 检查英雄是否阵亡
   */
  static isHeroDead(hero: TableCard, gameState: GameState): boolean {
    if (!hero.heroClass || !hero.level) return false;
    const maxHP = this.getHeroMaxHp(hero, gameState);
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
