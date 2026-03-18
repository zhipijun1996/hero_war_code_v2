import { HEROES_DATABASE } from '../../shared/config/heroes';
import { GameState, TableCard, Counter } from '../../shared/types';

/**
 * 获取英雄在特定等级的属性
 */
export function getHeroStat(heroClass: string, level: number, statType: 'hp' | 'ar' | 'xp' | 'atk' | 'def' | 'mov' | 'vision'): number {
  const hero = HEROES_DATABASE.heroes.find((h: any) => h.name === heroClass);
  if (!hero) {
    // 默认值
    if (statType === 'hp') return 3;
    if (statType === 'ar') return 1;
    return 0;
  }
  const levelData = hero.levels[level.toString()];
  if (!levelData) return 0;

  return levelData[statType] || 0;
}

/**
 * 检查英雄是否可以进化（升级）
 */
export function canHeroEvolve(hero: TableCard, gameState: GameState): boolean {
  if (hero.type !== 'hero' || !hero.heroClass || !hero.level || hero.level >= 3) {
    return false;
  }

  const expNeeded = getHeroStat(hero.heroClass, hero.level, 'xp');
  const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === hero.id);
  
  return !!(expCounter && expNeeded > 0 && expCounter.value >= expNeeded);
}

/**
 * 获取复活所需的回合数
 */
export function getRespawnTime(level: number): number {
  // 基础规则：等级1需1回合，等级2需2回合，等级3需3回合
  return level;
}

/**
 * 获取英雄的当前生命值（HP - Damage）
 */
export function getHeroCurrentHP(hero: TableCard, gameState: GameState): number {
  if (!hero.heroClass || !hero.level) return 0;
  const maxHP = getHeroStat(hero.heroClass, hero.level, 'hp');
  return Math.max(0, maxHP - (hero.damage || 0));
}
