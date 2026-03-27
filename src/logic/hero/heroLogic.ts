import { HEROES_DATABASE } from '../../shared/config/heroes.ts';
import { GameState, TableCard, Counter } from '../../shared/types/index.ts';

const BASE_URL = 'https://raw.githubusercontent.com/zhipijun1996/heros_war/main/';
const HERO1_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv1.png`;
const HERO2_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv2.png`;
const HERO3_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv3.png`;

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
export function getHeroCurrentHP (hero: TableCard, gameState: GameState): number {
  if (!hero.heroClass || !hero.level) return 0;
  const maxHP = getHeroStat(hero.heroClass, hero.level, 'hp');
  return Math.max(0, maxHP - (hero.damage || 0));
}

export function getHeroCardImage (heroClass: string, level: number) : string {
  if (heroClass === '圣职者' && level === 2) return `${BASE_URL}%E5%9C%A3%E8%81%8C%E8%80%85_LV2.png`;
  if (heroClass === '重甲兵' && level === 2) return `${BASE_URL}%E9%87%8D%E7%94%B2%E5%85%B5_LV2.png`;
  return `${BASE_URL}${encodeURIComponent(heroClass)}lv${level}.png`;
}

export function getHeroBackImage (level: number) : string {
  if (level === 1) return HERO1_BACK;
  if (level === 2) return HERO2_BACK;
  return HERO3_BACK;
}
