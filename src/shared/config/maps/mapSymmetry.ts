import { MapConfig } from '../../types/index.ts';

export const mapSymmetry: MapConfig = {
  name: '镜像峡谷 (Symmetric Gorge)',
  crystal: [{ q: 0, r: 0 }],
  castles: {
    0: [{ q: 0, r: 4 }, { q: 4, r: 0 }],
    1: [{ q: 0, r: -4 }, { q: -4, r: 0 }]
  },
  chests: [
    { q: -2, r: 1, type: 'T1' }, { q: 2, r: -1, type: 'T1' },
    { q: 3, r: -4, type: 'T2' }, { q: -3, r: 4, type: 'T2' }
  ],
  monsters: [
    { q: 2, r: 0, level: 1 }, { q: -2, r: 0, level: 1 },
    { q: 3, r: 1, level: 2 }, { q: -3, r: -1, level: 2 },
    { q: 2, r: 2, level: 3 }, { q: -2, r: -2, level: 3 }
  ],
  magicCircles: [
    { q: 0, r: -1 }, { q: 0, r: 1 }
  ],
  traps: [
    { q: 1, r: 1 }, { q: -1, r: -1 }
  ],
  turrets: [
    { q: 3, r: -2 }, { q: -3, r: 2 }
  ],
  watchtowers: [
    { q: 0, r: 2 }, { q: 0, r: -2 }
  ],
  obstacles: [
    { q: -1, r: 2 }, { q: 1, r: -2 },
    { q: -2, r: 2 }, { q: 2, r: -2 },
    { q: -2, r: 3 }, { q: 2, r: -3 },
    { q: -3, r: 2 }, { q: 3, r: -2 }
  ],
  water: [],
  bushes: []
};
