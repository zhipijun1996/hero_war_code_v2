import { MapConfig } from '../../types/index.ts';
import { defaultMap } from './mapDefault.ts';
import { mapTower } from './mapTower.tsx';
import { mapSymmetry } from './mapSymmetry.ts';
import { mapArena } from './mapArena.ts';

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
  }
];

export const DEFAULT_MAP = BUILTIN_MAPS[0].config;
export const MAP_TOWER   = BUILTIN_MAPS[1].config;
export const MAP_SYMMETRY = BUILTIN_MAPS[2].config;
export const MAP_ARENA = BUILTIN_MAPS[3].config;
