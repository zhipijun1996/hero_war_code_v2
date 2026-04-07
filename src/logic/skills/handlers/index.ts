import { skillRegistry } from '../skillRegistry.ts';
import { testActiveSkill, testTargetSkill, testPassiveSkill, testSemiPassiveSkill } from './testSkill.ts';
import { warriorKnockbackSlash, warriorPressForward, warriorWhirlwindSlash } from './warriorSkills.ts';
import { berserkerLinearDash, berserkerAssaultDash, berserkerFormationBreakingDash } from './berserkerSkills.ts';

/**
 * 注册所有游戏内的英雄技能
 * 这个函数将在服务器启动或游戏初始化时被调用
 */
export function registerAllSkills() {
  // 注册测试技能
  skillRegistry.registerSkill(testActiveSkill);
  skillRegistry.registerSkill(testTargetSkill);
  skillRegistry.registerSkill(testPassiveSkill);
  skillRegistry.registerSkill(testSemiPassiveSkill);

  // 注册战士技能
  skillRegistry.registerSkill(warriorKnockbackSlash);
  skillRegistry.registerSkill(warriorPressForward);
  skillRegistry.registerSkill(warriorWhirlwindSlash);

  // 注册狂战士技能
  skillRegistry.registerSkill(berserkerLinearDash);
  skillRegistry.registerSkill(berserkerAssaultDash);
  skillRegistry.registerSkill(berserkerFormationBreakingDash);
}
