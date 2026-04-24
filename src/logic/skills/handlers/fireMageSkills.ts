import { SkillDefinition, SkillContext, SkillHelpers } from '../types.ts';
import { pixelToHex, hexToPixel, getHexDistance } from '../../../shared/utils/hexUtils.ts';
import { HEROES_DATABASE } from '../../../shared/config/heroes.ts';

// ----------------------------------------------------------------------
// 火球 (Lv1)
// ----------------------------------------------------------------------
export const fireMageFireball: SkillDefinition = {
  id: 'fire_mage_fireball',
  name: '火球',
  targetType: 'token', // 第一段目标：敌人
  kind: 'active',
  description: '攻击，并选择目标相邻的一个区域，使其成为余烬区。',
  getValidTargets: (context: SkillContext) => {
    const { gameState, sourceTokenId, playerIndex } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return [];
    
    // Fireball requires attack range. Get base 'ar' without circular require
    let ar = 2; // Default range
    const heroData = HEROES_DATABASE.heroes.find(h => h.name === sourceToken.heroClass || h.id === sourceToken.heroClass);
    if (heroData) {
      const levelData = heroData.levels[sourceToken.lv.toString()];
      if (levelData && (levelData as any).ar) {
        ar = (levelData as any).ar;
      }
    }

    if (gameState.turnModifiers && gameState.turnModifiers.some(m => m.stat === 'ar')) {
      ar += gameState.turnModifiers.find(m => m.stat === 'ar')!.value;
    }
    
    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);

    const validTargets: (string | {q:number, r:number})[] = [];

    // Find enemies in range
    const enemies = gameState.tableCards.filter(c => (playerIndex === 0 ? c.y < 0 : c.y > 0));
    enemies.forEach(c => {
      const t = gameState.tokens.find(token => token.boundToCardId === c.id);
      if (t) {
        const hex = pixelToHex(t.x, t.y);
        const dist = getHexDistance(sourceHex, hex);
        if (dist <= ar) validTargets.push(t.id);
      }
    });

    // Find monsters in range
    if (gameState.map?.monsters) {
      gameState.map.monsters.forEach(m => {
        const dist = getHexDistance(sourceHex, { q: m.q, r: m.r });
        // Assuming line of sight is not strictly checked for skills or checked via same 'ar'
        if (dist <= ar) validTargets.push(`monster_${m.q}_${m.r}`);
      });
    }

    // Castles? Usually fireball might not be against castles, but if it is:
    /* if (gameState.map?.castles) {
      const oppCastleIdx = 1 - playerIndex;
      gameState.map.castles[oppCastleIdx].forEach(c => {
         if (getHexDistance(sourceHex, {q: c.q, r: c.r}) <= ar) validTargets.push(`castle_${c.q}_${c.r}`);
      });
    } */

    return validTargets;
  },
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<{ success: boolean; reason?: string; inProgress?: boolean }> => {
    const { gameState, sourceTokenId, targetTokenId, targetHex, playerIndex } = context;

    if (!gameState.activeSkillState) {
      // Step 0: 选择了一个敌人
      if (!targetTokenId) return { success: false, reason: '没有选中目标' };
      
      const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
      if (!sourceToken) return { success: false, reason: '找不到施法者' };

      // 提取被攻击目标的坐标
      let enemyHex: { q: number, r: number } | null = null;
      if (targetTokenId.startsWith('monster_') || targetTokenId.startsWith('castle_')) {
        const parts = targetTokenId.split('_');
        enemyHex = { q: parseInt(parts[1]), r: parseInt(parts[2]) };
      } else {
        const t = gameState.tokens.find(t => t.id === targetTokenId || t.boundToCardId === targetTokenId);
        if (t) enemyHex = pixelToHex(t.x, t.y);
      }

      if (!enemyHex) return { success: false, reason: '目标无效' };

      // 计算相邻的 6 个格子，让玩家选用
      const neighbors = [
        { q: enemyHex.q + 1, r: enemyHex.r },
        { q: enemyHex.q + 1, r: enemyHex.r - 1 },
        { q: enemyHex.q, r: enemyHex.r - 1 },
        { q: enemyHex.q - 1, r: enemyHex.r },
        { q: enemyHex.q - 1, r: enemyHex.r + 1 },
        { q: enemyHex.q, r: enemyHex.r + 1 },
      ];

      gameState.activeSkillState = {
        step: 1,
        target1Id: targetTokenId
      };

      // targetType change for the next step UI
      gameState.activeSkillId = 'fire_mage_fireball'; // ensure it persists
      gameState.reachableCells = neighbors;
      gameState.phase = 'action_select_skill_target';
      
      helpers.addLog(`请选择目标相邻的一个区域放置余烬区`, playerIndex);
      return { success: true, inProgress: true }; // Keep in progress
    }

    // Step 1: 选择了生成余烬区的格子
    if (gameState.activeSkillState?.step === 1 && targetHex) {
      const mainTargetId = gameState.activeSkillState.target1Id!;
      
      // 保存选择的余烬区坐标
      (gameState as any).fireballPendingEmberHex = { q: targetHex.q, r: targetHex.r };

      gameState.combatInitiatingSkillId = 'fire_mage_fireball';
      gameState.activeSkillState = null;
      gameState.notification = null;
      
      // 模拟发起攻击必需的状态
      gameState.selectedTokenId = sourceTokenId;
      gameState.activeActionType = 'attack';
      
      const { CombatLogic } = await import('../../combat/combatLogic.ts');
      const { ActionEngine } = await import('../../action/actionEngine.ts');

      if (mainTargetId.startsWith('monster_')) {
        const parts = mainTargetId.split('_');
        await CombatLogic.resolveMonsterAttack(gameState, playerIndex, parseInt(parts[1]), parseInt(parts[2]), helpers as any);
      } else if (mainTargetId.startsWith('castle_')) {
        const parts = mainTargetId.split('_');
        const cq = parseInt(parts[1]);
        const cr = parseInt(parts[2]);
        const isCastle0 = (gameState.map?.castles?.[0]?.some(c => c.q === cq && c.r === cr)) ?? false;
        const castleIdx = isCastle0 ? 0 : 1;
        await CombatLogic.resolveCastleAttack(gameState, playerIndex, castleIdx, helpers as any);
      } else {
        const sourceCard = gameState.tableCards.find(c => c.id === gameState.tokens.find(t=>t.id===sourceTokenId)?.boundToCardId);
        let targetCardId = mainTargetId;
        const targetToken = gameState.tokens.find(t => t.id === mainTargetId);
        if (targetToken && targetToken.boundToCardId) {
          targetCardId = targetToken.boundToCardId;
        }

        if (sourceCard) {
          await ActionEngine.initiateAttack(gameState, playerIndex, sourceCard.id, targetCardId, helpers as any, { emit: () => {} });
        }
      }

      return { success: true };
    }

    return { success: false, reason: '未知状态' };
  },
  afterCombat: async (context: SkillContext, combatDetails: any, helpers: SkillHelpers): Promise<void> => {
    const { gameState, sourceTokenId } = context;
    const playerIndex = gameState.attackInitiatorIndex !== undefined ? gameState.attackInitiatorIndex : context.playerIndex;
    
    const pendingHex = (gameState as any).fireballPendingEmberHex;
    if (!pendingHex) return;

    (gameState as any).fireballPendingEmberHex = null;

    helpers.addLog(`【火球】在 (${pendingHex.q}, ${pendingHex.r}) 生成了余烬区`, playerIndex);
    const { ActionEngine } = await import('../../action/actionEngine.ts');
    
    // 生成余烬区
    await ActionEngine.addEmberZone(gameState, pendingHex.q, pendingHex.r, playerIndex, sourceTokenId, helpers as any);
  }
};


// ----------------------------------------------------------------------
// 火势蔓延 (Lv2)
// ----------------------------------------------------------------------
export const fireMageSpread: SkillDefinition = {
  id: 'fire_mage_spread',
  name: '火势蔓延',
  targetType: 'hex',
  kind: 'active',
  description: '选择 2 格内的任意两个不同区域，使其成为余烬区。',
  getValidTargets: (context: SkillContext) => {
    const { gameState, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return [];
    const sourcePx = pixelToHex(sourceToken.x, sourceToken.y);
    const MAP_RADIUS = 4;

    const validTargets: {q:number, r:number}[] = [];
    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
      const r1 = Math.max(-MAP_RADIUS, -q - MAP_RADIUS);
      const r2 = Math.min(MAP_RADIUS, -q + MAP_RADIUS);
      for (let r = r1; r <= r2; r++) {
        if (getHexDistance(sourcePx, { q, r }) <= 2) {
          validTargets.push({ q, r });
        }
      }
    }
    return validTargets;
  },
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<{ success: boolean; reason?: string; inProgress?: boolean }> => {
    const { gameState, sourceTokenId, targetHex, playerIndex } = context;

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return { success: false, reason: '找不到施法者' };
    const sourcePx = pixelToHex(sourceToken.x, sourceToken.y);
    const MAP_RADIUS = 4; // Assuming current map radius

    // 计算施法者两格内所有合法的格子
    const range2Cells: {q: number, r: number}[] = [];
    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
      const r1 = Math.max(-MAP_RADIUS, -q - MAP_RADIUS);
      const r2 = Math.min(MAP_RADIUS, -q + MAP_RADIUS);
      for (let r = r1; r <= r2; r++) {
        if (getHexDistance(sourcePx, { q, r }) <= 2) {
          range2Cells.push({ q, r });
        }
      }
    }

    if (!gameState.activeSkillState) {
      // Step 0: 选择第一个格子
      if (!targetHex) {
        // Init UI selection
        gameState.reachableCells = range2Cells;
        return { success: false, reason: '请选择第一个余烬区格子' };
      }

      gameState.activeSkillState = {
        step: 1
      };
      (gameState as any).spreadTarget1Hex = targetHex;

      gameState.activeSkillId = 'fire_mage_spread';
      // 提供第二个格子的选择范围（剔除第一个选择的格子）
      gameState.reachableCells = range2Cells.filter(cell => cell.q !== targetHex.q || cell.r !== targetHex.r);
      gameState.phase = 'action_select_skill_target';
      
      helpers.addLog(`请选择第二个余烬区域`, playerIndex);
      return { success: true, inProgress: true };
    }

    if (gameState.activeSkillState?.step === 1) {
      if (!targetHex) return { success: false, reason: '未选择第二个余烬区格子' };
      
      const hex1 = (gameState as any).spreadTarget1Hex;
      const hex2 = targetHex;
      
      gameState.activeSkillState = null;
      (gameState as any).spreadTarget1Hex = null;
      gameState.notification = null;
      gameState.reachableCells = [];
      
      helpers.addLog(`【火势蔓延】在 (${hex1.q}, ${hex1.r}) 和 (${hex2.q}, ${hex2.r}) 生成了余烬区`, playerIndex);

      const { ActionEngine } = await import('../../action/actionEngine.ts');
      
      // 由于是连续挂载，第一挂可能会触发拦截
      await ActionEngine.addEmberZone(gameState, hex1.q, hex1.r, playerIndex, sourceTokenId, helpers as any);
      
      // 为了防止第一个就把阶段锁住了而导致系统出错，强行挂上第二个，因为系统会循环判断直到 < 5 才会解开阶段
      await ActionEngine.addEmberZone(gameState, hex2.q, hex2.r, playerIndex, sourceTokenId, helpers as any);

      return { success: true };
    }

    return { success: false, reason: '未知状态' };
  }
};


// ----------------------------------------------------------------------
// 爆燃 (Lv3)
// ----------------------------------------------------------------------
export const fireMageDeflagration: SkillDefinition = {
  id: 'fire_mage_deflagration',
  name: '爆燃',
  targetType: 'none',
  kind: 'active',
  description: '所有余烬区爆炸。余烬区及其相邻区域中的单位各受到 1 点伤害。每个单位只受 1 次伤害。所有余烬区随后消失。',
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<{ success: boolean; reason?: string }> => {
    const { gameState, sourceTokenId, playerIndex } = context;

    if (!gameState.emberZones || gameState.emberZones.length === 0) {
      return { success: false, reason: '场上没有余烬区' };
    }

    helpers.addLog(`【爆燃】所有的余烬区爆炸了！`, playerIndex);

    // 1. 收集爆炸波及的所有坐标
    const affectedHexes = new Set<string>();
    
    for (const ember of gameState.emberZones) {
      affectedHexes.add(`${ember.q},${ember.r}`); // 自身
      
      // 相邻6个方向
      const directions = [
        { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
        { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
      ];
      
      for (const dir of directions) {
        affectedHexes.add(`${ember.q + dir.q},${ember.r + dir.r}`);
      }
    }

    // 2. 找到这些坐标上的所有单位
    const targetHeroes = new Set<any>(); // 用于避免重复伤害
    const targetMonsters = new Set<string>(); // "q_r" 记录已经炸的怪物
    const targetPillars = new Set<string>();
    
    for (const hexStr of affectedHexes) {
      const [qStr, rStr] = hexStr.split(',');
      const q = parseInt(qStr);
      const r = parseInt(rStr);
      const pos = hexToPixel(q, r);

      // 英雄
      const heroTokens = gameState.tokens.filter(t => t.heroClass && Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
      for (const t of heroTokens) {
        targetHeroes.add(t);
      }

      // 怪物
      const monster = gameState.map?.monsters?.find(m => m.q === q && m.r === r);
      if (monster) {
        // 排除被时间锁定的怪物
        const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
        if (!hasTimer) {
          targetMonsters.add(`${monster.q}_${monster.r}`);
        }
      }

      // 冰柱
      const icePillar = gameState.icePillars?.find(p => p.q === q && p.r === r);
      if (icePillar) {
         targetPillars.add(`${icePillar.q}_${icePillar.r}`);
      }
    }

    const { CombatLogic } = await import('../../combat/combatLogic.ts');

    // 3. 对英雄造成1点伤害
    for (const targetToken of targetHeroes) {
      const targetCard = gameState.tableCards.find(c => c.id === targetToken.boundToCardId);
      if (targetCard) {
        await CombatLogic.applySpellDamageToHero(
          gameState,
          targetCard,
          targetToken,
          1,
          sourceTokenId,
          playerIndex,
          helpers as any,
          '爆燃'
        );
      }
    }

    // 4. 对被波及的怪物造成1点伤害
    for (const key of targetMonsters) {
      const [mq, mr] = key.split('_').map(Number);
      const targetM = gameState.map!.monsters!.find(m => m.q === mq && m.r === mr)!;
      
      await CombatLogic.applySpellDamageToMonster(
        gameState,
        targetM,
        1,
        sourceTokenId,
        playerIndex,
        helpers as any,
        '爆燃'
      );
    }

    // 4.5 炸碎冰柱
    for (const key of targetPillars) {
      const [pq, pr] = key.split('_').map(Number);
      await CombatLogic.applySpellDamageToTerrain(
         gameState,
         { q: pq, r: pr },
         1,
         sourceTokenId,
         playerIndex,
         helpers as any,
         '爆燃'
      );
    }

    // 5. 将场上余烬区全部清空
    gameState.emberZones = [];

    return { success: true };
  }
};
