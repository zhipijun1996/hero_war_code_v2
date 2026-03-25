import { MapConfig } from '../../types';
import { defaultMap } from './mapDefault';
import { mapTower } from './mapTower';

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
  }
];

export const DEFAULT_MAP = BUILTIN_MAPS[0].config;
export const MAP_TOWER   = BUILTIN_MAPS[1].config;
