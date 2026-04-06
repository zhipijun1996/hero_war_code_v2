import { GameState } from '../../shared/types/index.ts';
import { Hex, getHexDistance, hexToPixel, pixelToHex, hexAdd } from '../../shared/utils/hexUtils.ts';
import { MAP_RADIUS } from '../../shared/config/maps/map.ts';

/**
 * 将目标沿攻击方向推开指定的距离
 * @returns 实际推开的格数
 */
export async function applyKnockback(
  gameState: GameState,
  sourceHex: Hex,
  targetId: string, // 支持英雄 CardID, TokenID 或 "monster_q_r"
  distance: number,
  helpers: { addLog: (msg: string, playerIndex?: number) => void },
  playerIndex: number
): Promise<number> {
  let targetHex: Hex | null = null;
  let targetName = '';
  let isMonster = false;
  let targetToken = gameState.tokens.find(t => t.id === targetId || t.boundToCardId === targetId);
  let targetCard: any = null;
  let monster: any = null;

  // 1. 解析目标并检查存活
  if (targetToken) {
    targetCard = gameState.tableCards.find(c => c.id === targetToken!.boundToCardId);
    if (!targetCard) return 0;

    // 检查英雄是否阵亡 (是否有 time 计数器)
    const hasTimer = gameState.counters.some(c => c.type === 'time' && c.boundToCardId === targetCard!.id);
    if (hasTimer) return 0;

    targetHex = pixelToHex(targetToken.x, targetToken.y);
    targetName = targetCard.heroClass || '英雄';
  } else if (targetId.startsWith('monster_')) {
    const parts = targetId.split('_');
    const q = parseInt(parts[1]);
    const r = parseInt(parts[2]);
    
    // 检查怪物是否阵亡
    const pos = hexToPixel(q, r);
    const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
    if (hasTimer) return 0;

    monster = gameState.map?.monsters?.find(m => m.q === q && m.r === r);
    if (!monster) return 0;
    targetHex = { q, r };
    targetName = `LV${monster.level}怪物`;
    isMonster = true;
  } else {
    return 0;
  }

  // 2. 方向计算 (单位向量)
  const dist = getHexDistance(sourceHex, targetHex);
  if (dist === 0) return 0; // 无法推开重叠的目标
  
  // 计算单位方向向量
  const dq = (targetHex.q - sourceHex.q) / dist;
  const dr = (targetHex.r - sourceHex.r) / dist;
  // 确保是整数方向 (六边形网格中直线上的点差值除以距离应为整数)
  const dir = { q: Math.round(dq), r: Math.round(dr) };

  // 3. 步进式位移判定
  let actualDistance = 0;
  let currentHex = { ...targetHex };

  for (let i = 0; i < distance; i++) {
    const nextHex = hexAdd(currentHex, dir);

    // 检查地图边界
    const inMap = getHexDistance({ q: 0, r: 0 }, nextHex) <= MAP_RADIUS;
    if (!inMap) break;

    // 检查障碍物 (英雄)
    const isOccupiedByHero = gameState.tokens.some(t => {
      const tHex = pixelToHex(t.x, t.y);
      return tHex.q === nextHex.q && tHex.r === nextHex.r;
    });
    
    // 检查障碍物 (怪物)
    const isOccupiedByMonster = gameState.map?.monsters?.some(m => {
      if (m.q !== nextHex.q || m.r !== nextHex.r) return false;
      const mPos = hexToPixel(m.q, m.r);
      const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - mPos.x) < 10 && Math.abs(c.y - mPos.y) < 10);
      return !hasTimer;
    });

    if (isOccupiedByHero || isOccupiedByMonster) break;

    currentHex = nextHex;
    actualDistance++;
  }

  // 4. 状态同步更新
  if (actualDistance > 0) {
    const oldPos = hexToPixel(targetHex.q, targetHex.r);
    const newPos = hexToPixel(currentHex.q, currentHex.r);

    if (isMonster) {
      monster.q = currentHex.q;
      monster.r = currentHex.r;
      // 同步伤害计数器
      const damageCounter = gameState.counters.find((c: any) => 
        c.type === 'damage' && Math.abs(c.x - oldPos.x) < 10 && Math.abs(c.y - oldPos.y) < 10
      );
      if (damageCounter) {
        damageCounter.x = newPos.x;
        damageCounter.y = newPos.y;
      }
    } else {
      targetToken!.x = newPos.x;
      targetToken!.y = newPos.y;
    }
    helpers.addLog(`${targetName} 被击退了 ${actualDistance} 格！`, playerIndex);
  } else if (distance > 0) {
    helpers.addLog(`${targetName} 背后有障碍，无法被击退。`, playerIndex);
  }

  return actualDistance;
}
