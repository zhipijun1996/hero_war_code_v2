import { skillRegistry } from '../skillRegistry.ts';
import { testActiveSkill, testTargetSkill, testPassiveSkill, testSemiPassiveSkill } from './testSkill.ts';
import { warriorKnockbackSlash, warriorPressForward, warriorWhirlwindSlash } from './warriorSkills.ts';
import { berserkerLinearDash, berserkerAssaultDash, berserkerFormationBreakingDash } from './berserkerSkills.ts';
import { guardianSwap, suppression } from './heavyArmorSkills.ts';
import { hardened, steadfast, taunt } from './shieldGuardSkills.ts';
import { heal, holy_shield, holy_prayer } from './priestSkills.ts';
import { archerAim, archerPoisonArrow, archerPoisonArrowEffect, archerArrowRain } from './archerSkills.ts';
import { commanderCommand, commanderFollowUp, commanderDispatch } from './commanderSkills.ts';
import { fireMageFireball, fireMageSpread, fireMageDeflagration } from './fireMageSkills.ts';
import { iceMageIcePillar, iceMagePillarBurst, iceMageDeepFreeze, iceMageBlizzard } from './iceMageSkills.ts';

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

  // 注册重甲兵技能
  skillRegistry.registerSkill(guardianSwap);
  skillRegistry.registerSkill(suppression);

  // 注册巨盾卫士技能
  skillRegistry.registerSkill(hardened);
  skillRegistry.registerSkill(steadfast);
  skillRegistry.registerSkill(taunt);

  // 注册圣职者技能
  skillRegistry.registerSkill(heal);
  skillRegistry.registerSkill(holy_shield);
  skillRegistry.registerSkill(holy_prayer);

  // 注册弓箭手技能
  skillRegistry.registerSkill(archerAim);
  skillRegistry.registerSkill(archerPoisonArrow);
  skillRegistry.registerSkill(archerPoisonArrowEffect);
  skillRegistry.registerSkill(archerArrowRain);

  // 注册指挥官技能
  skillRegistry.registerSkill(commanderCommand);
  skillRegistry.registerSkill(commanderFollowUp);
  skillRegistry.registerSkill(commanderDispatch);

  // 注册火法师技能
  skillRegistry.registerSkill(fireMageFireball);
  skillRegistry.registerSkill(fireMageSpread);
  skillRegistry.registerSkill(fireMageDeflagration);

  // 注册冰法师技能
  skillRegistry.registerSkill(iceMageIcePillar);
  skillRegistry.registerSkill(iceMagePillarBurst);
  skillRegistry.registerSkill(iceMageDeepFreeze);
  skillRegistry.registerSkill(iceMageBlizzard);
}
