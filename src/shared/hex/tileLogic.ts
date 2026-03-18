import { HexCoord, MapConfig } from '../types';

export type TileType = 'empty' | 'castle' | 'monster' | 'chest' | 'magicCircle' | 'trap' | 'turret' | 'watchtower' | 'obstacle' | 'water' | 'bush';

export interface TileInfo {
  type: TileType;
  ownerIndex?: number; // 0 for P1, 1 for P2, -1 for neutral
  level?: number;
  data?: any;
}

/**
 * 获取指定坐标的地块类型和信息
 */
export function getTileInfo(q: number, r: number, map: MapConfig): TileInfo {
  // 1. 王城
  if (map.castles[0].some(c => c.q === q && c.r === r)) {
    return { type: 'castle', ownerIndex: 0 };
  }
  if (map.castles[1].some(c => c.q === q && c.r === r)) {
    return { type: 'castle', ownerIndex: 1 };
  }

  // 2. 怪物
  const monster = map.monsters.find(m => m.q === q && m.r === r);
  if (monster) {
    return { type: 'monster', level: monster.level };
  }

  // 3. 宝箱
  const chest = map.chests.find(c => c.q === q && c.r === r);
  if (chest) {
    return { type: 'chest', data: { chestType: chest.type } };
  }

  // 4. 魔法阵
  const mc = map.magicCircles.find(m => m.q === q && m.r === r);
  if (mc) {
    return { type: 'magicCircle' };
  }

  // 5. 装饰/障碍物
  if (map.obstacles.some(o => o.q === q && o.r === r)) return { type: 'obstacle' };
  if (map.water.some(w => w.q === q && w.r === r)) return { type: 'water' };
  if (map.bushes.some(b => b.q === q && b.r === r)) return { type: 'bush' };
  if (map.traps.some(t => t.q === q && t.r === r)) return { type: 'trap' };
  if (map.turrets.some(t => t.q === q && t.r === r)) return { type: 'turret' };
  if (map.watchtowers.some(w => w.q === q && w.r === r)) return { type: 'watchtower' };

  return { type: 'empty' };
}

/**
 * 判断地块是否可通行
 */
export function isPassable(q: number, r: number, map: MapConfig): boolean {
  const info = getTileInfo(q, r, map);
  // 水域和障碍物不可通行
  if (info.type === 'water' || info.type === 'obstacle') return false;
  // 默认其他地块可进入（但可能有怪物或英雄阻挡，那属于动态判断）
  return true;
}

/**
 * 获取地块的防御加成
 */
export function getTileDefenseBonus(q: number, r: number, map: MapConfig): number {
  const info = getTileInfo(q, r, map);
  switch (info.type) {
    case 'castle': return 2; // 王城防御+2
    case 'bush': return 1;   // 草丛防御+1
    case 'watchtower': return 1; // 瞭望塔防御+1
    default: return 0;
  }
}

/**
 * 获取地块的视野加成
 */
export function getTileVisionBonus(q: number, r: number, map: MapConfig): number {
  const info = getTileInfo(q, r, map);
  if (info.type === 'watchtower') return 2; // 瞭望塔视野+2
  return 0;
}

/**
 * 游戏奖励配置 - 您可以在这里统一调整数值
 */
export const REWARDS = {
  MONSTER: {
    LV1: { EXP: 0, GOLD: 1, REP: 0 },
    LV2: { EXP: 1, GOLD: 2, REP: 0 },
    LV3: { EXP: 1, GOLD: 3, REP: 1 },
  },
  CHEST: {
    T1_GOLD: 1,
    T2_GOLD: 2,
    T3_GOLD: 3,
  },
  MAGIC_CIRCLE: {
    EXP_PER_TURN: 0,       // 不再提供经验
    GOLD_PER_TURN: 0,      // 不再提供金币
    REP_PER_TURN: 1,       // 咏唱结束提供1声望
  },
  HERO_ATTACK: {
    EXP: 1,                // 攻击成功获得1经验
  },
  HERO_KILL: {
    EXP: 1,                // 击杀获得1经验
    GOLD: 2,               // 击杀获得2金币
    REP: 1,                // 击杀获得1声望
  },
  CASTLE_ATTACK: {
    EXP: 1,                // 攻击王城获得的经验
    REP: 2,                // 攻击王城获得的声望
  },
  MONSTER_KILL: {
    REP: 1,                // 击杀怪物获得的声望
  }
};
