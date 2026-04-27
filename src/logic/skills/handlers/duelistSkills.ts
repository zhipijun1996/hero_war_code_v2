import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';
import { getAttackableHexes, getReachableHexes } from '../../map/mapLogic.ts';
import { pixelToHex, hexToPixel, getHexDistance } from '../../../shared/utils/hexUtils.ts';

export const duelistPullingSlash: SkillDefinition = {
  id: 'duelist_pulling_slash',
  name: '牵引斩',
  description: '主动技：选择直线 2 格内一名敌方单位。若你与其之间无阻挡，将其拉至你相邻的合法空格，并对其进行一次攻击。',
  kind: 'active',
  getValidTargets: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return [];

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const validTargets: string[] = [];

    // Helper: is hex empty and passable
    const isHexEmpty = (q: number, r: number) => {
      // Bounds
      if (Math.abs(q) > 4 || Math.abs(r) > 4 || Math.abs(-q - r) > 4) return false;
      
      // Obstacles
      if (gameState.map?.crystal?.some((c: any) => c.q === q && c.r === r)) return false;
      if (gameState.map?.obstacles?.some((o: any) => o.q === q && o.r === r)) return false;
      if (gameState.map?.obstacles_v2?.some((o: any) => o.q === q && o.r === r)) return false;
      if (gameState.icePillars?.some((p: any) => p.q === q && p.r === r)) return false;
      
      // Tokens
      if (gameState.tokens.some(t => {
          const tHex = pixelToHex(t.x, t.y);
          return tHex.q === q && tHex.r === r;
      })) return false;
      
      // Monsters
      if (gameState.map?.monsters?.some((m: any) => m.q === q && m.r === r)) return false;
      
      return true;
    };

    // Valid enemy targets check
    const checkEnemyInHex = (q: number, r: number): string | null => {
        // Monster?
        const monster = gameState.map?.monsters?.find((m: any) => m.q === q && m.r === r);
        if (monster) return `monster_${q}_${r}`;

        // Enemy Hero?
        const token = gameState.tokens.find(t => {
            const tHex = pixelToHex(t.x, t.y);
            return tHex.q === q && tHex.r === r && ((t as any).playerIndex !== undefined ? (t as any).playerIndex !== playerIndex : ((t as any).playerIdx !== undefined ? (t as any).playerIdx !== playerIndex : ((playerIndex === 0 && t.y < 0) || (playerIndex === 1 && t.y > 0))));
        });
        if (token) return token.boundToCardId || token.id;

        return null;
    };

    // Check 6 directions for line up to length 2
    // Dist 1
    const directions = [
        { dq: 1, dr: 0 }, { dq: 1, dr: -1 }, { dq: 0, dr: -1 },
        { dq: -1, dr: 0 }, { dq: -1, dr: 1 }, { dq: 0, dr: 1 }
    ];

    directions.forEach(dir => {
        const hex1 = { q: sourceHex.q + dir.dq, r: sourceHex.r + dir.dr };
        const enemy1 = checkEnemyInHex(hex1.q, hex1.r);
        if (enemy1) validTargets.push(enemy1); // Adjacency, no pulling needed just attack

        // If hex 1 is empty, check hex 2
        if (isHexEmpty(hex1.q, hex1.r)) {
            const hex2 = { q: sourceHex.q + dir.dq * 2, r: sourceHex.r + dir.dr * 2 };
            const enemy2 = checkEnemyInHex(hex2.q, hex2.r);
            if (enemy2) validTargets.push(enemy2);
        }
    });

    return validTargets;
  },
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, sourceTokenId, playerIndex, targetTokenId, targetHex } = context;
    const heroToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!heroToken) return { success: false };

    // Initial phase without target
    if (!targetTokenId && !targetHex) {
        const validTargets = duelistPullingSlash.getValidTargets!(context);
        if (!validTargets || validTargets.length === 0) {
          return { success: false, reason: '没有满足条件的敌方单位（直线距离 1 或 2，且如果距为 2 中间需为空格）。' };
        }

        const { pixelToHex } = await import('../../../shared/utils/hexUtils.ts');
        gameState.reachableCells = [];
        for (const targetId of validTargets) {
          if (typeof targetId === 'string') {
            if (targetId.startsWith('monster_')) {
                const parts = targetId.split('_');
                gameState.reachableCells.push({ q: parseInt(parts[1]), r: parseInt(parts[2]) });
            } else {
                const t = gameState.tokens.find(tok => tok.id === targetId || tok.boundToCardId === targetId);
                if (t) gameState.reachableCells.push(pixelToHex(t.x, t.y));
            }
          }
        }

        gameState.phase = 'action_resolve';
        gameState.activeActionType = 'skill';
        gameState.selectedOption = 'skill';
        gameState.activeSkillId = 'duelist_pulling_slash';
        gameState.selectedTokenId = sourceTokenId;
        gameState.notification = '请选择牵引斩的目标';
        gameState.activeSkillState = { skillId: 'duelist_pulling_slash', sourceTokenId };

        return { success: true, inProgress: true };
    }

    // Target selected phase
    let targetEntityHex = targetHex;
    let resolvedTargetId = targetTokenId || '';

    if (!targetEntityHex && resolvedTargetId) {
        const t = gameState.tokens.find(tok => tok.id === resolvedTargetId || tok.boundToCardId === resolvedTargetId);
        if (t) {
            const { pixelToHex } = await import('../../../shared/utils/hexUtils.ts');
            targetEntityHex = pixelToHex(t.x, t.y);
        } else if (resolvedTargetId.startsWith('monster_')) {
            const parts = resolvedTargetId.split('_');
            targetEntityHex = { q: parseInt(parts[1]), r: parseInt(parts[2]) };
        }
    }

    if (!resolvedTargetId && targetEntityHex) {
        const t = gameState.tokens.find(tok => {
           const { pixelToHex } = require('../../../shared/utils/hexUtils.ts');
           const tokHex = pixelToHex(tok.x, tok.y);
           return tokHex.q === targetEntityHex!.q && tokHex.r === targetEntityHex!.r;
        });
        if (t) resolvedTargetId = t.boundToCardId || t.id;
        else {
            const m = gameState.map?.monsters?.find((mon: any) => mon.q === targetEntityHex!.q && mon.r === targetEntityHex!.r);
            if (m) resolvedTargetId = `monster_${m.q}_${m.r}`;
        }
    }

    if (!resolvedTargetId || !targetEntityHex) return { success: false, reason: '找不到该目标' };

    const { pixelToHex, hexToPixel, getHexDistance } = await import('../../../shared/utils/hexUtils.ts');
    const sourceHex = pixelToHex(heroToken.x, heroToken.y);
    const dist = getHexDistance(sourceHex, targetEntityHex);

    // If dist == 2, we must pull the target to dist 1 (midpoint)
    if (dist === 2) {
        const midQ = (sourceHex.q + targetEntityHex.q) / 2;
        const midR = (sourceHex.r + targetEntityHex.r) / 2;

        let targetObject: any = null;
        if (resolvedTargetId.startsWith('monster_')) {
            targetObject = gameState.map?.monsters?.find((m: any) => m.q === targetEntityHex!.q && m.r === targetEntityHex!.r);
        } else {
            targetObject = gameState.tokens.find(t => t.id === resolvedTargetId || t.boundToCardId === resolvedTargetId);
        }

        if (targetObject) {
            if (targetObject.x !== undefined && targetObject.y !== undefined) {
                const newPos = hexToPixel(midQ, midR);
                targetObject.x = newPos.x;
                targetObject.y = newPos.y;
            } else if (targetObject.q !== undefined && targetObject.r !== undefined) {
                targetObject.q = midQ;
                targetObject.r = midR;
            }
            helpers.addLog(`【牵引斩】发动，目标被拉拽了一格！`, playerIndex);
        }
    } else {
        helpers.addLog(`【牵引斩】发动，直接攻击了相邻目标！`, playerIndex);
    }

    gameState.activeSkillState = null;
    gameState.combatInitiatingSkillId = 'duelist_pulling_slash';
    gameState.selectedTokenId = sourceTokenId;
    gameState.selectedTargetId = resolvedTargetId;

    if (resolvedTargetId.startsWith('monster_')) {
      const { CombatLogic } = await import('../../combat/combatLogic.ts');
      const attackHex = dist === 2 ? { q: (sourceHex.q + targetEntityHex.q)/2, r: (sourceHex.r + targetEntityHex.r)/2 } : targetEntityHex;
      await CombatLogic.resolveMonsterAttack(gameState, playerIndex, attackHex.q, attackHex.r, helpers as any);
      return { success: true };
    } else {
      const sourceCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
      const tt = gameState.tokens.find(t => t.id === resolvedTargetId || t.boundToCardId === resolvedTargetId);
      const targetCard = gameState.tableCards.find(c => c.id === tt?.boundToCardId);
      
      if (!sourceCard || !targetCard || !tt) return { success: true };

      helpers.addLog(`发起阶段: ${sourceCard.heroClass} 对 ${targetCard.heroClass} 发起了【牵引斩】攻击`, playerIndex);
      
      gameState.phase = 'action_defend';
      const isPlayer1 = playerIndex === 0;
      gameState.activePlayerIndex = isPlayer1 ? 1 : 0;
      (gameState as any).defendingPlayerIndex = isPlayer1 ? 1 : 0;
      gameState.activeActionTokenId = null;

      helpers.broadcastState();
      return { success: true, inProgress: true };
    }
  }
};



export const duelistChasingStep: SkillDefinition = {
  id: 'duelist_chasing_step',
  name: '追步',
  description: '被动技：被你攻击过的相邻敌方单位离开你相邻区域后，你可以移动 1 格。',
  kind: 'passive',
  trigger: ['onDamageDealt', 'onMoveEnd'] as any,
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, eventName, sourceTokenId, targetTokenId, playerIndex, eventSourceId } = context;

    if (eventName === 'onDamageDealt') {
      if (sourceTokenId) {
         // The skill owner is sourceTokenId
         if (eventSourceId === sourceTokenId && targetTokenId) {
             const targetToken = gameState.tokens.find(t => t.id === targetTokenId);
             if (targetToken) {
                 if (!(targetToken as any).duelistMarkedBy) (targetToken as any).duelistMarkedBy = [];
                 if (!(targetToken as any).duelistMarkedBy.includes(sourceTokenId)) {
                     (targetToken as any).duelistMarkedBy.push(sourceTokenId);
                 }
             }
         }
      }
      return { success: true };
    }

    if (eventName === 'onMoveEnd') {
      // eventSourceId is the token that just moved
      const movedToken = gameState.tokens.find(t => t.id === eventSourceId);
      if (!movedToken) return { success: true };

      // Make sure the moved token is marked by our duelist
      if (!(movedToken as any).duelistMarkedBy || !(movedToken as any).duelistMarkedBy.includes(sourceTokenId)) {
          return { success: true };
      }

      const heroToken = gameState.tokens.find(t => t.id === sourceTokenId);
      if (!heroToken) return { success: true };

      // We need to check if it left adjacency. We look at movementHistory.
      // The last element of movementHistory should be the move that just happened.
      const history = gameState.movementHistory || [];
      const moveSteps = history.filter(h => h.tokenId === eventSourceId);
      if (moveSteps.length === 0) return { success: true }; // No history?

      // Find the position of the moved token before this current action
      // Because there could be multiple steps in the same move action, the first step for this token in this action represents where it started.
      const startStep = moveSteps[0];
      const startX = startStep.fromX;
      const startY = startStep.fromY;

      const { pixelToHex, getHexDistance } = await import('../../../shared/utils/hexUtils.ts');
      const startHex = pixelToHex(startX, startY);
      const currentHex = pixelToHex(movedToken.x, movedToken.y);
      const myHex = pixelToHex(heroToken.x, heroToken.y);

      const distanceBefore = getHexDistance(startHex, myHex);
      const distanceAfter = getHexDistance(currentHex, myHex);

      if (distanceBefore === 1 && distanceAfter > 1) {
          // Trigger chase step!
          const { getReachableHexes } = await import('../../map/mapLogic.ts');
          gameState.reachableCells = getReachableHexes(myHex, 1, playerIndex, gameState);
          
          if (gameState.reachableCells && gameState.reachableCells.length > 0) {
              const response = await helpers.promptPlayer!(playerIndex, 'select_skill', {
                  skills: [
                      { id: 'chase', name: '追步', description: '移动 1 格' },
                      { id: 'cancel', name: '取消', description: '留着原地' }
                  ],
                  message: '追步：被你攻击过的敌方离开了相邻区域，你可以移动 1 格。'
              });

              if (response === 'chase') {
                  const targetHexResponse = await helpers.promptPlayer!(playerIndex, 'heal_move', {
                      message: '请选择追步的移动目标。'
                  });
                  if (targetHexResponse && targetHexResponse.targetHex) {
                      const { hexToPixel } = await import('../../../shared/utils/hexUtils.ts');
                      const newPos = hexToPixel(targetHexResponse.targetHex.q, targetHexResponse.targetHex.r);
                      heroToken.x = newPos.x;
                      heroToken.y = newPos.y;
                      helpers.addLog(`【追步】发动！移动了 1 格！`, playerIndex);
                  }
              }
          }
          gameState.reachableCells = [];
      }
    }

    return { success: true };
  }
};

export const duelistInfiniteSwordDomain: SkillDefinition = {
  id: 'duelist_infinite_sword_domain',
  name: '无限剑域',
  description: '主动技：本回合一次，直到回合结束前，你 2 格范围内的区域成为剑域。每名敌方单位每回合第一次主动进入或离开剑域时，你可以对其进行一次攻击。',
  kind: 'active',
  trigger: ['onTurnEnd', 'onMoveEnd'] as any,
  canUse: (context: SkillContext) => {
      const { gameState, sourceTokenId } = context;
      const t = gameState.tokens.find(t => t.id === sourceTokenId);
      if (t && (t as any).duelistSwordDomainActive) return { canUse: false, reason: '当前回合已经开启了剑域' };
      return true;
  },
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, eventName, playerIndex, sourceTokenId, eventSourceId } = context;

    // Active Use
    if (!eventName) {
        const heroToken = gameState.tokens.find(t => t.id === sourceTokenId);
        if (!heroToken) return { success: false };
        (heroToken as any).duelistSwordDomainActive = true;
        (heroToken as any).duelistSwordDomainVictims = {}; // Reset victims for this turn
        helpers.addLog(`【无限剑域】展开！身边 2 格区域化为剑域！`, playerIndex);
        return { success: true };
    }

    if (eventName === 'onTurnEnd') {
        const heroToken = gameState.tokens.find(t => t.id === sourceTokenId);
        if (heroToken) {
            (heroToken as any).duelistSwordDomainActive = false;
        }
        return { success: true };
    }

    if (eventName === 'onMoveEnd') {
        const heroToken = gameState.tokens.find(t => t.id === sourceTokenId);
        if (!heroToken || !(heroToken as any).duelistSwordDomainActive) return { success: true };

        const movedToken = gameState.tokens.find(t => t.id === eventSourceId);
        if (!movedToken) return { success: true };

        // Is it an enemy?
        const isEnemy = ((movedToken as any).playerIndex !== undefined && (movedToken as any).playerIndex !== playerIndex) ||
                        ((movedToken as any).playerIdx !== undefined && (movedToken as any).playerIdx !== playerIndex) ||
                        (movedToken.y > 0 && playerIndex === 1) || (movedToken.y < 0 && playerIndex === 0);
                        
        if (!isEnemy) return { success: true };

        // Already attacked this turn?
        if ((heroToken as any).duelistSwordDomainVictims?.[eventSourceId]) return { success: true };

        const history = gameState.movementHistory || [];
        const moveSteps = history.filter(h => h.tokenId === eventSourceId);
        if (moveSteps.length === 0) return { success: true };

        const startStep = moveSteps[0];
        const { pixelToHex, getHexDistance } = await import('../../../shared/utils/hexUtils.ts');
        const startHex = pixelToHex(startStep.fromX, startStep.fromY);
        const currentHex = pixelToHex(movedToken.x, movedToken.y);
        const myHex = pixelToHex(heroToken.x, heroToken.y);

        const distanceBefore = getHexDistance(startHex, myHex);
        const distanceAfter = getHexDistance(currentHex, myHex);

        const entered = distanceBefore > 2 && distanceAfter <= 2;
        const left = distanceBefore <= 2 && distanceAfter > 2;

        if (entered || left) {
            const response = await helpers.promptPlayer!(playerIndex, 'select_skill', {
                skills: [
                    { id: 'attack', name: '攻击', description: '进行一次攻击' },
                    { id: 'cancel', name: '取消', description: '忽略本次机会' }
                ],
                message: `无限剑域：敌方单位${entered ? '进入' : '离开'}了剑域，你可以对其进行一次攻击。`
            });

            if (response === 'attack') {
                if (!(heroToken as any).duelistSwordDomainVictims) (heroToken as any).duelistSwordDomainVictims = {};
                (heroToken as any).duelistSwordDomainVictims[eventSourceId] = true;

                // Initiate attack sequence
                const sourceCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
                const targetCard = gameState.tableCards.find(c => c.id === movedToken.boundToCardId);

                if (sourceCard && targetCard) {
                    helpers.addLog(`发起阶段: ${sourceCard.heroClass} 对 ${targetCard.heroClass} 发起了【无限剑域】攻击`, playerIndex);
                    
                    gameState.combatInitiatingSkillId = 'duelist_infinite_sword_domain';
                    gameState.selectedTokenId = sourceTokenId;
                    gameState.selectedTargetId = movedToken.id;

                    gameState.phase = 'action_defend';
                    const isPlayer1 = playerIndex === 0;
                    gameState.activePlayerIndex = isPlayer1 ? 1 : 0;
                    (gameState as any).defendingPlayerIndex = isPlayer1 ? 1 : 0;
                    gameState.activeActionTokenId = null;

                    helpers.broadcastState();
                    return { success: true, inProgress: true };
                }
            }
        }
    }

    return { success: true };
  }
};
