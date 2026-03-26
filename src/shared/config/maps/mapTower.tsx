import { MapConfig } from '../../types/index.ts';

export const mapTower: MapConfig = {
  name: 'Map TOWER',
  crystal: [],
  castles: {
    0: [{ q: 0, r: 4 }, { q: 4, r: 0 }],
    1: [{ q: 0, r: -4 }, { q: -4, r: 0 }]
  },
  chests: [
    { q: 1, r: 2, type: 'T1' },
    { q: -1, r: -2, type: 'T1' }
  ],
  monsters: [
    { q: 2, r: 2, level: 1 }, 
    { q: -2, r: -2, level: 1 },
    { q: 4, r: -4, level: 2 }, 
    { q: -4, r: 4, level: 2 }
  ],
  magicCircles: [ 
    { q: -3, r: 3 }, { q: 3, r: -3 }
  ],
  traps: [
    { q: 2, r: -1 },
    { q: 0, r: -1 },
    { q: 0, r: 1 },
    { q: -2, r: 1 },
    { q: -2, r: 3 },
    { q: 2, r: -3 },
  ],
  turrets: [{ q: 0, r: 0 }],
  watchtowers: [
    { q: 1, r: -3 },
    { q: -1, r: 3 },
    { q: 2, r: 0 },
    { q: -2, r: 0 },
  ],
  obstacles: [],
  water: [],
  bushes: []
};
