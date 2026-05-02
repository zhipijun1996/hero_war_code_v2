import { MapConfig } from '../../types/index.ts';

export const mapCrossfire: MapConfig = {
  name: '交叉火力 (Crossfire Nexus)',
  crystal: [{ q: 0, r: 0 }],
  castles: {
    0: [{ q: -2, r: 4 }, { q: 4, r: -2 }],
    1: [{ q: 2, r: -4 }, { q: -4, r: 2 }]
  },
  chests: [
    { q: -2, r: 3, type: 'T1' }, { q: 2, r: -3, type: 'T1' },
    { q: 4, r: 0, type: 'T2' }, { q: -4, r: 0, type: 'T2' }
  ],
  monsters: [
    // 保护己方一塔发育，等级1 (Safe early leveling)
    { q: -1, r: 4, level: 1 }, { q: 1, r: -4, level: 1 },
    { q: 2, r: 2, level: 1 }, { q: -2, r: -2, level: 1 },
    // 进攻中路必须跨越的2级屏障 (Midline guards)
    { q: -1, r: 1, level: 2 }, { q: 1, r: -1, level: 2 },
    // 两翼守护T2宝箱的高级怪 (Flank Bosses)
    { q: 4, r: -1, level: 3 }, { q: -4, r: 1, level: 3 }
  ],
  magicCircles: [
    // 在地图的两个边缘，如果占领就可以直接开炮 (Exposed flanking magic circles)
    { q: -3, r: 2 }, { q: 3, r: -2 }
  ],
  traps: [
    // 试图抄近路去魔法阵或者中央时容易踩到 (Shortcut punishers)
    { q: -2, r: 1 }, { q: 2, r: -1 },
    { q: -1, r: 2 }, { q: 1, r: -2 }
  ],
  turrets: [
    // 形成火力防御塔装饰和掩体
    { q: -2, r: 2 }, { q: 2, r: -2 }
  ],
  watchtowers: [
    // 在中心周围的制高点 (Central overwatch)
    { q: -1, r: 0 }, { q: 1, r: 0 }
  ],
  obstacles: [
    // 切分战场的掩体屏障 (Line-of-sight blockers)
    { q: 0, r: 2 }, { q: 0, r: -2 },
    { q: -3, r: 3 }, { q: 3, r: -3 },
    { q: 2, r: 1 }, { q: -2, r: -1 }
  ],
  water: [],
  bushes: []
};
