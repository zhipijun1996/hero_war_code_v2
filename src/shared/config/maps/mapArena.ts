import { MapConfig } from '../../types/index.ts';

export const mapArena: MapConfig = {
  name: '血战斗兽场 (Bloodbath Arena)',
  crystal: [{ q: 0, r: 0 }],
  castles: {
    0: [{ q: 0, r: 4 }, { q: 4, r: 0 }],
    1: [{ q: 0, r: -4 }, { q: -4, r: 0 }]
  },
  chests: [
    // 我方安全区宝箱，被低级怪守护
    { q: 1, r: 3, type: 'T1' }, { q: 3, r: 1, type: 'T1' },
    { q: -1, r: -3, type: 'T1' }, { q: -3, r: -1, type: 'T1' },
    // 激战地带边缘宝箱，被Boss守护
    { q: -4, r: 4, type: 'T2' }, { q: 4, r: -4, type: 'T2' }
  ],
  monsters: [
    // 守护安全区宝箱的低级怪
    { q: 1, r: 2, level: 1 }, { q: 2, r: 1, level: 1 },
    { q: -1, r: -2, level: 1 }, { q: -2, r: -1, level: 1 },
    
    // 中线护卫怪：如果不杀它们，想去中心就必须踩陷阱
    { q: -2, r: 2, level: 2 }, { q: 2, r: -2, level: 2 },
    // 位于战场极端角落的Boss级怪物 (守护T2宝箱)
    { q: -4, r: 3, level: 3 }, { q: 4, r: -3, level: 3 }
  ],
  magicCircles: [
    // 绝对中立位置(中线)，距离双方基地同为4。被陷阱重重包围！不杀中线怪就得踩陷阱
    { q: -1, r: 1 }, { q: 1, r: -1 }
  ],
  traps: [
    // 完美的陷阱包围圈，逼迫玩家交出解牌、踩陷阱、或者去清2级怪
    { q: 0, r: 1 }, { q: -1, r: 2 }, { q: -2, r: 1 }, { q: -1, r: 0 },
    { q: 0, r: -1 }, { q: 1, r: -2 }, { q: 2, r: -1 }, { q: 1, r: 0 }
  ],
  turrets: [
    // 中立炮塔。提供强大的火力，控制战场角落
    { q: -3, r: 3 }, { q: 3, r: -3 }
  ],
  watchtowers: [
    // 给弓箭手/法师设计的绝佳哨塔狙击点，能够直接覆盖陷阱区域
    { q: -1, r: 3 }, { q: 3, r: -1 },
    { q: 1, r: -3 }, { q: -3, r: 1 }
  ],
  obstacles: [
    // 斗兽场的立柱，断绝简单的跨图直射，形成掩体
    { q: 1, r: 1 }, { q: -1, r: -1 },
    { q: 2, r: 2 }, { q: -2, r: -2 }
  ],
  water: [],
  bushes: []
};

