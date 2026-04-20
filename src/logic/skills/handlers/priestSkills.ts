import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';
import { getHexDistance, pixelToHex, hexToPixel } from '../../../shared/utils/hexUtils.ts';
import { CombatLogic } from '../../combat/combatLogic.ts';

export const heal: SkillDefinition = {
  id: 'heal',
  name: '治疗',
  description: '选择 2 格内一名友方英雄，其回复 1 点生命并移动 1 格。',
  kind: 'active',
  targetType: 'token',
  
  canUse: (context: SkillContext) => {
    return true;
  },

  getValidTargets: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return [];

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const validTargets: string[] = [];

    gameState.tokens.forEach(t => {
      const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
      if (!card) return;

      // Check if ally
      const isAlly = playerIndex === 0 ? card.y > 0 : card.y < 0;
      if (!isAlly) return;

      // Check distance <= 2
      const targetHex = pixelToHex(t.x, t.y);
      const dist = getHexDistance(sourceHex, targetHex);
      if (dist <= 2) {
        validTargets.push(t.id);
      }
    });

    return validTargets;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, targetTokenId } = context;
    
    if (!targetTokenId) {
      return { success: false, reason: '未选择目标' };
    }

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const targetToken = gameState.tokens.find(t => t.id === targetTokenId);
    
    if (!sourceToken || !targetToken) return { success: false };

    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken.boundToCardId);
    const targetCard = gameState.tableCards.find(c => c.id === targetToken.boundToCardId);

    if (!sourceCard || !targetCard) return { success: false };

    // Validate range (fixed to 2)
    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const targetHex = pixelToHex(targetToken.x, targetToken.y);
    const dist = getHexDistance(sourceHex, targetHex);

    if (dist > 2) {
      return { success: false, reason: '目标不在2格范围内' };
    }

    // Validate ally
    const sourceOwnerIndex = sourceCard.y > 0 ? 0 : 1;
    const targetOwnerIndex = targetCard.y > 0 ? 0 : 1;
    if (sourceOwnerIndex !== targetOwnerIndex) {
      return { success: false, reason: '只能治疗友方单位' };
    }

    // Heal
    const maxHp = CombatLogic.getHeroMaxHp(targetCard, gameState);
    let healed = false;
    if ((targetCard.damage || 0) > 0) {
      targetCard.damage = Math.max(0, (targetCard.damage || 0) - 1);
      
      const damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === targetCard.id);
      if (damageCounter) {
        damageCounter.value = targetCard.damage;
      }
      healed = true;
    }

    helpers.addLog(`${sourceCard.heroClass} 发动了【治疗】，${healed ? `恢复了 ${targetCard.heroClass} 1点生命值，并` : ''}让其移动 1 格！`, playerIndex);
    helpers.broadcastState();
    
    if (helpers.promptPlayer) {
      // Calculate reachable cells for the target token (1 hex)
      const { getReachableHexes } = await import('../../map/mapLogic.ts');
      const targetHex = pixelToHex(targetToken.x, targetToken.y);
      gameState.reachableCells = getReachableHexes(targetHex, 1, targetOwnerIndex, gameState);

      // Prompt the target's owner to move the healed unit
      const response = await helpers.promptPlayer(targetOwnerIndex, 'heal_move', {
        message: `${sourceCard.heroClass} 对你发动了【治疗】！你可以让 ${targetCard.heroClass} 移动 1 格。`,
        sourceTokenId,
        targetTokenId
      });

      gameState.reachableCells = []; // Clear after prompt

      if (response && response.targetHex) {
        // Move the target
        const { q, r } = response.targetHex;
        const pos = hexToPixel(q, r);
        targetToken.x = pos.x;
        targetToken.y = pos.y;
        
        helpers.addLog(`${targetCard.heroClass} 移动了 1 格！`, targetOwnerIndex);
        helpers.broadcastState();
      }
    }

    return { success: true };
  }
};

export const holy_prayer: SkillDefinition = {
  id: 'holy_prayer',
  name: '神圣祈愿',
  description: '每回合只能使用一次。依次结算一次【治疗】与一次【圣盾】，不能选择同一个目标。',
  kind: 'active',
  targetType: 'none',

  canUse: (context: SkillContext) => {
    const { gameState, playerIndex } = context;
    const used = gameState.roundActionCounts?.[`holy_prayer_used_${playerIndex}`];
    if (used) return { canUse: false, reason: '每回合只能使用一次神圣祈愿。' };
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return { success: false };

    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken.boundToCardId);
    if (!sourceCard) return { success: false };

    // 1. Mark as used
    if (!gameState.roundActionCounts) gameState.roundActionCounts = {};
    gameState.roundActionCounts[`holy_prayer_used_${playerIndex}`] = 1;

    helpers.addLog(`${sourceCard.heroClass} 发动了【神圣祈愿】！`, playerIndex);

    if (!helpers.promptPlayer) {
      return { success: false, reason: '无法进行交互选择' };
    }

    // 2. Select Heal Target
    const healTargets = heal.getValidTargets!(context);
    if (healTargets.length === 0) {
      helpers.addLog(`没有合法的治疗目标，跳过治疗阶段。`, playerIndex);
    } else {
      // Highlight heal targets
      const originalReachable = gameState.reachableCells;
      gameState.reachableCells = healTargets.map(id => {
        const t = gameState.tokens.find(tok => tok.id === id);
        return t ? pixelToHex(t.x, t.y) : null;
      }).filter(h => h !== null) as { q: number, r: number }[];
      helpers.broadcastState();

      const healResponse = await helpers.promptPlayer(playerIndex, 'select_priest_target', {
        message: '请选择【治疗】的目标',
        validTargets: healTargets
      });

      gameState.reachableCells = originalReachable || [];
      helpers.broadcastState();

      if (healResponse && healResponse.targetTokenId) {
        const targetId = healResponse.targetTokenId;
        await heal.execute({ ...context, targetTokenId: targetId }, helpers);
        
        // 3. Select Shield Target (excluding the first target)
        const shieldTargets = holy_shield.getValidTargets!(context).filter(id => id !== targetId);
        if (shieldTargets.length === 0) {
          helpers.addLog(`没有合法的圣盾目标，跳过圣盾阶段。`, playerIndex);
        } else {
          // Highlight shield targets
          gameState.reachableCells = shieldTargets.map(id => {
            const t = gameState.tokens.find(tok => tok.id === id);
            return t ? pixelToHex(t.x, t.y) : null;
          }).filter(h => h !== null) as { q: number, r: number }[];
          helpers.broadcastState();

          const shieldResponse = await helpers.promptPlayer(playerIndex, 'select_priest_target', {
            message: '请选择【圣盾】的目标',
            validTargets: shieldTargets
          });

          gameState.reachableCells = originalReachable || [];
          helpers.broadcastState();

          if (shieldResponse && shieldResponse.targetTokenId) {
            await holy_shield.execute({ ...context, targetTokenId: shieldResponse.targetTokenId }, helpers);
          }
        }
      } else {
        helpers.addLog(`玩家取消了选择，神圣祈愿中断。`, playerIndex);
      }
    }

    return { success: true };
  }
};

export const holy_shield: SkillDefinition = {
  id: 'holy_shield',
  name: '圣盾',
  description: '选择 2 格内一名友方英雄，其获得护盾并移动 1 格。护盾：不能被推/拉，受到的伤害 -1；受到一次攻击后，护盾破碎。',
  kind: 'active',
  targetType: 'token',
  
  canUse: (context: SkillContext) => {
    return true;
  },

  getValidTargets: heal.getValidTargets, // Reuse the same target validation as heal

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, targetTokenId } = context;
    
    if (!targetTokenId) {
      return { success: false, reason: '未选择目标' };
    }

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const targetToken = gameState.tokens.find(t => t.id === targetTokenId);
    
    if (!sourceToken || !targetToken) return { success: false };

    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken.boundToCardId);
    const targetCard = gameState.tableCards.find(c => c.id === targetToken.boundToCardId);

    if (!sourceCard || !targetCard) return { success: false };

    // Validate range (fixed to 2)
    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const targetHex = pixelToHex(targetToken.x, targetToken.y);
    const dist = getHexDistance(sourceHex, targetHex);

    if (dist > 2) {
      return { success: false, reason: '目标不在2格范围内' };
    }

    // Validate ally
    const sourceOwnerIndex = sourceCard.y > 0 ? 0 : 1;
    const targetOwnerIndex = targetCard.y > 0 ? 0 : 1;
    if (sourceOwnerIndex !== targetOwnerIndex) {
      return { success: false, reason: '只能对友方单位使用' };
    }

    // Apply shield status
    if (!gameState.statuses) {
      gameState.statuses = [];
    }
    
    // Remove existing shield if any (to avoid duplicates)
    gameState.statuses = gameState.statuses.filter(s => !(s.tokenId === targetTokenId && s.status === 'shield'));
    
    gameState.statuses.push({
      tokenId: targetTokenId,
      status: 'shield',
      sourceSkillId: 'holy_shield'
    });

    helpers.addLog(`${sourceCard.heroClass} 发动了【圣盾】，${targetCard.heroClass} 获得了护盾，并可以移动 1 格！`, playerIndex);
    helpers.broadcastState();
    
    if (helpers.promptPlayer) {
      // Calculate reachable cells for the target token (1 hex)
      const { getReachableHexes } = await import('../../map/mapLogic.ts');
      gameState.reachableCells = getReachableHexes(targetHex, 1, targetOwnerIndex, gameState);

      // Prompt the target's owner to move the shielded unit
      const response = await helpers.promptPlayer(targetOwnerIndex, 'heal_move', {
        message: `${sourceCard.heroClass} 对你发动了【圣盾】！你可以让 ${targetCard.heroClass} 移动 1 格。`,
        sourceTokenId,
        targetTokenId
      });

      gameState.reachableCells = []; // Clear after prompt

      if (response && response.targetHex) {
        // Move the target
        const { q, r } = response.targetHex;
        const pos = hexToPixel(q, r);
        targetToken.x = pos.x;
        targetToken.y = pos.y;
        
        helpers.addLog(`${targetCard.heroClass} 移动了 1 格！`, targetOwnerIndex);
        helpers.broadcastState();
      }
    }

    return { success: true };
  }
};
