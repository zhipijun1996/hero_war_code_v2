import { MapConfig } from '../../types';

export const defaultMap: MapConfig = {
  name: 'Default Map',
  crystal: [{ q: 0, r: 0 }],
  castles: {
    0: [{ q: 0, r: 4 }, { q: 4, r: 0 }],
    1: [{ q: 0, r: -4 }, { q: -4, r: 0 }]
  },
  chests: [
    { q: -1, r: 3, type: 'T1' }, { q: 1, r: -3, type: 'T1' },
    { q: 1, r: 1, type: 'T2' }, { q: -1, r: -1, type: 'T2' }
  ],
  monsters: [
    { q: -2, r: 4, level: 1 }, { q: 2, r: 2, level: 1 }, { q: -2, r: -2, level: 1 }, { q: 2, r: -4, level: 1 },
    { q: -3, r: 1, level: 2 }, { q: -1, r: 1, level: 2 }, { q: 3, r: -1, level: 2 }, { q: 1, r: -1, level: 2 },
    { q: -3, r: 3, level: 3 }, { q: 3, r: -3, level: 3 }
  ],
  magicCircles: [
    { q: -2, r: 2 }, { q: 2, r: -2 }
  ],
  traps: [],
  turrets: [],
  watchtowers: [],
  obstacles: [],
  water: [],
  bushes: []
};
