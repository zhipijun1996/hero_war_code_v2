import { SkillDefinition } from '../types.ts';

export const testActiveSkill: SkillDefinition = {
  id: 'test_active_skill',
  name: '测试主动技能',
  description: '这是一个用于测试技能系统的主动技能。',
  kind: 'active',
  targetType: 'none',
  canUse: (context) => {
    // 只要有 context 就可以使用
    return true;
  },
  execute: (context, helpers) => {
    helpers.addLog(`玩家 ${context.playerIndex + 1} 使用了测试主动技能！`, context.playerIndex);
    return { success: true, reason: 'Skill executed successfully' };
  }
};

export const testTargetSkill: SkillDefinition = {
  id: 'test_target_skill',
  name: '测试目标技能',
  description: '这是一个用于测试技能目标选择的主动技能。',
  kind: 'active',
  targetType: 'hex',
  canUse: (context) => {
    return true;
  },
  execute: (context, helpers) => {
    if (!context.targetHex) {
      return { success: false, reason: '未选择目标格子' };
    }
    helpers.addLog(`玩家 ${context.playerIndex + 1} 对坐标 (${context.targetHex.q}, ${context.targetHex.r}) 使用了目标技能！`, context.playerIndex);
    return { success: true, reason: 'Skill executed successfully' };
  }
};

export const testPassiveSkill: SkillDefinition = {
  id: 'test_passive_skill',
  name: '测试被动技能',
  description: '这是一个用于测试技能系统的被动技能。回合开始时触发。',
  kind: 'passive',
  trigger: 'onTurnStart',
  execute: (context, helpers) => {
    helpers.addLog(`玩家 ${context.playerIndex + 1} 的被动技能触发了！(回合开始)`, context.playerIndex);
    return { success: true };
  }
};

export const testSemiPassiveSkill: SkillDefinition = {
  id: 'test_semi_passive_skill',
  name: '测试半被动技能',
  description: '这是一个用于测试技能系统的半被动技能。受到伤害时触发询问。',
  kind: 'semi_passive',
  trigger: 'onDamageTaken',
  canUse: (context) => {
    if (context.sourceTokenId !== context.eventSourceId) return false;
    if (context.damage <= 0) return false;

    const targetCard = context.gameState.tableCards.find((c: any) => c.id === context.gameState.tokens.find((t: any) => t.id === context.sourceTokenId)?.boundToCardId);
    if (!targetCard) return false;
    
    return true; // 为了方便测试，只要受伤就触发
  },
  execute: async (context, helpers) => {
    if (helpers.promptPlayer) {
      const response = await helpers.promptPlayer(context.playerIndex, 'skill_interrupt', {
        skillId: 'test_semi_passive_skill',
        message: '你受到了伤害，是否使用半被动技能抵消1点伤害？'
      });
      if (response) {
        helpers.addLog(`玩家 ${context.playerIndex + 1} 选择了使用半被动技能，抵消了伤害！`, context.playerIndex);
        // 修改实际的伤害值
        const targetCard = context.gameState.tableCards.find((c: any) => c.id === context.gameState.tokens.find((t: any) => t.id === context.sourceTokenId)?.boundToCardId);
        if (targetCard && targetCard.damage > 0) {
          targetCard.damage -= 1;
          const damageCounter = context.gameState.counters.find((c: any) => c.type === 'damage' && c.boundToCardId === targetCard.id);
          if (damageCounter) {
            damageCounter.value = targetCard.damage;
          }
        }
        return { success: true };
      } else {
        helpers.addLog(`玩家 ${context.playerIndex + 1} 选择了不使用半被动技能。`, context.playerIndex);
        return { success: false, reason: 'Player chose not to use the skill' };
      }
    }
    return { success: false, reason: 'No promptPlayer helper available' };
  }
};
