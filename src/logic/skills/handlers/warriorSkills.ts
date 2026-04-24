import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';
import { getHexDistance, hexToPixel, pixelToHex } from '../../../shared/utils/hexUtils.ts';
import { applyKnockback } from '../../combat/combatUtils.ts';

export const warriorKnockbackSlash: SkillDefinition = {
  id: 'warrior_knockback_slash',
  name: '击退斩',
  description: '对相邻敌方英雄进行攻击，攻击成功后将其沿直线推开 1 格',
  kind: 'active',
  targetType: 'token',
  
  getValidTargets: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return [];

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const validTargets: string[] = [];

    // Check enemy heroes
    for (const token of gameState.tokens) {
      if (token.id === sourceTokenId) continue;
      if (!token.heroClass) continue;
      
      const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
      if (!card) continue;
      const ownerIndex = card.y > 0 ? 0 : 1;
      if (ownerIndex === playerIndex) continue;

      const targetHex = pixelToHex(token.x, token.y);
      if (getHexDistance(sourceHex, targetHex) === 1) {
        validTargets.push(token.id);
      }
    }

    // Check monsters
    if (gameState.map && gameState.map.monsters) {
      for (const monster of gameState.map.monsters) {
        const pos = hexToPixel(monster.q, monster.r);
        const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
        if (hasTimer) continue; // Monster is dead/respawning

        const targetHex = { q: monster.q, r: monster.r };
        if (getHexDistance(sourceHex, targetHex) === 1) {
          validTargets.push(`monster_${monster.q}_${monster.r}`);
        }
      }
    }

    return validTargets;
  },

  canUse: (context: SkillContext) => {
    const targets = warriorKnockbackSlash.getValidTargets!(context);
    if (targets.length === 0) {
      return { canUse: false, reason: '没有相邻的敌方目标。' };
    }
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, targetTokenId, targetHex: payloadTargetHex } = context;
    
    // Determine target from either targetTokenId or targetHex
    let resolvedTargetTokenId = targetTokenId;
    if (!resolvedTargetTokenId && payloadTargetHex) {
      // Check if there's a hero token at targetHex
      const heroToken = gameState.tokens.find(t => {
        const hex = pixelToHex(t.x, t.y);
        return hex.q === payloadTargetHex.q && hex.r === payloadTargetHex.r;
      });
      if (heroToken) {
        resolvedTargetTokenId = heroToken.id;
      } else {
        // Check if there's a monster at targetHex
        const monster = gameState.map?.monsters?.find(m => {
          if (m.q !== payloadTargetHex.q || m.r !== payloadTargetHex.r) return false;
          const pos = hexToPixel(m.q, m.r);
          const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
          return !hasTimer;
        });
        if (monster) {
          resolvedTargetTokenId = `monster_${monster.q}_${monster.r}`;
        }
      }
    }

    if (!resolvedTargetTokenId) return { success: false, reason: '未选择目标。' };

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return { success: false, reason: '找不到施法者。' };

    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken.boundToCardId);
    if (!sourceCard) return { success: false, reason: '找不到施法者卡牌。' };

    // 记录发起技能的 ID，用于战斗结算后的回调
    gameState.combatInitiatingSkillId = 'warrior_knockback_slash';
    gameState.selectedTokenId = sourceTokenId;

    if (resolvedTargetTokenId.startsWith('monster_')) {
      const parts = resolvedTargetTokenId.split('_');
      const q = parseInt(parts[1]);
      const r = parseInt(parts[2]);
      
      const { CombatLogic } = await import('../../combat/combatLogic.ts');
      // 设置目标 ID，用于 afterCombat 回调
      gameState.selectedTargetId = resolvedTargetTokenId;
      await CombatLogic.resolveMonsterAttack(gameState, playerIndex, q, r, helpers as any);
      
      return { success: true };
    } else {
      const targetToken = gameState.tokens.find(t => t.id === resolvedTargetTokenId || t.boundToCardId === resolvedTargetTokenId);
      const targetCard = gameState.tableCards.find(c => c.id === targetToken?.boundToCardId);
      
      if (!targetToken || !targetCard) return { success: false, reason: '找不到目标。' };

      // 发起对英雄的攻击流程
      helpers.addLog(`发起阶段: ${sourceCard.heroClass} 对 ${targetCard.heroClass} 发起了【击退斩】`, playerIndex);

      gameState.selectedTargetId = targetCard.id;
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
      
      return { success: true };
    }
  },

  afterCombat: async (context: SkillContext, combatDetails: any, helpers: SkillHelpers): Promise<void> => {
    const { gameState, playerIndex, sourceTokenId, targetTokenId } = context;
    
    // 如果攻击被防御了，则不触发击退
    if (gameState.isDefended) {
      helpers.addLog(`攻击被防御，击退效果未触发。`, playerIndex);
      return;
    }

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return;

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const resolvedTargetId = targetTokenId || gameState.selectedTargetId || '';
    
    // 获取击退前的目标坐标和是否阵亡
    let targetOriginalHex: { q: number, r: number } | null = null;
    let isTargetDead = false;
    const targetToken = gameState.tokens.find(t => t.id === resolvedTargetId || t.boundToCardId === resolvedTargetId);
    if (targetToken) {
      targetOriginalHex = pixelToHex(targetToken.x, targetToken.y);
      const targetCard = gameState.tableCards.find(c => c.id === targetToken.boundToCardId);
      if (targetCard) {
        isTargetDead = gameState.counters.some(c => c.type === 'time' && c.boundToCardId === targetCard.id);
      }
    } else if (resolvedTargetId.startsWith('monster_')) {
      const parts = resolvedTargetId.split('_');
      const q = parseInt(parts[1]);
      const r = parseInt(parts[2]);
      targetOriginalHex = { q, r };
      
      const monster = gameState.map?.monsters?.find(m => m.q === q && m.r === r);
      if (!monster) {
        isTargetDead = true;
      } else {
        const pos = hexToPixel(q, r);
        isTargetDead = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
      }
    }
    
    // 使用通用击退工具函数
    const actualDistance = await applyKnockback(
      gameState,
      sourceHex,
      resolvedTargetId,
      1, // 击退 1 格
      helpers,
      playerIndex
    );

    // 如果成功推开或击杀，触发 onKnockbackSuccess 事件
    if ((actualDistance > 0 || isTargetDead) && targetOriginalHex) {
      const { SkillEngine } = await import('../skillEngine.ts');
      await SkillEngine.triggerEvent('onKnockbackSuccess', gameState, helpers, {
        sourceTokenId,
        targetOriginalHex,
        initiatingSkillId: 'warrior_knockback_slash'
      });
    }
  }
};

export const warriorPressForward: SkillDefinition = {
  id: 'warrior_press_forward',
  name: '压进击退',
  description: '发动击退斩后，若成功推开或击杀，你可以选择进入其原位。',
  kind: 'semi_passive',
  trigger: 'onKnockbackSuccess',
  
  canUse: (context: SkillContext) => {
    const { sourceTokenId, initiatingSkillId } = context as any;
    // 只有当触发事件的源是自己，且技能是击退斩时才可用
    if (context.sourceTokenId !== sourceTokenId) return false;
    if (initiatingSkillId !== 'warrior_knockback_slash') return false;
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, targetOriginalHex } = context as any;
    
    if (!targetOriginalHex) return { success: false };

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return { success: false };

    // 询问玩家是否压进
    if (helpers.promptPlayer) {
      const confirm = await helpers.promptPlayer(playerIndex, 'confirm_action', {
        message: '是否压进到敌方原位？'
      });
      
      if (confirm) {
        const { hexToPixel } = await import('../../../shared/utils/hexUtils.ts');
        const newPos = hexToPixel(targetOriginalHex.q, targetOriginalHex.r);
        sourceToken.x = newPos.x;
        sourceToken.y = newPos.y;
        
        const sourceCard = gameState.tableCards.find(c => c.id === sourceToken.boundToCardId);
        const heroName = sourceCard?.heroClass || '战士';
        helpers.addLog(`${heroName} 顺势压进，占领了原位！`, playerIndex);
        
        // 如果有地块效果，可以在这里触发 resolveTileEffect，目前先略过
      }
    }

    return { success: true };
  }
};

export const warriorWhirlwindSlash: SkillDefinition = {
  id: 'warrior_whirlwind_slash',
  name: '旋风斩',
  description: '对所有相邻的敌方单位（英雄和怪物）造成 1 点伤害。',
  kind: 'active',
  targetType: 'none',
  
  canUse: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return false;

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    let hasTarget = false;

    // Check enemy heroes
    for (const token of gameState.tokens) {
      if (token.id === sourceTokenId || !token.heroClass) continue;
      const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
      if (!card) continue;
      const ownerIndex = card.y > 0 ? 0 : 1;
      if (ownerIndex === playerIndex) continue;
      
      const hasTimer = gameState.counters.some(c => c.type === 'time' && c.boundToCardId === card.id);
      if (hasTimer) continue;

      const targetHex = pixelToHex(token.x, token.y);
      if (getHexDistance(sourceHex, targetHex) === 1) {
        hasTarget = true;
        break;
      }
    }

    // Check monsters
    if (!hasTarget && gameState.map && gameState.map.monsters) {
      for (const monster of gameState.map.monsters) {
        const pos = hexToPixel(monster.q, monster.r);
        const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
        if (hasTimer) continue;

        const targetHex = { q: monster.q, r: monster.r };
        if (getHexDistance(sourceHex, targetHex) === 1) {
          hasTarget = true;
          break;
        }
      }
    }

    if (!hasTarget) {
      return { canUse: false, reason: '没有相邻的敌方目标。' };
    }
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return { success: false };
    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken.boundToCardId);
    if (!sourceCard) return { success: false };

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const { CombatLogic } = await import('../../combat/combatLogic.ts');
    const { SkillEngine } = await import('../skillEngine.ts');
    const { generateId } = await import('../../../shared/utils/hexUtils.ts');

    helpers.addLog(`${sourceCard.heroClass} 发动了【旋风斩】！`, playerIndex);

    let hitCount = 0;

    // 1. 伤害相邻敌方英雄
    for (const token of gameState.tokens) {
      if (token.id === sourceTokenId || !token.heroClass) continue;
      const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
      if (!card) continue;
      const ownerIndex = card.y > 0 ? 0 : 1;
      if (ownerIndex === playerIndex) continue;
      
      const hasTimer = gameState.counters.some(c => c.type === 'time' && c.boundToCardId === card.id);
      if (hasTimer) continue;

      const targetHex = pixelToHex(token.x, token.y);
      if (getHexDistance(sourceHex, targetHex) === 1) {
        hitCount++;
        await CombatLogic.applySpellDamageToHero(
          gameState,
          card,
          token,
          1,
          sourceTokenId,
          playerIndex,
          helpers as any,
          '旋风斩'
        );
      }
    }

    // 2. 伤害相邻怪物
    if (gameState.map && gameState.map.monsters) {
      for (const monster of gameState.map.monsters) {
        const targetHex = { q: monster.q, r: monster.r };
        if (getHexDistance(sourceHex, targetHex) === 1) {
          hitCount++;
          await CombatLogic.applySpellDamageToMonster(
             gameState,
             monster,
             1,
             sourceTokenId,
             playerIndex,
             helpers as any,
             '旋风斩'
          );
        }
      }
    }

    if (hitCount === 0) {
      helpers.addLog(`旋风斩挥空了！`, playerIndex);
    }

    return { success: true };
  }
};
