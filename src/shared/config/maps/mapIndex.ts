import { MapConfig } from '../../types/index.ts';
import { defaultMap } from './mapDefault.ts';
import { mapTower } from './mapTower.tsx';
import { mapSymmetry } from './mapSymmetry.ts';
import { mapArena } from './mapArena.ts';

import { mapCrossfire } from './mapCrossfire.ts';
import { mapLabyrinth } from './mapLabyrinth.ts';

export type BuiltinMap = {
  id: string;
  name: string;
  description?: string;
  config: MapConfig;
};

export const BUILTIN_MAPS: BuiltinMap[] = [
  {
    id: 'default',
    name: '默认地图',
    description: '标准对称地图',
    config: defaultMap
  },
  {
    id: 'mapTower',
    name: '瞭望塔地图',
    description: '用塔对抢',
    config: mapTower
  },
  {
    id: 'mapSymmetry',
    name: '镜像峡谷',
    description: '极致对称，包含所有地形与机关',
    config: mapSymmetry
  },
  {
    id: 'mapArena',
    name: '中心斗兽场',
    description: '高级怪在内圈，鼓励中心压制，有策略性掩体',
    config: mapArena
  },
  {
    id: 'mapCrossfire',
    name: '交叉火力',
    description: '掩体较少，魔法阵偏暴露边缘，火力覆盖激烈',
    config: mapCrossfire
  },
  {
    id: 'mapLabyrinth',
    name: '遗迹迷宫',
    description: '大量的墙壁和障碍物塑造狭长路线，适合近战和卡视野',
    config: mapLabyrinth
  }
];

export const DEFAULT_MAP = BUILTIN_MAPS[0].config;
export const MAP_TOWER   = BUILTIN_MAPS[1].config;
export const MAP_SYMMETRY = BUILTIN_MAPS[2].config;
export const MAP_ARENA = BUILTIN_MAPS[3].config;
export const MAP_CROSSFIRE = BUILTIN_MAPS[4].config;
export const MAP_LABYRINTH = BUILTIN_MAPS[5].config;
