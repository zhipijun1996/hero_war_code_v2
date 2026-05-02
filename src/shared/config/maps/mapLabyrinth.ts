import { MapConfig } from '../../types/index.ts';

export const mapLabyrinth: MapConfig = {
  name: '遗迹迷宫 (Relic Labyrinth)',
  crystal: [{ q: 0, r: 0 }],
  castles: {
    0: [{ q: 0, r: 4 }, { q: -3, r: 4 }],
    1: [{ q: 0, r: -4 }, { q: 3, r: -4 }]
  },
  chests: [
    { q: 0, r: 3, type: 'T1' }, { q: 0, r: -3, type: 'T1' },
    { q: -3, r: 0, type: 'T2' }, { q: 3, r: 0, type: 'T2' }
  ],
  monsters: [
    // 发育点
    { q: -1, r: 4, level: 1 }, { q: 1, r: -4, level: 1 },
    { q: -2, r: 3, level: 1 }, { q: 2, r: -3, level: 1 },
    // 守卫路口中级怪
    { q: 0, r: 2, level: 2 }, { q: 0, r: -2, level: 2 },
    // 死角最深处的高级首领
    { q: -4, r: 1, level: 3 }, { q: 4, r: -1, level: 3 }
  ],
  magicCircles: [
    // 偏向两侧的咏唱阵，由陷阱保护
    { q: -2, r: 2 }, { q: 2, r: -2 }
  ],
  traps: [
    { q: -1, r: 2 }, { q: 1, r: -2 },
    { q: 0, r: 1 }, { q: 0, r: -1 }
  ],
  turrets: [],
  watchtowers: [
    // 可以俯瞰中心水晶的绝佳地形
    { q: -1, r: 1 }, { q: 1, r: -1 }
  ],
  obstacles: [
    // 构建迷宫般的墙壁 (Maze walls)，限制视野和走位
    { q: 1, r: 2 }, { q: -1, r: -2 },
    { q: 1, r: 1 }, { q: -1, r: -1 },
    { q: 2, r: 0 }, { q: -2, r: 0 },
    { q: 2, r: -1 }, { q: -2, r: 1 },
    { q: -1, r: 3 }, { q: 1, r: -3 },
    { q: -3, r: 2 }, { q: 3, r: -2 }
  ],
  water: [],
  bushes: []
};
