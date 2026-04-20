import { SkillContext, SkillHelpers, SkillResult, SkillUseOption, SkillTrigger, StatType } from './types.ts';
import { skillRegistry } from './skillRegistry.ts';
import { HEROES_DATABASE } from '../../shared/config/heroes.ts';
import { GameState } from '../../shared/types/index.ts';

export class SkillEngine {
  /**
   * 战斗结算后触发技能的后置回调
   */
  static async onCombatResolved(gameState: GameState, combatDetails: any, helpers: SkillHelpers): Promise<void> {
    if (gameState.combatInitiatingSkillId) {
      const skillId = gameState.combatInitiatingSkillId.split('|')[0];
      const skill = skillRegistry.getSkill(skillId);
      if (skill && skill.afterCombat) {
        const context: SkillContext = {
          gameState,
          playerIndex: gameState.activePlayerIndex, // Use activePlayerIndex or attackInitiatorIndex
          sourceTokenId: gameState.selectedTokenId || '',
          targetTokenId: gameState.selectedTargetId || undefined,
        };
        await skill.afterCombat(context, combatDetails, helpers);
      }
      // 清除标记，避免重复触发
      gameState.combatInitiatingSkillId = null;
    }
  }

  /**
   * 获取当前英雄可用的主动技能列表
   */
  static getActiveSkillOptions(context: SkillContext): SkillUseOption[] {
    const { gameState, sourceTokenId } = context;
    const token = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!token || !token.heroClass) return [];

    const heroData = HEROES_DATABASE.heroes.find(h => h.name === token.heroClass || h.id === token.heroClass);
    if (!heroData) return [];

    const levelData = heroData.levels[token.lv.toString()];
    if (!levelData || !levelData.skills) return [];

    const options: SkillUseOption[] = [];

    for (const skill of levelData.skills) {
      if (!skill.id) continue;

      const skillDef = skillRegistry.getSkill(skill.id);
      if (!skillDef || skillDef.kind !== 'active') continue;

      let isAvailable = true;
      let reason = undefined;

      if (skillDef.canUse) {
        const canUseResult = skillDef.canUse(context);
        if (typeof canUseResult === 'boolean') {
          isAvailable = canUseResult;
        } else {
          isAvailable = canUseResult.canUse;
          reason = canUseResult.reason;
        }
      }

      options.push({
        skillId: skillDef.id,
        name: skillDef.name,
        description: skillDef.description,
        isAvailable,
        reason,
        targetType: skillDef.targetType || 'none'
      });
    }

    return options;
  }

  /**
   * 执行主动技能
   */
  static async useActiveSkill(skillId: string, context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> {
    const skillDef = skillRegistry.getSkill(skillId);
    if (!skillDef) return { success: false, reason: '找不到该技能。' };
    if (skillDef.kind !== 'active') return { success: false, reason: '该技能不是主动技能。' };

    if (skillDef.canUse && !context.ignoreConditions) {
      const canUseResult = skillDef.canUse(context);
      if (typeof canUseResult === 'boolean' && !canUseResult) {
        return { success: false, reason: '当前无法使用该技能。' };
      } else if (typeof canUseResult === 'object' && !canUseResult.canUse) {
        return { success: false, reason: canUseResult.reason || '当前无法使用该技能。' };
      }
    }

    if (!skillDef.execute) return { success: false, reason: '该技能未实现执行逻辑。' };

    return await skillDef.execute(context, helpers);
  }

  /**
   * 触发被动技能 (Trigger passive skills)
   * 遍历场上所有英雄的被动技能，如果匹配 eventName 就执行
   * 如果有技能中断了当前流程（返回 result.data.interrupt === true），则返回 true
   */
  static async triggerEvent(eventName: SkillTrigger, gameState: any, helpers: SkillHelpers, extraContext: any = {}): Promise<boolean> {
    if (!gameState || !gameState.tokens) return false;

    let interrupted = false;

    for (const token of gameState.tokens) {
      if (!token.heroClass) continue;

      const tableCard = gameState.tableCards.find((c: any) => c.id === token.boundToCardId);
      const playerIndex = tableCard ? (tableCard.y > 0 ? 0 : 1) : -1;

      const heroData = HEROES_DATABASE.heroes.find(h => h.name === token.heroClass || h.id === token.heroClass);
      if (!heroData) continue;

      const levelData = heroData.levels[token.lv.toString()];
      if (!levelData || !levelData.skills) continue;

      for (const skill of levelData.skills) {
        if (!skill.id) continue;

        const skillDef = skillRegistry.getSkill(skill.id);
        if (!skillDef || (skillDef.kind !== 'passive' && skillDef.kind !== 'semi_passive')) continue;
        if (skillDef.trigger !== eventName) continue;

        const context: SkillContext = {
          gameState,
          playerIndex,
          sourceTokenId: token.id,
          ...extraContext
        };

        // Check if the skill can be used
        let canUse = true;
        if (skillDef.canUse) {
          const canUseResult = skillDef.canUse(context);
          if (typeof canUseResult === 'boolean') {
            canUse = canUseResult;
          } else {
            canUse = canUseResult.canUse;
          }
        }

        if (canUse && skillDef.execute) {
          const result = await skillDef.execute(context, helpers);
          if (result && result.data && result.data.interrupt) {
            interrupted = true;
          }
        }
      }
    }

    return interrupted;
  }

  /**
   * 获取经过技能修饰后的属性值
   */
  static getModifiedStat(tokenId: string, statType: StatType, gameState: GameState): number {
    const token = gameState.tokens.find(t => t.id === tokenId);
    if (!token || !token.heroClass) return 0;

    const heroData = HEROES_DATABASE.heroes.find(h => h.name === token.heroClass || h.id === token.heroClass);
    if (!heroData) return 0;

    const levelData = heroData.levels[token.lv.toString()];
    if (!levelData) return 0;

    let baseValue = (levelData as any)[statType] || 0;
    
    // Default values if not specified in levelData
    if (baseValue === 0) {
      if (statType === 'ar') baseValue = 1;
      if (statType === 'mv') baseValue = 2;
      if (statType === 'atk') baseValue = 1;
    }

    let bonusAdd = 0;
    let bonusMult = 1;

    // 1. 遍历该英雄自己的技能
    if (levelData.skills) {
      for (const skill of levelData.skills) {
        const skillDef = skillRegistry.getSkill(skill.id);
        if (!skillDef) continue;

        // 处理 modifiers 数组
        if (skillDef.modifiers) {
          for (const mod of skillDef.modifiers) {
            if (mod.stat === statType) {
              if (mod.type === 'add') bonusAdd += mod.value;
              if (mod.type === 'multiply') bonusMult *= mod.value;
            }
          }
        }

        // 处理自定义 applyStaticModifier 函数
        if (skillDef.applyStaticModifier) {
          const tableCard = gameState.tableCards.find((c: any) => c.id === token.boundToCardId);
          const playerIndex = tableCard ? (tableCard.y > 0 ? 0 : 1) : -1;
          const context: SkillContext = {
            gameState,
            playerIndex,
            sourceTokenId: token.id
          };
          baseValue = skillDef.applyStaticModifier(baseValue, context);
        }
      }
    }

    // 2. TODO: 遍历全场光环技能 (Auras)
    // 目前先只处理英雄自身的

    // 3. 应用回合临时修饰 (Turn Modifiers)
    if (gameState.turnModifiers) {
      for (const mod of gameState.turnModifiers) {
        if (mod.tokenId === tokenId && mod.stat === statType) {
          if (mod.type === 'add') bonusAdd += mod.value;
          if (mod.type === 'multiply') bonusMult *= mod.value;
        }
      }
    }

    return (baseValue + bonusAdd) * bonusMult;
  }
}
