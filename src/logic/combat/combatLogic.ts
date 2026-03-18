import { GameState, TableCard, Token } from '../../shared/types';
import { getHeroStat } from '../hero/heroLogic';

/**
 * 计算攻击造成的伤害
 */
export function calculateDamage(
  attacker: TableCard,
  defender: TableCard,
  isCounter: boolean,
  gameState: GameState,
  options?: { isEnhanced?: boolean }
): number {
  // 基础伤害为 1
  let damage = 1;

  // 强击强化
  if (options?.isEnhanced) {
    damage += 1;
  }

  // 未来可以加入 ATK 和 DEF 的计算
  // const atk = getHeroStat(attacker.heroClass!, attacker.level!, 'atk');
  // const def = getHeroStat(defender.heroClass!, defender.level!, 'def');
  // damage = Math.max(1, atk - def);

  return damage;
}

/**
 * 检查英雄是否阵亡
 */
export function isHeroDead(hero: TableCard, gameState: GameState): boolean {
  if (!hero.heroClass || !hero.level) return false;
  const maxHP = getHeroStat(hero.heroClass, hero.level, 'hp');
  return (hero.damage || 0) >= maxHP;
}

/**
 * 获取战斗奖励
 */
export function getCombatRewards(
  attacker: TableCard,
  targetType: 'hero' | 'monster' | 'castle',
  isKill: boolean
) {
  const rewards = {
    exp: 0,
    gold: 0,
    reputation: 0
  };

  if (targetType === 'hero') {
    rewards.exp = 1; // 攻击英雄获得1经验
    if (isKill) {
      rewards.gold = 2;
      rewards.reputation = 1;
    }
  } else if (targetType === 'monster') {
    if (isKill) {
      rewards.reputation = 1;
      // 怪物具体奖励在 tileLogic 中定义，这里是通用奖励
    }
  } else if (targetType === 'castle') {
    rewards.exp = 1;
    rewards.reputation = 2;
  }

  return rewards;
}
