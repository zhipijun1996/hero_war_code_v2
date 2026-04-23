import { SkillContext, SkillDefinition, SkillHelpers, SkillResult } from '../types.ts';
import { GameState } from '../../../shared/types/index.ts';
import { pixelToHex, hexToPixel, generateId } from '../../../shared/utils/hexUtils.ts';
import { SkillEngine } from '../skillEngine.ts';

/**
 * 判断一个格子是否可以是合法的冰柱生成点
 */
function isValidIcePillarTarget(q: number, r: number, gameState: GameState): boolean {
  // 检查地图范围 (半径 4)
  if (Math.abs(q) > 4 || Math.abs(r) > 4 || Math.abs(-q - r) > 4) return false;

  // 检查已有障碍物
  const isObstacle = gameState.map?.obstacles?.some(o => o.q === q && o.r === r);
  if (isObstacle) return false;
  
  const isWater = gameState.map?.water?.some(w => w.q === q && w.r === r);
  if (isWater) return false;

  const isMonster = gameState.map?.monsters?.some(m => m.q === q && m.r === r);
  if (isMonster) return false;

  const isTrap = gameState.map?.traps?.some(t => t.q === q && t.r === r);
  if (isTrap) return false;

  // 检查所有的 Castle
  const isCastle = gameState.map?.castles?.[0]?.some(c => c.q === q && c.r === r) || 
                   gameState.map?.castles?.[1]?.some(c => c.q === q && c.r === r);
  if (isCastle) return false;

  // 检查其他 Token
  const hasToken = gameState.tokens.some(t => {
    const hex = pixelToHex(t.x, t.y);
    return hex.q === q && hex.r === r;
  });
  if (hasToken) return false;

  // 检查现有冰柱
  const hasIcePillar = gameState.icePillars?.some(p => p.q === q && p.r === r);
  if (hasIcePillar) return false;

  return true;
}

export const iceMageIcePillar: SkillDefinition = {
  id: 'ice_pillar',
  name: '凝冰结阵',
  description: '主动技：在射程内的空地生成1个冰柱。冰柱 HP1，且视为不可通行的路障。英雄从与冰柱相邻的区域移动时，需额外消耗 1 点移动力。场上最多存在 3 个由你召唤的冰柱，超过上限时最早生成的冰柱将被移除。',
  kind: 'active',
  targetType: 'hex',

  canUse: (context: SkillContext) => {
    const { gameState, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return { canUse: false, reason: '找不到施法者。' };
    
    // 基本只是检查是否活口或者能攻击，这里可以不用复杂判定，因为 getValidTargets 会检查。
    return true;
  },

  getValidTargets: (context: SkillContext) => {
    const { gameState, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return [];

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const ar = SkillEngine.getModifiedStat(sourceTokenId, 'ar', gameState);
    
    const validHexes: any[] = [];
    
    // 遍历射程内所有格子
    for (let dq = -ar; dq <= ar; dq++) {
      for (let dr = Math.max(-ar, -dq - ar); dr <= Math.min(ar, -dq + ar); dr++) {
        const targetQ = sourceHex.q + dq;
        const targetR = sourceHex.r + dr;
        
        if (isValidIcePillarTarget(targetQ, targetR, gameState)) {
          validHexes.push({ q: targetQ, r: targetR });
        }
      }
    }
    
    return validHexes;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, targetHex } = context;
    if (!targetHex) return { success: false, reason: '未选择目标区域。' };

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken?.boundToCardId);
    if (!sourceToken || !sourceCard) return { success: false, reason: '找不到施法者。' };

    if (!isValidIcePillarTarget(targetHex.q, targetHex.r, gameState)) {
      return { success: false, reason: '该区域无法生成冰柱。' };
    }

    helpers.addLog(`【${sourceCard.heroClass}】在此处召唤了一座冰柱！`, playerIndex);

    if (!gameState.icePillars) gameState.icePillars = [];

    // 检查数量上限 (属于该玩家/Token的最早冰柱)
    const myPillars = gameState.icePillars.filter(p => p.sourceTokenId === sourceTokenId);
    if (myPillars.length >= 3) {
      // 找到最早的冰柱并移除
      const oldestPillar = myPillars[0]; // js filter 会保持数组原来的顺序
      gameState.icePillars = gameState.icePillars.filter(p => p.id !== oldestPillar.id);
      
      helpers.addLog(`冰柱数量达到上限，最早召唤的冰柱被移除。`, playerIndex);

      // 触发环境被破坏事件
      await SkillEngine.triggerEvent('onTerrainDestroyed', gameState, helpers as any, {
        terrainType: 'ice_pillar',
        terrainId: oldestPillar.id,
        q: oldestPillar.q,
        r: oldestPillar.r,
        ownerIndex: oldestPillar.ownerIndex,
        sourceTokenId: oldestPillar.sourceTokenId,
        cause: 'limit_exceeded'
      });
    }

    gameState.icePillars.push({
      id: generateId(),
      q: targetHex.q,
      r: targetHex.r,
      hp: 1,
      ownerIndex: playerIndex,
      sourceTokenId: sourceTokenId
    });

    gameState.activeSkillState = null;
    gameState.notification = null;

    return { success: true };
  }
};

export const iceMagePillarBurst: SkillDefinition = {
  id: 'pillar_burst',
  name: '冰霜爆裂',
  description: '被动技：当你召唤的冰柱被破坏时，会对与该冰柱相邻格的所有单位（敌我不分/除了冰柱自身）造成 1 点魔法伤害。',
  kind: 'passive',
  trigger: 'onTerrainDestroyed',
  
  canUse: (context: SkillContext) => {
    const { sourceTokenId, terrainType, sourceTokenId: pillarSourceTokenId } = context;
    // 只有当被破坏的是冰柱，且召唤者是自己时才触发
    if (terrainType !== 'ice_pillar' || pillarSourceTokenId !== sourceTokenId) {
      return false;
    }
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, q, r } = context;
    if (q === undefined || r === undefined) return { success: false };

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken?.boundToCardId);
    if (!sourceCard) return { success: false };

    helpers.addLog(`【冰霜爆裂】${sourceCard.heroClass} 召唤的冰柱破碎了！向周围释放了冰霜能量。`, playerIndex);

    // 获取销毁坐标的相邻格子
    const { CombatLogic } = await import('../../combat/combatLogic.ts');

    const directions = [
      { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];

    const neighbors = directions.map(dir => ({ q: q + dir.q, r: r + dir.r }));

    // 波及相邻格的所有单位 (英雄和怪物)
    for (const n of neighbors) {
      const pos = hexToPixel(n.q, n.r);
      
      // 1. 波及怪物
      const monster = gameState.map?.monsters?.find(m => m.q === n.q && m.r === n.r);
      if (monster) {
        await CombatLogic.applySpellDamageToMonster(
          gameState,
          monster,
          1,
          sourceTokenId,
          playerIndex,
          helpers as any,
          '冰霜爆裂'
        );
      }

      // 2. 波及英雄
      const heroTokens = gameState.tokens.filter(t => t.heroClass && Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
      for (const targetToken of heroTokens) {
        const targetCard = gameState.tableCards.find(c => c.id === targetToken.boundToCardId);
        if (targetCard) {
          await CombatLogic.applySpellDamageToHero(
            gameState,
            targetCard,
            targetToken,
            1,
            sourceTokenId,
            playerIndex,
            helpers as any,
            '冰霜爆裂'
          );
        }
      }
    }

    return { success: true };
  }
};

export const iceMageDeepFreeze: SkillDefinition = {
  id: 'deep_freeze',
  name: '深度冻结',
  description: '被动技：深度冻结该英雄下次行动前，第一次受到攻击时伤害 +1，并解除深度冻结；若其未受到攻击，则其下次行动改为“破冰并移动 1 格”。',
  kind: 'passive',
  trigger: 'onTurnStart',

  // 这只是声明占位，真正的深度冻结结算逻辑会下放到 ActionEngine 与 CombatLogic，
  // 因为截断判定比较硬核
};

export const iceMageBlizzard: SkillDefinition = {
  id: 'ice_mage_blizzard',
  name: '暴风雪',
  targetType: 'hex',
  kind: 'active',
  description: '本回合一次，选择一根冰柱，其相邻区域，以及施法者相邻区域，直到你的回合结束视为暴风雪区域。单位在暴风雪区域中结束回合时，获得深度冻结。',
  getValidTargets: (context: SkillContext) => {
    const { gameState } = context;
    if (!gameState.icePillars) return [];
    return gameState.icePillars.map(p => ({ q: p.q, r: p.r }));
  },
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<{ success: boolean; reason?: string }> => {
    const { gameState, targetHex, playerIndex, sourceTokenId } = context;
    if (!targetHex) return { success: false, reason: '未选择冰柱' };

    const pillar = gameState.icePillars?.find(p => p.q === targetHex.q && p.r === targetHex.r);
    if (!pillar) return { success: false, reason: '目标位置没有冰柱' };

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return { success: false, reason: '施法者不存在' };
    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);

    gameState.blizzardZones = {
      sourceHex,
      pillarHex: { q: pillar.q, r: pillar.r },
      playerIndex
    };

    helpers.addLog(`施放暴风雪！施法者及选中冰柱的相邻区域现在是暴风雪区域，直到回合结束。`, playerIndex);

    return { success: true };
  }
};
