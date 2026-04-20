import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';
import { pixelToHex, hexToPixel, generateId, getHexDistance } from '../../../shared/utils/hexUtils.ts';
import { getAttackableHexes } from '../../map/mapLogic.ts';
import { SkillEngine } from '../skillEngine.ts';

export const archerAim: SkillDefinition = {
  id: 'aim',
  name: '瞄准',
  description: '弃置 1 张手牌，本次ar+1进行攻击。',
  kind: 'active',
  targetType: 'none',

  getValidTargets: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return [];

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const baseAr = SkillEngine.getModifiedStat(sourceTokenId, 'ar', gameState);
    const ar = baseAr + 1;

    const tableCard = gameState.tableCards.find(c => c.id === sourceToken.boundToCardId);
    const heroLevel = tableCard?.level || 1;

    const attackableHexes = getAttackableHexes(sourceHex.q, sourceHex.r, ar, playerIndex, gameState, heroLevel);
    
    const validTargets: string[] = [];
    for (const cell of attackableHexes) {
      if (cell.targetType === 'hero') {
        const targetToken = gameState.tokens.find(t => {
          const hex = pixelToHex(t.x, t.y);
          return hex.q === cell.q && hex.r === cell.r;
        });
        if (targetToken) validTargets.push(targetToken.id);
      } else if (cell.targetType === 'monster') {
        validTargets.push(`monster_${cell.q}_${cell.r}`);
      } else if (cell.targetType === 'castle') {
        validTargets.push(`castle_${cell.q}_${cell.r}`);
      }
    }

    return validTargets;
  },

  canUse: (context: SkillContext) => {
    const { gameState, playerIndex } = context;
    const player = gameState.seats[playerIndex] ? gameState.players[gameState.seats[playerIndex]!] : null;
    if (!player || player.hand.length === 0) {
      return { canUse: false, reason: '手牌不足，无法发动瞄准。' };
    }

    const targets = archerAim.getValidTargets!(context);
    if (targets.length === 0) {
      return { canUse: false, reason: '射程内没有可攻击的目标。' };
    }

    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId } = context;
    
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken?.boundToCardId);
    if (!sourceToken || !sourceCard) return { success: false, reason: '找不到施法者。' };

    // 1. 提示弃牌
    if (helpers.promptPlayer) {
      const response = await helpers.promptPlayer(playerIndex, 'discard_card', {
        message: `发动【瞄准】：请弃置 1 张手牌以获得 ar+1 攻击效果。`,
        count: 1
      });

      if (!response || !response.discardedCardIds || response.discardedCardIds.length === 0) {
        return { success: false, reason: '玩家取消了弃牌，技能发动失败。' };
      }

      // 执行弃牌
      const cardId = response.discardedCardIds[0];
      const playerId = gameState.seats[playerIndex];
      const player = gameState.players[playerId!];
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        const [discardedCard] = player.hand.splice(cardIndex, 1);
        gameState.discardPiles.action.push(discardedCard);
        helpers.addLog(`弓箭手弃置了 1 张手牌，发动了【瞄准】！`, playerIndex);
        helpers.broadcastState();
      } else {
        return { success: false, reason: '找不到要弃置的卡牌。' };
      }
    }

    // 2. 增加临时 buff
    if (!gameState.turnModifiers) gameState.turnModifiers = [];
    gameState.turnModifiers.push({
      tokenId: sourceTokenId,
      stat: 'ar',
      type: 'add',
      value: 1,
      sourceSkillId: 'archer_aim'
    });

    // 3. 进入攻击选择阶段
    const { SkillEngine } = await import('../skillEngine.ts');
    const { getAttackableHexes } = await import('../../map/mapLogic.ts');
    const { pixelToHex } = await import('../../../shared/utils/hexUtils.ts');
    const { getAttackRangeBonusFromEnhancement } = await import('../../card/enhancementModifiers.ts');

    let ar = SkillEngine.getModifiedStat(sourceToken.id, 'ar', gameState);
    
    const enhancementCard = gameState.activeEnhancementCardId
      ? (gameState.playAreaCards.find(c => c.id === gameState.activeEnhancementCardId) ||
        gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId))
      : null;

    ar += getAttackRangeBonusFromEnhancement(enhancementCard?.name);

    const attackerHex = pixelToHex(sourceToken.x, sourceToken.y);
    gameState.reachableCells = getAttackableHexes(attackerHex.q, attackerHex.r, ar, playerIndex, gameState, sourceCard.level || 1);
    
    gameState.phase = 'action_resolve';
    gameState.activeActionType = 'attack';
    gameState.selectedOption = 'attack'; // Ensure highlighting works
    gameState.selectedTokenId = sourceToken.id;
    gameState.notification = '请选择攻击目标 (瞄准 ar+1)';
    
    helpers.broadcastState();

    return { success: true };
  }
};

export const archerPoisonArrow: SkillDefinition = {
  id: 'poison_arrow',
  name: '毒箭',
  description: '被你攻击的敌方单位（英雄或怪物），本回合第一次移动时，须弃置 1 张手牌；否则不能移动。',
  kind: 'passive',
  trigger: 'onDamageDealt',

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, sourceTokenId, targetTokenId, targetType } = context;
    
    // 攻击英雄或怪物都生效
    if (targetType !== 'hero' && targetType !== 'monster') return { success: true };
    
    let targetId = targetTokenId;
    if (targetType === 'monster' && !targetId) {
      // 如果是怪物且没有 ID，尝试从 context 获取位置信息 (虽然通常 onDamageDealt 会提供 ID)
      // 在当前框架中，怪物通常有 ID 如 monster_q_r
    }

    if (!targetId) return { success: true };

    // 添加毒箭状态
    if (!gameState.statuses) gameState.statuses = [];
    
    // 检查是否已经有该状态，避免重复添加
    const existingStatus = gameState.statuses.find(s => s.tokenId === targetId && s.status === 'poisoned_move');
    if (!existingStatus) {
      gameState.statuses.push({
        tokenId: targetId,
        status: 'poisoned_move',
        sourceSkillId: 'poison_arrow',
        sourceTokenId: sourceTokenId
      });
      
      helpers.addLog(`目标中了毒箭，下次移动将受到限制！`, -1);
    }

    return { success: true };
  }
};

export const archerPoisonArrowEffect: SkillDefinition = {
  id: 'poison_arrow_effect',
  name: '毒箭效果',
  description: '被动触发：检查移动者是否有毒箭状态',
  kind: 'passive',
  trigger: 'onBeforeMove',
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, movingTokenId } = context as any;
    if (!movingTokenId) return { success: true };

    const status = gameState.statuses?.find(s => s.tokenId === movingTokenId && s.status === 'poisoned_move');
    if (!status) return { success: true };

    const movingToken = gameState.tokens.find(t => t.id === movingTokenId);
    const tableCard = gameState.tableCards.find(c => c.id === movingToken?.boundToCardId);
    
    // 如果是怪物移动，目前怪物没有手牌，直接允许或禁止？
    // 按照描述“须弃置 1 张手牌”，怪物没有手牌，所以毒箭对怪物可能表现为直接禁止移动，或者怪物不受影响。
    // 这里我们假设如果是英雄则提示弃牌，如果是怪物则直接禁止移动（或者根据需求调整）。
    if (!movingToken?.heroClass && movingTokenId.startsWith('monster_')) {
        helpers.addLog(`怪物中了毒箭，无法移动。`, -1);
        return { success: true, data: { interrupt: true } };
    }

    const ownerIndex = tableCard?.y > 0 ? 0 : 1;

    if (helpers.promptPlayer) {
      const response = await helpers.promptPlayer(ownerIndex, 'discard_card', {
        message: `你中了毒箭！本次移动必须弃置 1 张手牌，否则不能移动。`,
        count: 1
      });

      if (response && response.discardedCardIds && response.discardedCardIds.length > 0) {
        // 执行弃牌
        const cardId = response.discardedCardIds[0];
        const playerId = gameState.seats[ownerIndex];
        const player = gameState.players[playerId!];
        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          const [discardedCard] = player.hand.splice(cardIndex, 1);
          gameState.discardPiles.action.push(discardedCard);
          helpers.addLog(`${tableCard?.heroClass} 弃置了 1 张手牌以解除毒箭限制并移动。`, ownerIndex);
          
          // 移除状态
          gameState.statuses = gameState.statuses.filter(s => s !== status);
          helpers.broadcastState();
          return { success: true, data: { interrupt: false } };
        }
      }
      
      // 拒绝弃牌或取消
      helpers.addLog(`${tableCard?.heroClass} 拒绝弃牌，无法移动。`, ownerIndex);
      helpers.broadcastState();
      return { success: true, data: { interrupt: true } };
    }

    return { success: true };
  }
};

export const archerArrowRain: SkillDefinition = {
  id: 'arrow_rain',
  name: '箭雨',
  description: '主动技（终极技）：选择射程内的一名敌方单位作为主目标，并可额外指定其相邻的一名敌方单位作为副目标。副目标直接受到 1 点伤害（无视防御）。随后，对主目标进行正常的攻击结算。',
  kind: 'active',
  targetType: 'hex',

  canUse: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId } = context;
    
    // 检查是否是一回合一次
    if (gameState.usedArrowRainThisTurn?.includes(sourceTokenId)) {
        return { canUse: false, reason: '箭雨每回合只能发动一次。' };
    }

    // 检查是否有可攻击目标
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return { canUse: false, reason: '找不到施法者。' };

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const ar = SkillEngine.getModifiedStat(sourceTokenId, 'ar', gameState);
    const tableCard = gameState.tableCards.find(c => c.id === sourceToken.boundToCardId);
    
    const targets = getAttackableHexes(sourceHex.q, sourceHex.r, ar, playerIndex, gameState, tableCard?.level || 1);
    if (targets.length === 0) {
        return { canUse: false, reason: '射程内没有可攻击的目标。' };
    }

    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, targetTokenId, targetHex } = context;

    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken?.boundToCardId);
    if (!sourceToken || !sourceCard) return { success: false, reason: '找不到施法者。' };

    let effectiveTargetId = targetTokenId;
    if (!effectiveTargetId && targetHex) {
      // 尝试从 hex 找到目标
      const token = gameState.tokens.find(t => {
        const hex = pixelToHex(t.x, t.y);
        return hex.q === targetHex.q && hex.r === targetHex.r;
      });
      if (token) {
        effectiveTargetId = token.id;
      } else {
        const monster = gameState.map?.monsters?.find(m => m.q === targetHex.q && m.r === targetHex.r);
        if (monster) {
          effectiveTargetId = `monster_${monster.q}_${monster.r}`;
        } else {
          const isCastle = gameState.map?.castles[0]?.some(c => c.q === targetHex.q && c.r === targetHex.r) || 
                           gameState.map?.castles[1]?.some(c => c.q === targetHex.q && c.r === targetHex.r);
          if (isCastle) {
            effectiveTargetId = `castle_${targetHex.q}_${targetHex.r}`;
          }
        }
      }
    }

    if (!effectiveTargetId && !gameState.activeSkillState) return { success: false, reason: '未选择目标。' };

    // Step 1: 选择主目标
    if (!gameState.activeSkillState) {
      let mainTargetHex: { q: number, r: number } | null = null;
      if (effectiveTargetId.startsWith('monster_') || effectiveTargetId.startsWith('castle_')) {
          const parts = effectiveTargetId.split('_');
          mainTargetHex = { q: parseInt(parts[1]), r: parseInt(parts[2]) };
      } else {
          let t = gameState.tokens.find(tok => tok.id === effectiveTargetId || tok.boundToCardId === effectiveTargetId);
          if (t) mainTargetHex = pixelToHex(t.x, t.y);
      }

      if (!mainTargetHex) return { success: false, reason: '无效的目标。' };

      // 寻找所有合法的第二个目标（主目标相邻的敌方单位：英雄或怪物）
      const validSecondTargets: { q: number, r: number }[] = [];
      
      // 1. 检查英雄
      gameState.tokens.forEach(t => {
        if (t.id === sourceTokenId || t.id === effectiveTargetId || t.boundToCardId === effectiveTargetId || !t.heroClass) return;
        const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
        if (!card) return;
        const ownerIndex = card.y > 0 ? 0 : 1;
        if (ownerIndex === playerIndex) return;

        const hex = pixelToHex(t.x, t.y);
        if (getHexDistance(mainTargetHex!, hex) === 1) {
            validSecondTargets.push(hex);
        }
      });

      // 2. 检查怪物
      gameState.map?.monsters.forEach(m => {
          const mId = `monster_${m.q}_${m.r}`;
          if (mId === effectiveTargetId) return;
          
          if (getHexDistance(mainTargetHex!, { q: m.q, r: m.r }) === 1) {
              const pos = hexToPixel(m.q, m.r);
              const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
              if (!hasTimer) {
                  validSecondTargets.push({ q: m.q, r: m.r });
              }
          }
      });

      if (validSecondTargets.length > 0) {
        // 有副目标可选，挂起技能，等待选择副目标
        gameState.activeSkillState = { step: 1, target1Id: effectiveTargetId };
        gameState.reachableCells = validSecondTargets;
        gameState.notification = '【箭雨】请选择相邻的副目标（必中1点伤害）';
        return { success: true, inProgress: true };
      } else {
        // 没有副目标，直接进入攻击
        gameState.activeSkillState = { step: 1, target1Id: effectiveTargetId };
        // 继续执行 step 1 的逻辑，但不 return
      }
    }

    // Step 2: 选择副目标（或跳过）并结算
    if (gameState.activeSkillState?.step === 1) {
      const mainTargetId = gameState.activeSkillState.target1Id!;
      let subTargetId = (effectiveTargetId && effectiveTargetId !== mainTargetId) ? effectiveTargetId : null;

      // 验证 subTargetId 是否在 reachableCells 中
      if (subTargetId) {
        let subTargetHex: { q: number, r: number } | null = null;
        if (subTargetId.startsWith('monster_') || subTargetId.startsWith('castle_')) {
            const parts = subTargetId.split('_');
            subTargetHex = { q: parseInt(parts[1]), r: parseInt(parts[2]) };
        } else {
            let t = gameState.tokens.find(tok => tok.id === subTargetId || tok.boundToCardId === subTargetId);
            if (t) subTargetHex = pixelToHex(t.x, t.y);
        }

        if (subTargetHex) {
          const isValid = gameState.reachableCells?.some(cell => cell.q === subTargetHex!.q && cell.r === subTargetHex!.r);
          if (!isValid) {
            // 如果点击了无效目标，视为放弃选择副目标
            subTargetId = null;
          }
        } else {
          subTargetId = null;
        }
      }

      // 标记本回合已使用
      if (!gameState.usedArrowRainThisTurn) gameState.usedArrowRainThisTurn = [];
      gameState.usedArrowRainThisTurn.push(sourceTokenId);

      // 记录副目标，以便在 afterCombat 中结算
      if (subTargetId) {
        (gameState as any).arrowRainPendingTarget2Id = subTargetId;
      }

      gameState.combatInitiatingSkillId = 'arrow_rain';
      gameState.activeSkillState = null;
      gameState.notification = null;

      helpers.addLog(`弓箭手发动了【箭雨】！`, playerIndex);

      // 直接发起对主目标的攻击
      const { ActionEngine } = await import('../../action/actionEngine.ts');
      
      // 转换 targetId 为 cardId (如果是英雄)
      let targetCardId = mainTargetId;
      const targetToken = gameState.tokens.find(t => t.id === mainTargetId);
      if (targetToken && targetToken.boundToCardId) {
        targetCardId = targetToken.boundToCardId;
      }

      // 模拟发起攻击必需的状态
      gameState.selectedTokenId = sourceTokenId;
      gameState.activeActionType = 'attack';
      
      const { CombatLogic } = await import('../../combat/combatLogic.ts');

      if (targetCardId.startsWith('monster_')) {
        const parts = targetCardId.split('_');
        await CombatLogic.resolveMonsterAttack(gameState, playerIndex, parseInt(parts[1]), parseInt(parts[2]), helpers as any);
      } else if (targetCardId.startsWith('castle_')) {
        const parts = targetCardId.split('_');
        const cq = parseInt(parts[1]);
        const cr = parseInt(parts[2]);
        const isCastle0 = (gameState.map?.castles?.[0]?.some(c => c.q === cq && c.r === cr)) ?? false;
        const castleIdx = isCastle0 ? 0 : 1;
        await CombatLogic.resolveCastleAttack(gameState, playerIndex, castleIdx, helpers as any);
      } else {
        await ActionEngine.initiateAttack(gameState, playerIndex, sourceCard.id, targetCardId, helpers as any, { emit: () => {} });
      }

      return { success: true };
    }

    return { success: false, reason: '未知状态。' };
  },

  afterCombat: async (context: SkillContext, combatDetails: any, helpers: SkillHelpers): Promise<void> => {
    const { gameState, sourceTokenId } = context;
    const playerIndex = gameState.attackInitiatorIndex !== undefined ? gameState.attackInitiatorIndex : context.playerIndex;
    
    const subTargetId = (gameState as any).arrowRainPendingTarget2Id;
    if (!subTargetId) return;

    // 清除记录
    (gameState as any).arrowRainPendingTarget2Id = null;

    // 结算副目标伤害
    if (subTargetId.startsWith('monster_')) {
        const parts = subTargetId.split('_');
        const mq = parseInt(parts[1]);
        const mr = parseInt(parts[2]);
        const { CombatLogic } = await import('../../combat/combatLogic.ts');
        const monster = gameState.map?.monsters?.find(m => m.q === mq && m.r === mr);
        if (monster) {
          await CombatLogic.applySpellDamageToMonster(
            gameState,
            monster,
            1,
            sourceTokenId,
            playerIndex,
            helpers as any,
            '箭雨副目标'
          );
        }
    } else {
        const secondTargetToken = gameState.tokens.find(t => t.id === subTargetId || t.boundToCardId === subTargetId);
        const secondTargetCard = gameState.tableCards.find(c => c.id === secondTargetToken?.boundToCardId);
        
        if (secondTargetToken && secondTargetCard) {
          const { CombatLogic } = await import('../../combat/combatLogic.ts');
          await CombatLogic.applySpellDamageToHero(
            gameState,
            secondTargetCard,
            secondTargetToken,
            1,
            sourceTokenId,
            playerIndex,
            helpers as any,
            '箭雨副目标'
          );
          
          helpers.broadcastState();
        }
    }
  }
};
