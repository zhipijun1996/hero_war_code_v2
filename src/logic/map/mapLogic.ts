import { Hex, getHexDistance, pixelToHex, hexToPixel } from "../../shared/utils/hexUtils";
import { GameState, Token } from "../../shared/types/index.ts";

/**
 * 判断目标是否在攻击范围内
 * 包含瞭望塔 (Watchtower) 的特殊逻辑
 */
export function isTargetInAttackRange(
  attackerHex: Hex,
  targetHex: Hex,
  ar: number,
  gameState: GameState
): boolean {
  const dist = getHexDistance(attackerHex, targetHex);

  // Check base range
  if (ar <= 1) {
    if (dist === 1) return true;
  } else {
    if (dist >= 2 && dist <= ar) return true;
  }

  // 瞭望塔奖励逻辑
  const isOnWatchtower = gameState.map?.watchtowers?.some(
    (w) => w.q === attackerHex.q && w.r === attackerHex.r
  );
  
  if (isOnWatchtower && dist === ar + 1) {
    const dq = targetHex.q - attackerHex.q;
    const dr = targetHex.r - attackerHex.r;
    // 检查是否在直线上 (dq=0 或 dr=0 或 dq+dr=0)
    if (dq === 0 || dr === 0 || dq + dr === 0) {
      return true;
    }
  }
  return false;
}

/**
 * 获取相邻的六个格子
 */
export function getNeighbors(q: number, r: number): Hex[] {
  return [
    { q: q + 1, r: r },
    { q: q + 1, r: r - 1 },
    { q: q, r: r - 1 },
    { q: q - 1, r: r },
    { q: q - 1, r: r + 1 },
    { q: q, r: r + 1 },
  ];
}

/**
 * 计算击退后的位置 (Recoil Hex)
 * 逻辑：尝试向远离敌方城堡的方向移动 2 格
 */
export function getRecoilHex(
  tokenHex: Hex,
  enemyCastleHex: Hex,
  gameState: GameState
): Hex {
  const directions: Hex[] = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
  ];

  let currentHex = { ...tokenHex };
  for (let i = 0; i < 2; i++) {
    let bestHex: Hex | null = null;
    let maxDist = getHexDistance(currentHex, enemyCastleHex);

    for (const dir of directions) {
      const neighbor = { q: currentHex.q + dir.q, r: currentHex.r + dir.r };

      // 检查障碍物 (其他 Token)
      const isOccupied = gameState.tokens.some((t) => {
        const h = pixelToHex(t.x, t.y);
        return h.q === neighbor.q && h.r === neighbor.r;
      });

      // 检查怪物
      const isMonster = gameState.map?.monsters.some((m) => {
        if (m.q !== neighbor.q || m.r !== neighbor.r) return false;
        const pos = hexToPixel(m.q, m.r);
        // 检查怪物是否存活 (没有计时器)
        const hasTimer = gameState.counters.some(
          (c) => c.type === "time" && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10
        );
        return !hasTimer;
      });

      // 检查地图边界 (假设 4x4x4 的六边形地图)
      const inBounds = Math.abs(neighbor.q) <= 4 && Math.abs(neighbor.r) <= 4 && Math.abs(-neighbor.q - neighbor.r) <= 4;

      if (!isOccupied && !isMonster && inBounds) {
        const dist = getHexDistance(neighbor, enemyCastleHex);
        if (dist > maxDist) {
          maxDist = dist;
          bestHex = neighbor;
        }
      }
    }

    if (bestHex) {
      currentHex = bestHex;
    } else {
      break; 
    }
  }
  return currentHex;
}

/**
 * 计算两点间的路径距离 (BFS)
 */
export function getPathDist(
  start: Hex,
  end: Hex,
  gameState: GameState,
  maxRange: number = 10
): number {
  if (start.q === end.q && start.r === end.r) return 0;
  
  const queue: { q: number; r: number; dist: number }[] = [{ ...start, dist: 0 }];
  const visited = new Set<string>();
  visited.add(`${start.q},${start.r}`);

  while (queue.length > 0) {
    const { q, r, dist } = queue.shift()!;
    if (dist >= maxRange) continue;

    for (const neighbor of getNeighbors(q, r)) {
      if (neighbor.q === end.q && neighbor.r === end.r) return dist + 1;

      const key = `${neighbor.q},${neighbor.r}`;
      if (visited.has(key)) continue;

      // 检查地形阻挡 (简单示例，可根据需求扩展)
      const isObstacle = gameState.tokens.some(t => {
          if (t.type !== 'obstacle') return false;
          const h = pixelToHex(t.x, t.y);
          return h.q === neighbor.q && h.r === neighbor.r;
      });

      if (!isObstacle) {
        visited.add(key);
        queue.push({ ...neighbor, dist: dist + 1 });
      }
    }
  }

  return Infinity;
}

/**
 * 计算可移动范围 (带权重的 Dijkstra / BFS)
 */
export function getReachableHexes(
  start: Hex,
  mv: number,
  playerIndex: number,
  gameState: GameState
): Hex[] {
  const reachable = new Set<string>();
  // 按照消耗(dist)从小到大排序的优先队列 (因为移动力非常小，可以直接用简单的数组sort)
  const queue = [{ q: start.q, r: start.r, dist: 0 }];
  
  // 记录到达每个格子的最小消耗 (Dijkstra)
  const minCost = new Map<string, number>();
  minCost.set(`${start.q},${start.r}`, 0);

  // 内部辅助函数：判断某格子是否与任何冰柱相邻
  const isAdjacentToIcePillar = (q: number, r: number): boolean => {
    if (!gameState.icePillars || gameState.icePillars.length === 0) return false;
    for (const pillar of gameState.icePillars) {
      if (getHexDistance({ q, r }, { q: pillar.q, r: pillar.r }) === 1) return true;
    }
    return false;
  };

  while (queue.length > 0) {
    // Dijkstra: 每次取消耗最小的节点扩展
    queue.sort((a, b) => a.dist - b.dist);
    const current = queue.shift()!;
    const currentKey = `${current.q},${current.r}`;
    
    // 如果已经有更优路径，跳过
    if (minCost.get(currentKey)! < current.dist) continue;

    if (current.dist > 0) reachable.add(currentKey);

    if (current.dist < mv) {
      // 核心路障ZOC逻辑：从“与冰柱相邻的区域”移动（离开当前格），需额外消耗1点移动力
      const zocPenalty = isAdjacentToIcePillar(current.q, current.r) ? 1 : 0;
      
      for (const neighbor of getNeighbors(current.q, current.r)) {
        const key = `${neighbor.q},${neighbor.r}`;
        // 检查地图边界 (假设 4x4x4 的六边形地图)
        const inBounds = Math.abs(neighbor.q) <= 4 && Math.abs(neighbor.r) <= 4 && Math.abs(-neighbor.q - neighbor.r) <= 4;
        
        if (inBounds) {
          // 移动消耗 = 基础1 + 当前格子带来的ZOC惩罚
          const nextDist = current.dist + 1 + zocPenalty;
          if (nextDist <= mv) {
            // 检查障碍物 (怪物、其他 Token、敌方王城、冰柱)
            const isMonster = gameState.map?.monsters.some(m => m.q === neighbor.q && m.r === neighbor.r);
            const hasTimeCounter = gameState.counters.some(c => c.type === 'time' && pixelToHex(c.x, c.y).q === neighbor.q && pixelToHex(c.x, c.y).r === neighbor.r);
            const hasOtherToken = gameState.tokens.some(t => {
              const th = pixelToHex(t.x, t.y);
              return th.q === neighbor.q && th.r === neighbor.r;
            });
            const isIcePillar = gameState.icePillars?.some(p => p.q === neighbor.q && p.r === neighbor.r);
            
            const enemyIndex = 1 - playerIndex;
            const enemyCastles = gameState.map?.castles[enemyIndex as 0 | 1];
            const isEnemyCastle = enemyCastles?.some(c => c.q === neighbor.q && c.r === neighbor.r);
            
            if ((isMonster && !hasTimeCounter) || hasOtherToken || isEnemyCastle || isIcePillar) {
              continue;
            }
            
            // 如果发现了更短到达neighbor的路径，更新并加入队列
            const prevCost = minCost.get(key) ?? Infinity;
            if (nextDist < prevCost) {
              minCost.set(key, nextDist);
              queue.push({ q: neighbor.q, r: neighbor.r, dist: nextDist });
            }
          }
        }
      }
    }
  }

  return Array.from(reachable).map(s => {
    const [q, r] = s.split(',').map(Number);
    return { q, r };
  });
}

/**
 * 检查某个格子是否在敌方英雄的攻击范围内
 */
export function isHexInEnemyAttackRange(
  q: number,
  r: number,
  enemyPlayerIndex: number,
  gameState: GameState,
  getHeroAR: (heroClass: string, level: number) => number
): boolean {
  const enemyTokens = gameState.tokens.filter((t) => {
    const c = gameState.tableCards.find((tc) => tc.id === t.boundToCardId);
    if (!c) return false;
    // Player 1 (index 0) is at y > 0, Player 2 (index 1) is at y < 0
    const isEnemy = enemyPlayerIndex === 0 ? c.y > 0 : c.y < 0;
    const isAlive = !gameState.counters.some(
      (counter) => counter.type === "time" && counter.boundToCardId === t.boundToCardId
    );
    return isEnemy && isAlive;
  });

  for (const t of enemyTokens) {
    const c = gameState.tableCards.find((tc) => tc.id === t.boundToCardId);
    if (!c) continue;
    const ar = getHeroAR(c.heroClass!, c.level || 1);
    const th = pixelToHex(t.x, t.y);
    if (isTargetInAttackRange(th, { q, r }, ar, gameState)) return true;
  }
  return false;
}
/**
 * 处理地块触发效果
 */
export function resolveTileEffect(
  hex: Hex,
  tokenId: string,
  gameState: GameState
): { damage?: number; log?: string; type: 'trap' | 'magicCircle' | 'none' } {
  const pos = hexToPixel(hex.q, hex.r);
  
  // 1. 陷阱逻辑
  const isTrap = gameState.map?.traps?.some(t => t.q === hex.q && t.r === hex.r);
  if (isTrap) {
    const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
    if (!hasTimer) {
      return { damage: 1, log: '陷阱触发！受到1点伤害', type: 'trap' };
    }
  }

  // 2. 魔法阵逻辑 (检查是否离开或进入)
  // 注意：魔法阵逻辑通常在移动前后检查，这里仅提供判定
  const isMagicCircle = gameState.map?.magicCircles?.some(mc => mc.q === hex.q && mc.r === hex.r);
  if (isMagicCircle) {
    return { type: 'magicCircle' };
  }

  return { type: 'none' };
}

/**
 * 计算攻击范围内的目标 (Calculate targets in attack range)
 */
export function getAttackableHexes(
  startQ: number,
  startR: number,
  ar: number,
  playerIndex: number,
  gameState: GameState,
  heroLevel: number = 1
): { q: number; r: number; targetType?: 'hero' | 'castle' | 'empty' | 'monster' }[] {
  const cells: { q: number; r: number; targetType?: 'hero' | 'castle' | 'empty' | 'monster' }[] = [];
  const radius = 4; // 地图半径限制

  const checkCell = (nq: number, nr: number) => {
    if (Math.abs(nq) > radius || Math.abs(nr) > radius || Math.abs(-nq - nr) > radius) return null;

    let targetType: 'hero' | 'castle' | 'empty' | 'monster' | undefined = undefined;

    // 1. Enemy hero
    const enemyTokens = gameState.tokens.filter((t) => {
      const card = gameState.tableCards.find((c) => c.id === t.boundToCardId);
      if (!card) return false;
      const isEnemy = playerIndex === 0 ? card.y < 0 : card.y > 0;
      if (!isEnemy) return false;
      const hex = pixelToHex(t.x, t.y);
      return hex.q === nq && hex.r === nr;
    });
    if (enemyTokens.length > 0) {
      targetType = 'hero';
    }

    // 2. Enemy castle
    if (!targetType) {
      const enemyIndex = 1 - playerIndex;
      const enemyCastles = gameState.map!.castles[enemyIndex as 0 | 1];
      if (enemyCastles.some((c) => c.q === nq && c.r === nr)) {
        targetType = 'castle';
      }
    }

    // 3. Alive monster
    if (!targetType) {
      const monster = gameState.map!.monsters.find((m) => m.q === nq && m.r === nr);
      if (monster) {
        const pos = hexToPixel(nq, nr);
        const hasTimer = gameState.counters.some(
          (c) => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10
        );
        if (!hasTimer) targetType = 'monster';
      }
    }

    return targetType;
  };

  for (let dq = -ar; dq <= ar; dq++) {
    for (let dr = Math.max(-ar, -dq - ar); dr <= Math.min(ar, -dq + ar); dr++) {
      const nq = startQ + dq;
      const nr = startR + dr;
      const dist = getHexDistance({ q: startQ, r: startR}, { q: nq, r: nr });
      if (ar <= 1) {
        if (dist !== 1) continue;
      } else {
        if (dist < 2 || dist > ar) continue;
      }

      const targetType = checkCell(nq, nr);
      if (targetType) {
        cells.push({ q: nq, r: nr, targetType });
      }
    }
  }

  // Watchtower bonus
  const attackerHex = { q: startQ, r: startR };
  const isOnWatchtower = gameState.map?.watchtowers?.some(
    (w) => w.q === attackerHex.q && w.r === attackerHex.r
  );

  if (isOnWatchtower) {
    // Check cells at distance ar + 1 along straight lines
    const directions: Hex[] = [
      { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];
    
    for (const dir of directions) {
      const nq = startQ + dir.q * (ar + 1);
      const nr = startR + dir.r * (ar + 1);
      const targetType = checkCell(nq, nr);
      if (targetType && !cells.some(c => c.q === nq && c.r === nr)) {
        cells.push({ q: nq, r: nr, targetType });
      }
    }
  }

  // Handle Taunt: if any enemy hero in range has the taunt status, we can ONLY target taunting enemies
  const tauntingCells = cells.filter(cell => {
    if (cell.targetType !== 'hero') return false;
    const tokensAtCell = gameState.tokens.filter(t => {
      const hex = pixelToHex(t.x, t.y);
      return hex.q === cell.q && hex.r === cell.r;
    });
    return tokensAtCell.some(t => gameState.statuses?.some(s => s.tokenId === t.id && s.status === 'taunt'));
  });

  if (tauntingCells.length > 0) {
    return tauntingCells;
  }

  return cells;
}
