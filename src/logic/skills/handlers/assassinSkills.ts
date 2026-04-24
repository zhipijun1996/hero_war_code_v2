import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';
import { getHexDistance, hexToPixel, pixelToHex } from '../../../shared/utils/hexUtils.ts';

export const assassinPierceSlash: SkillDefinition = {
  id: 'assassin_pierce_slash',
  name: '穿身斩',
  description: '主动技：选择一名相邻敌方单位。若其背后相邻区域为空，你可以移动至该区域，并对其进行一次攻击。',
  kind: 'active',
  targetType: 'token',
  
  getValidTargets: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return [];

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const validTargets: string[] = [];

    // 检查是否有位置的辅助函数
    const isHexEmpty = (q: number, r: number) => {
      // 检查地图范围 (假设 4x4x4 的六边形地图)
      const inBounds = Math.abs(q) <= 4 && Math.abs(r) <= 4 && Math.abs(-q - r) <= 4;
      if (!inBounds) return false;

      // 检查障碍物 (crystal, obstacles, obstacles_v2)
      const mapConfig = gameState.mapConfig;
      if (mapConfig) {
        if (mapConfig.crystal?.some(c => c.q === q && c.r === r)) return false;
        if (mapConfig.obstacles?.some(c => c.q === q && c.r === r)) return false;
        if (mapConfig.obstacles_v2?.some(c => c.q === q && c.r === r)) return false;
        // 城堡也不能站
        if (mapConfig.castles?.[0]?.some(c => c.q === q && c.r === r)) return false;
        if (mapConfig.castles?.[1]?.some(c => c.q === q && c.r === r)) return false;
      }
      
      // 检查冰柱
      if (gameState.icePillars?.some(p => p.q === q && p.r === r)) return false;

      // 检查其他 token
      const hasHero = gameState.tokens.some(t => {
        const hex = pixelToHex(t.x, t.y);
        return hex.q === q && hex.r === r;
      });
      if (hasHero) return false;

      // 检查是否有活着的怪物
      const hasMonster = gameState.map?.monsters?.some(m => {
        if (m.q !== q || m.r !== r) return false;
        const pos = hexToPixel(m.q, m.r);
        const isDead = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
        return !isDead;
      });
      if (hasMonster) return false;

      return true;
    };

    // 检查敌方英雄
    for (const token of gameState.tokens) {
      if (token.id === sourceTokenId) continue;
      if (!token.heroClass) continue;
      
      const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
      if (!card) continue;
      const ownerIndex = card.y > 0 ? 0 : 1;
      if (ownerIndex === playerIndex) continue;

      const targetHex = pixelToHex(token.x, token.y);
      if (getHexDistance(sourceHex, targetHex) === 1) {
        // 计算其背后区域坐标
        // 向量：source -> target => (Tq - Sq, Tr - Sr)
        // 背后区域：target -> back => Tq + (Tq - Sq), Tr + (Tr - Sr)
        const backQ = targetHex.q + (targetHex.q - sourceHex.q);
        const backR = targetHex.r + (targetHex.r - sourceHex.r);
        
        if (isHexEmpty(backQ, backR)) {
          validTargets.push(token.id);
        }
      }
    }

    // 检查敌方怪物
    if (gameState.map && gameState.map.monsters) {
      for (const monster of gameState.map.monsters) {
        const pos = hexToPixel(monster.q, monster.r);
        const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
        if (hasTimer) continue; // Monster is dead/respawning

        const targetHex = { q: monster.q, r: monster.r };
        if (getHexDistance(sourceHex, targetHex) === 1) {
          const backQ = targetHex.q + (targetHex.q - sourceHex.q);
          const backR = targetHex.r + (targetHex.r - sourceHex.r);
          
          if (isHexEmpty(backQ, backR)) {
            validTargets.push(`monster_${monster.q}_${monster.r}`);
          }
        }
      }
    }

    // 检查冰柱 (Ice Pillars)
    if (gameState.icePillars) {
      for (const pillar of gameState.icePillars) {
        const targetHex = { q: pillar.q, r: pillar.r };
        if (getHexDistance(sourceHex, targetHex) === 1) {
          const backQ = targetHex.q + (targetHex.q - sourceHex.q);
          const backR = targetHex.r + (targetHex.r - sourceHex.r);
          
          if (isHexEmpty(backQ, backR)) {
            validTargets.push(`icepillar_${pillar.q}_${pillar.r}`);
          }
        }
      }
    }

    return validTargets;
  },

  canUse: (context: SkillContext) => {
    const targets = assassinPierceSlash.getValidTargets!(context);
    if (targets.length === 0) {
      return { canUse: false, reason: '没有满足施放条件的相邻敌方目标（需要其背后有空格）。' };
    }
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, targetTokenId, targetHex: payloadTargetHex } = context;
    
    // 获取当前所有合法目标，用于二次校验
    const validTargetIds = assassinPierceSlash.getValidTargets!(context);

    // Determine target from either targetTokenId or targetHex
    let resolvedTargetTokenId = targetTokenId;
    if (!resolvedTargetTokenId && payloadTargetHex) {
      const heroToken = gameState.tokens.find(t => {
        const hex = pixelToHex(t.x, t.y);
        return hex.q === payloadTargetHex.q && hex.r === payloadTargetHex.r;
      });
      if (heroToken) {
        resolvedTargetTokenId = heroToken.id;
      } else {
        // Check monsters
        const monster = gameState.map?.monsters?.find(m => {
          if (m.q !== payloadTargetHex.q || m.r !== payloadTargetHex.r) return false;
          const pos = hexToPixel(m.q, m.r);
          const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
          return !hasTimer;
        });
        if (monster) {
          resolvedTargetTokenId = `monster_${monster.q}_${monster.r}`;
        } else {
          // Check ice pillars
          const pillar = gameState.icePillars?.find(p => p.q === payloadTargetHex.q && p.r === payloadTargetHex.r);
          if (pillar) {
            resolvedTargetTokenId = `icepillar_${pillar.q}_${pillar.r}`;
          }
        }
      }
    }

    // 二次校验：所选目标必须在合法目标列表中
    if (!resolvedTargetTokenId || !validTargetIds.includes(resolvedTargetTokenId)) {
      return { success: false, reason: '非法目标：目标背后没有可落位的区域或已超出边界。' };
    }

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return { success: false, reason: '找不到施法者。' };

    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken.boundToCardId);
    if (!sourceCard) return { success: false, reason: '找不到施法者卡牌。' };

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    
    // Calculate target hex
    let targetHex: { q: number, r: number } | null = null;
    let isMonster = false;
    let isIcePillar = false;

    if (resolvedTargetTokenId.startsWith('monster_')) {
      isMonster = true;
      const parts = resolvedTargetTokenId.split('_');
      targetHex = { q: parseInt(parts[1]), r: parseInt(parts[2]) };
    } else if (resolvedTargetTokenId.startsWith('icepillar_')) {
      isIcePillar = true;
      const parts = resolvedTargetTokenId.split('_');
      targetHex = { q: parseInt(parts[1]), r: parseInt(parts[2]) };
    } else {
      const targetToken = gameState.tokens.find(t => t.id === resolvedTargetTokenId || t.boundToCardId === resolvedTargetTokenId);
      if (targetToken) {
        targetHex = pixelToHex(targetToken.x, targetToken.y);
      }
    }

    if (!targetHex) return { success: false, reason: '找不到目标位置。' };

    // 计算背后坐标并位移
    const backQ = targetHex.q + (targetHex.q - sourceHex.q);
    const backR = targetHex.r + (targetHex.r - sourceHex.r);
    
    const newPos = hexToPixel(backQ, backR);
    sourceToken.x = newPos.x;
    sourceToken.y = newPos.y;
    helpers.addLog(`刺客使用【穿身斩】，瞬移到了目标背后。`, playerIndex);

    // 发起攻击流程
    // 记录发起技能的 ID，用于战斗结算后的回调
    gameState.combatInitiatingSkillId = 'assassin_pierce_slash';
    gameState.selectedTokenId = sourceTokenId;

    if (isMonster) {
      const { CombatLogic } = await import('../../combat/combatLogic.ts');
      gameState.selectedTargetId = resolvedTargetTokenId;
      await CombatLogic.resolveMonsterAttack(gameState, playerIndex, targetHex.q, targetHex.r, helpers as any);
      return { success: true };
    } else if (isIcePillar) {
      const { CombatLogic } = await import('../../combat/combatLogic.ts');
      helpers.addLog(`刺客对冰柱发起了【穿身斩】。`, playerIndex);
      // 直接触发怪物/环境目标的攻击结算
      await CombatLogic.resolveMonsterAttack(gameState, playerIndex, targetHex.q, targetHex.r, helpers as any);
      return { success: true };
    } else {
      const targetToken = gameState.tokens.find(t => t.id === resolvedTargetTokenId || t.boundToCardId === resolvedTargetTokenId);
      const targetCard = gameState.tableCards.find(c => c.id === targetToken?.boundToCardId);
      if (!targetToken || !targetCard) return { success: false, reason: '找不到英雄目标。' };

      helpers.addLog(`发起阶段: ${sourceCard.heroClass} 对 ${targetCard.heroClass} 发起了【穿身斩】攻击`, playerIndex);

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
  }
};
