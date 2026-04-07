import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';
import { getHexDistance, hexToPixel, pixelToHex } from '../../../shared/utils/hexUtils.ts';
import { applyKnockback } from '../../combat/combatUtils.ts';

function getLinePath(start: {q: number, r: number}, end: {q: number, r: number}): {q: number, r: number}[] | null {
  const s1 = -start.q - start.r;
  const s2 = -end.q - end.r;
  if (start.q !== end.q && start.r !== end.r && s1 !== s2) return null;

  const dist = Math.max(Math.abs(start.q - end.q), Math.abs(start.r - end.r), Math.abs(s1 - s2));
  if (dist === 0) return [];

  const dq = (end.q - start.q) / dist;
  const dr = (end.r - start.r) / dist;

  const path = [];
  for (let i = 1; i < dist; i++) {
    path.push({ q: start.q + dq * i, r: start.r + dr * i });
  }
  return path;
}

function getValidDashTargets(context: SkillContext, maxDist: number): string[] {
  const { gameState, playerIndex, sourceTokenId } = context;
  const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
  if (!sourceToken) return [];

  const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
  const validTargets: string[] = [];

  for (const token of gameState.tokens) {
    if (token.id === sourceTokenId || !token.heroClass) continue;
    const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
    if (!card) continue;
    const ownerIndex = card.y > 0 ? 0 : 1;
    if (ownerIndex === playerIndex) continue;

    const hasTimer = gameState.counters.some(c => c.type === 'time' && c.boundToCardId === card.id);
    if (hasTimer) continue;

    const targetHex = pixelToHex(token.x, token.y);
    const dist = getHexDistance(sourceHex, targetHex);
    if (dist < 1 || dist > maxDist) continue;

    const path = getLinePath(sourceHex, targetHex);
    if (!path) continue;

    let isClear = true;
    for (const p of path) {
      if (gameState.tokens.some(t => {
        const th = pixelToHex(t.x, t.y);
        return th.q === p.q && th.r === p.r;
      })) { isClear = false; break; }
      
      if (gameState.map?.monsters?.some(m => m.q === p.q && m.r === p.r)) {
        const pos = hexToPixel(p.q, p.r);
        const hasMonsterTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
        if (!hasMonsterTimer) {
          isClear = false; break;
        }
      }
    }

    if (isClear) validTargets.push(token.id);
  }

  if (gameState.map?.monsters) {
    for (const monster of gameState.map.monsters) {
      const pos = hexToPixel(monster.q, monster.r);
      const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
      if (hasTimer) continue;

      const targetHex = { q: monster.q, r: monster.r };
      const dist = getHexDistance(sourceHex, targetHex);
      if (dist < 1 || dist > maxDist) continue;

      const path = getLinePath(sourceHex, targetHex);
      if (!path) continue;

      let isClear = true;
      for (const p of path) {
        if (gameState.tokens.some(t => {
          const th = pixelToHex(t.x, t.y);
          return th.q === p.q && th.r === p.r;
        })) { isClear = false; break; }
        
        if (gameState.map?.monsters?.some(m => m.q === p.q && m.r === p.r)) {
          const mPos = hexToPixel(p.q, p.r);
          const hasMonsterTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - mPos.x) < 10 && Math.abs(c.y - mPos.y) < 10);
          if (!hasMonsterTimer) {
            isClear = false; break;
          }
        }
      }

      if (isClear) validTargets.push(`monster_${monster.q}_${monster.r}`);
    }
  }

  return validTargets;
}

async function executeDashSkill(context: SkillContext, helpers: SkillHelpers, skillId: string): Promise<SkillResult> {
  const { gameState, playerIndex, sourceTokenId, targetTokenId } = context;
  
  let resolvedTargetTokenId = targetTokenId;
  if (!resolvedTargetTokenId && context.targetHex) {
    const { q, r } = context.targetHex;
    const heroToken = gameState.tokens.find(t => {
      const hex = pixelToHex(t.x, t.y);
      return hex.q === q && hex.r === r;
    });
    if (heroToken) {
      resolvedTargetTokenId = heroToken.id;
    } else {
      const monster = gameState.map?.monsters?.find(m => {
        if (m.q !== q || m.r !== r) return false;
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

  const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
  let targetHex: {q: number, r: number};
  let isMonster = false;

  if (resolvedTargetTokenId.startsWith('monster_')) {
    isMonster = true;
    const parts = resolvedTargetTokenId.split('_');
    targetHex = { q: parseInt(parts[1]), r: parseInt(parts[2]) };
  } else {
    const targetToken = gameState.tokens.find(t => t.id === resolvedTargetTokenId);
    if (!targetToken) return { success: false, reason: '找不到目标。' };
    targetHex = pixelToHex(targetToken.x, targetToken.y);
  }

  const dist = getHexDistance(sourceHex, targetHex);

  if (dist > 1) {
    const dq = (targetHex.q - sourceHex.q) / dist;
    const dr = (targetHex.r - sourceHex.r) / dist;
    const landHex = { q: targetHex.q - dq, r: targetHex.r - dr };
    const landPos = hexToPixel(landHex.q, landHex.r);
    sourceToken.x = landPos.x;
    sourceToken.y = landPos.y;
    helpers.addLog(`${sourceCard.heroClass} 冲锋到了目标面前！`, playerIndex);
  }

  gameState.combatInitiatingSkillId = `${skillId}|dist:${dist}`;
  gameState.selectedTokenId = sourceTokenId;
  gameState.selectedTargetId = resolvedTargetTokenId;

  if (isMonster) {
    const { CombatLogic } = await import('../../combat/combatLogic.ts');
    await CombatLogic.resolveMonsterAttack(gameState, playerIndex, targetHex.q, targetHex.r, helpers as any);
    return { success: true };
  } else {
    const targetToken = gameState.tokens.find(t => t.id === resolvedTargetTokenId);
    const targetCard = gameState.tableCards.find(c => c.id === targetToken?.boundToCardId);
    if (!targetCard) return { success: false, reason: '找不到目标卡牌。' };

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
    
    helpers.addLog(`发起阶段: ${sourceCard.heroClass} 对 ${targetCard.heroClass} 发起了冲撞攻击！`, playerIndex);
    helpers.addLog(`请玩家${gameState.activePlayerIndex + 1}打出防御卡，或选择Pass`, gameState.activePlayerIndex);

    return { success: true };
  }
}

export const berserkerLinearDash: SkillDefinition = {
  id: 'berserker_linear_dash',
  name: '直线冲撞',
  description: '选择一名与你同一直线、距离 1~2 的敌方英雄。移动至其相邻格，并对其进行一次攻击。',
  kind: 'active',
  targetType: 'token',
  
  getValidTargets: (context: SkillContext) => getValidDashTargets(context, 2),
  
  canUse: (context: SkillContext) => {
    const targets = getValidDashTargets(context, 2);
    if (targets.length === 0) return { canUse: false, reason: '没有合法的冲撞目标。' };
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    return executeDashSkill(context, helpers, 'berserker_linear_dash');
  },

  afterCombat: async (context: SkillContext, combatDetails: any, helpers: SkillHelpers): Promise<void> => {
    // Lv1 只有攻击，没有击退
  }
};

export const berserkerAssaultDash: SkillDefinition = {
  id: 'berserker_assault_dash',
  name: '强袭冲撞',
  description: '选择一名与你同一直线、距离 1~3 的敌方英雄。移动至其相邻格，并对其进行一次攻击。若其与你初始距离＜3，无论是否被防御，其后退 1 格。',
  kind: 'active',
  targetType: 'token',
  
  getValidTargets: (context: SkillContext) => getValidDashTargets(context, 3),
  
  canUse: (context: SkillContext) => {
    const targets = getValidDashTargets(context, 3);
    if (targets.length === 0) return { canUse: false, reason: '没有合法的冲撞目标。' };
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    return executeDashSkill(context, helpers, 'berserker_assault_dash');
  },

  afterCombat: async (context: SkillContext, combatDetails: any, helpers: SkillHelpers): Promise<void> => {
    const { gameState, playerIndex, sourceTokenId, targetTokenId } = context;
    if (!targetTokenId) return;

    const rawId = gameState.combatInitiatingSkillId || '';
    const match = rawId.match(/dist:(\d+)/);
    const initialDist = match ? parseInt(match[1]) : 1;

    if (initialDist < 3) {
      const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
      if (!sourceToken) return;
      const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);

      // 无论是否被防御，目标后退 1 格
      await applyKnockback(gameState, sourceHex, targetTokenId, 1, helpers, playerIndex);
    }
  }
};

export const berserkerFormationBreakingDash: SkillDefinition = {
  id: 'berserker_formation_breaking_dash',
  name: '裂阵冲撞',
  description: '选择一名与你同一直线、距离 1~3 的敌方单位。移动至其相邻格，并对其进行一次攻击。无论是否被防御，其后退 1 格；与其相邻的其他敌方单位各后退 1 格。',
  kind: 'active',
  targetType: 'token',
  
  getValidTargets: (context: SkillContext) => getValidDashTargets(context, 3),
  
  canUse: (context: SkillContext) => {
    const targets = getValidDashTargets(context, 3);
    if (targets.length === 0) return { canUse: false, reason: '没有合法的冲撞目标。' };
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    return executeDashSkill(context, helpers, 'berserker_formation_breaking_dash');
  },

  afterCombat: async (context: SkillContext, combatDetails: any, helpers: SkillHelpers): Promise<void> => {
    const { gameState, playerIndex, sourceTokenId, targetTokenId } = context;
    if (!targetTokenId) return;

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return;
    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);

    let targetHexBeforeKnockback: {q: number, r: number} | null = null;
    let isMonster = false;
    let monster: any = null;
    let targetToken: any = null;

    if (targetTokenId.startsWith('monster_')) {
      isMonster = true;
      const parts = targetTokenId.split('_');
      const q = parseInt(parts[1]);
      const r = parseInt(parts[2]);
      targetHexBeforeKnockback = { q, r };
      monster = gameState.map?.monsters?.find(m => m.q === q && m.r === r);
    } else {
      targetToken = gameState.tokens.find(t => t.id === targetTokenId);
      if (targetToken) {
        targetHexBeforeKnockback = pixelToHex(targetToken.x, targetToken.y);
      }
    }

    if (!targetHexBeforeKnockback) return;

    // 无论初始距离多少，主目标后退 1 格
    const actualDistance = await applyKnockback(gameState, sourceHex, targetTokenId, 1, helpers, playerIndex);

    let targetHexAfterKnockback = { ...targetHexBeforeKnockback };
    if (actualDistance > 0) {
      if (isMonster && monster) {
        targetHexAfterKnockback = { q: monster.q, r: monster.r };
      } else if (targetToken) {
        targetHexAfterKnockback = pixelToHex(targetToken.x, targetToken.y);
      }
    }

    // 溅射击退
    // 获取主目标（被击退后的位置）周围 6 个相邻格子
    const adjacentHexes = [
      { q: targetHexAfterKnockback.q + 1, r: targetHexAfterKnockback.r },
      { q: targetHexAfterKnockback.q + 1, r: targetHexAfterKnockback.r - 1 },
      { q: targetHexAfterKnockback.q, r: targetHexAfterKnockback.r - 1 },
      { q: targetHexAfterKnockback.q - 1, r: targetHexAfterKnockback.r },
      { q: targetHexAfterKnockback.q - 1, r: targetHexAfterKnockback.r + 1 },
      { q: targetHexAfterKnockback.q, r: targetHexAfterKnockback.r + 1 }
    ];

    // 查找是否存在其他敌方单位
    for (const adjHex of adjacentHexes) {
      // 检查敌方英雄
      const enemyHeroToken = gameState.tokens.find(t => {
        if (t.id === sourceTokenId || t.id === targetTokenId || !t.heroClass) return false;
        const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
        if (!card) return false;
        const ownerIndex = card.y > 0 ? 0 : 1;
        if (ownerIndex === playerIndex) return false;
        
        const hasTimer = gameState.counters.some(c => c.type === 'time' && c.boundToCardId === card.id);
        if (hasTimer) return false;

        const hex = pixelToHex(t.x, t.y);
        return hex.q === adjHex.q && hex.r === adjHex.r;
      });

      if (enemyHeroToken) {
        await applyKnockback(gameState, targetHexAfterKnockback, enemyHeroToken.id, 1, helpers, playerIndex);
        continue;
      }

      // 检查怪物
      const enemyMonster = gameState.map?.monsters?.find(m => {
        if (m.q !== adjHex.q || m.r !== adjHex.r) return false;
        // 排除主目标怪物
        if (isMonster && monster && m.q === monster.q && m.r === monster.r) return false;
        
        const pos = hexToPixel(m.q, m.r);
        const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
        return !hasTimer;
      });

      if (enemyMonster) {
        await applyKnockback(gameState, targetHexAfterKnockback, `monster_${enemyMonster.q}_${enemyMonster.r}`, 1, helpers, playerIndex);
      }
    }
  }
};
