import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';
import { getHexDistance, hexToPixel, pixelToHex } from '../../../shared/utils/hexUtils.ts';
import { getReachableHexes } from '../../map/mapLogic.ts';

export const assassinShadowClone: SkillDefinition = {
  id: 'assassin_shadow_clone',
  name: '暗影替身',
  description: '被动技/半被动：你的回合开始时，移除旧暗影，并在你所在区域放置 1 个暗影。暗影 HP1，对敌方视为路障。每回合一次，当你成为攻击目标时，你可以与暗影交换位置，并使该次攻击改为以暗影为目标。',
  kind: 'passive',
  trigger: ['onTurnStart', 'onBeforeAttack'],
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, sourceTokenId, playerIndex, defenderTokenId } = context;
    const heroToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!heroToken) return { success: false };

    // We can differentiate 'onTurnStart' from 'onBeforeAttack' based on whether defenderTokenId is passed
    if (!defenderTokenId) {
      if (!gameState.shadows) gameState.shadows = [];
      
      gameState.shadows = gameState.shadows.filter(s => s.sourceTokenId !== sourceTokenId);
      (heroToken as any).usedShadowCloneSwapThisTurn = false;
      const hHex = pixelToHex(heroToken.x, heroToken.y);
      
      gameState.shadows.push({
        id: `shadow_${sourceTokenId}`,
        sourceTokenId: sourceTokenId,
        ownerIndex: playerIndex,
        q: hHex.q,
        r: hHex.r,
        hp: 1
      });
      
      helpers.addLog(`刺客在场上留下了【暗影替身】。`, playerIndex);
      return { success: true };
    } else {
      if (defenderTokenId !== sourceTokenId) return { success: true };
      if ((heroToken as any).usedShadowCloneSwapThisTurn) return { success: true };
      
      if (!gameState.shadows) return { success: true };
      const shadowIndex = gameState.shadows.findIndex(s => s.sourceTokenId === sourceTokenId && s.hp > 0);
      if (shadowIndex === -1) return { success: true };
      
      const shadow = gameState.shadows[shadowIndex];

      if (helpers.promptPlayer) {
        const swapChoice = await helpers.promptPlayer(playerIndex, 'yes_no', {
          message: '你成为了攻击目标！是否与【暗影替身】交换位置，让暗影承受攻击？',
          yesText: '交换并让暗影承受',
          noText: '不使用'
        });

        if (swapChoice) {
          (heroToken as any).usedShadowCloneSwapThisTurn = true;
          
          const hHex = pixelToHex(heroToken.x, heroToken.y);
          const tempQ = hHex.q;
          const tempR = hHex.r;
          
          const newPos = hexToPixel(shadow.q, shadow.r);
          heroToken.x = newPos.x;
          heroToken.y = newPos.y;

          shadow.q = tempQ;
          shadow.r = tempR;

          shadow.hp = 0;
          
          helpers.addLog(`刺客发动了【暗影替身】，与暗影交换了位置！攻击击中了暗影替身，替身被摧毁！`, playerIndex);
          helpers.broadcastState();

          gameState.phase = 'action_play';
          gameState.notification = null;
          gameState.activeActionType = null;
          gameState.selectedTokenId = null;
          gameState.reachableCells = [];
          gameState.selectedTargetId = null;

          const { ActionEngine } = await import('../../action/actionEngine.ts');
          await ActionEngine.finishAction(gameState, 1 - playerIndex, helpers as any, (helpers as any).socket || {});
          
          return { success: true, data: { interrupt: true } };
        }
      }
    }
    
    return { success: true };
  }
};

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

export const assassinShadowPierce: SkillDefinition = {
  id: 'assassin_shadow_pierce',
  kind: 'active',
  targetType: 'hex',
  name: '影袭穿斩',
  description: '主动技：执行一次移动。若移动后与敌方单位相邻，你可以立即对其使用【穿身斩】或进行攻击。',
  getValidTargets: (context: SkillContext) => {
    const { gameState, sourceTokenId } = context;
    const token = gameState.tokens.find(t => t.id === sourceTokenId || t.boundToCardId === sourceTokenId);
    if (!token) return [];
    
    // We only need valid targets for the first step (the initial movement)
    // The second step targets are handled interactively through prompt
    if (!gameState.activeSkillState) {
      const heroCard = gameState.tableCards.find(c => c.id === token.boundToCardId);
      const tHex = pixelToHex(token.x, token.y);
      return getReachableHexes(
        { q: tHex.q, r: tHex.r },
        heroCard?.level === 1 ? 1 : 2,
        gameState.activePlayerIndex,
        gameState
      );
    }
    return [];
  },
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId } = context;
    const heroToken = gameState.tokens.find(t => t.id === sourceTokenId || t.boundToCardId === sourceTokenId);
    if (!heroToken) return { success: false, reason: '未找到施法者。' };

    const { getReachableHexes, getNeighbors } = await import('../../map/mapLogic.ts');

    if (!gameState.activeSkillState) {
      // Step 1: Move setup
      const heroHex = pixelToHex(heroToken.x, heroToken.y);
      const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
      gameState.reachableCells = getReachableHexes(
        { q: heroHex.q, r: heroHex.r },
        heroCard?.level === 1 ? 1 : 2,
        playerIndex,
        gameState
      );
      gameState.activeSkillState = { step: 1 };
      gameState.phase = 'action_select_skill_target';
      gameState.activeSkillId = 'assassin_stealth_dash';
      return { success: true, inProgress: true };
    }

    if (gameState.activeSkillState?.step === 1) {
      const targetHex = context.targetHex;
      if (!targetHex) return { success: false, reason: '未选择移动目标。' };

      // Make sure the target is valid
      const isValid = (gameState.reachableCells || []).some(
        c => c.q === targetHex.q && c.r === targetHex.r
      );
      if (!isValid) return { success: false, reason: '无效的移动位置。' };

      // Move the token
      const heroHex = pixelToHex(heroToken.x, heroToken.y);
      const { hexToPixel } = await import('../../../shared/utils/hexUtils.ts');
      const newPos = hexToPixel(targetHex.q, targetHex.r);
      heroToken.x = newPos.x;
      heroToken.y = newPos.y;
      
      helpers.addLog(`刺客发动【影袭穿斩】，移动到了目标格。`, playerIndex);
      helpers.broadcastState();

      // Check adjacent enemies
      const neighbors = getNeighbors(targetHex.q, targetHex.r);
      let enemyNearby = false;
      
      for (const hex of neighbors) {
        const token = gameState.tokens.find(t => {
          const tHex = pixelToHex(t.x, t.y);
          return tHex.q === hex.q && tHex.r === hex.r && (t as any).playerIndex !== playerIndex;
        });
        if (token) {
          enemyNearby = true;
          break;
        }
        const monster = gameState.map?.monsters?.find((m: any) => m.q === hex.q && m.r === hex.r && (m as any).level > 0);
        if (monster) {
          enemyNearby = true;
          break;
        }
        const pillar = gameState.icePillars?.find(p => p.q === hex.q && p.r === hex.r);
        if (pillar && pillar.ownerIndex !== playerIndex) {
            enemyNearby = true;
            break;
        }
      }

      if (!enemyNearby) {
        gameState.activeSkillState = null;
        return { success: true };
      }

      // Prompt to choose follow-up action
      const selectedSkillId = await helpers.promptPlayer!(playerIndex, 'select_skill', {
        skills: [
          { id: 'attack', name: '攻击', description: '进行一次普通攻击' },
          { id: 'assassin_pierce_slash', name: '穿身斩', description: '使用主动技能【穿身斩】' },
          { id: 'cancel', name: '不出手', description: '结束技能' }
        ],
        message: '移动后与敌方单位相邻，你可以立即对其使用【穿身斩】或进行攻击。'
      });

      if (!selectedSkillId || selectedSkillId === 'cancel') {
        gameState.activeSkillState = null;
        return { success: true };
      }

      if (selectedSkillId === 'attack') {
        gameState.activeSkillState = null;
        const { getAttackableHexes } = await import('../../map/mapLogic.ts');
        const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
        const heroHex = pixelToHex(heroToken.x, heroToken.y);
        gameState.reachableCells = getAttackableHexes(heroHex.q, heroHex.r, 1, playerIndex, gameState, heroCard?.level || 1);
        gameState.phase = 'action_resolve';
        gameState.activeActionType = 'attack';
        gameState.selectedOption = 'attack';
        gameState.notification = '请选择攻击目标';
        return { success: true, inProgress: true };
      }

      if (selectedSkillId === 'assassin_pierce_slash') {
        gameState.activeSkillState = null;
        const { assassinPierceSlash } = await import('./assassinSkills.ts');
        const validContext = { ...context };
        const validTargets = assassinPierceSlash.getValidTargets!(validContext);
        
        if (validTargets && validTargets.length > 0) {
          const { pixelToHex } = await import('../../../shared/utils/hexUtils.ts');
          gameState.reachableCells = validTargets.map(target => {
            if (typeof target === 'string') {
                if (target.startsWith('monster_') || target.startsWith('icepillar_')) {
                    const parts = target.split('_');
                    return { q: parseInt(parts[1]), r: parseInt(parts[2]) };
                }
                const t = gameState.tokens.find(tok => tok.id === target || tok.boundToCardId === target);
                if (t) return pixelToHex(t.x, t.y);
            } else if (typeof target === 'object' && target !== null && 'q' in target && 'r' in target) {
                return target;
            }
            return null;
          }).filter(Boolean) as { q: number, r: number }[];
          
          gameState.phase = 'action_select_skill_target';
          gameState.activeSkillId = 'assassin_pierce_slash';
          gameState.notification = '请选择穿身斩的目标';
          return { success: true, inProgress: true };
        } else {
          helpers.addLog(`无可用的穿身斩目标，动作结束。`, playerIndex);
          return { success: true };
        }
      }
    }

    return { success: false, reason: '未知的状态' };
  }
};
