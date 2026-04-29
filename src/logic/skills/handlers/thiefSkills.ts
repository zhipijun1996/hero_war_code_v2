import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';
import { getAttackableHexes, getReachableHexes } from '../../map/mapLogic.ts';
import { pixelToHex } from '../../../shared/utils/hexUtils.ts';

export const thiefSneakAttack: SkillDefinition = {
  id: 'sneak_attack',
  name: '偷袭',
  description: '主动技：对相邻敌方英雄进行一次攻击。若造成伤害，随机弃置其 1 张手牌。',
  kind: 'active',
  trigger: ['onDamageDealt'],
  canUse: (context: SkillContext) => {
    const { gameState, sourceTokenId, playerIndex } = context;
    const heroToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!heroToken) return false;
    
    const hHex = pixelToHex(heroToken.x, heroToken.y);
    const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
    const reachableCells = getAttackableHexes(hHex.q, hHex.r, 1, playerIndex, gameState, heroCard?.level || 1);
    
    return reachableCells.some(cell => {
      const targetToken = gameState.tokens.find(t => {
        const tHex = pixelToHex(t.x, t.y);
        if (tHex.q !== cell.q || tHex.r !== cell.r) return false;
        
        const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
        if (!card) return false;
        
        const ownerIndex = card.y > 0 ? 0 : 1;
        return ownerIndex !== playerIndex;
      });
      return !!targetToken;
    });
  },
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, sourceTokenId, playerIndex, eventName, targetTokenId, damage, targetType } = context;
    const heroToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!heroToken) return { success: false };

    if (eventName === 'onDamageDealt') {
      if (gameState.activeSkillState?.skillId === 'sneak_attack' && gameState.activeSkillState.sourceTokenId === sourceTokenId) {
        if (targetType === 'hero' && damage && damage > 0) {
          const targetCard = gameState.tableCards.find(c => c.id === targetTokenId);
          const targetPlayer = targetCard ? (targetCard.y > 0 ? 0 : 1) : -1;
          
          if (targetPlayer !== -1) {
            const enemySocketId = gameState.seats[targetPlayer];
            if (enemySocketId && gameState.players[enemySocketId]) {
              const enemyHand = gameState.players[enemySocketId].hand;
              if (enemyHand && enemyHand.length > 0) {
                const randIdx = Math.floor(Math.random() * enemyHand.length);
                const discarded = enemyHand.splice(randIdx, 1)[0];
                gameState.discardPiles.action.push(discarded);
                helpers.addLog(`【偷袭】命中！敌方随机弃置了 ${discarded.name}。`, playerIndex);

                const { SkillEngine } = await import('../skillEngine.ts');
                await SkillEngine.triggerEvent('onCardsDiscardedEffect', gameState, helpers, {
                  eventSourceId: sourceTokenId,
                  discardedBy: playerIndex
                });
              }
            }
          }
        }
      }
      return { success: true };
    }

    // Active usage
    const hHex = pixelToHex(heroToken.x, heroToken.y);
    const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
    gameState.reachableCells = getAttackableHexes(hHex.q, hHex.r, 1, playerIndex, gameState, heroCard?.level || 1);
    
    // Filter to only adjacent enemy heroes
    gameState.reachableCells = gameState.reachableCells.filter(cell => {
      const targetToken = gameState.tokens.find(t => {
        const tHex = pixelToHex(t.x, t.y);
        if (tHex.q !== cell.q || tHex.r !== cell.r) return false;
        
        const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
        if (!card) return false;
        
        const ownerIndex = card.y > 0 ? 0 : 1;
        return ownerIndex !== playerIndex;
      });
      return !!targetToken;
    });

    if (gameState.reachableCells.length === 0) {
      return { success: false, reason: '没有相邻的敌方英雄可攻击。' };
    }

    gameState.phase = 'action_select_skill_target';
    gameState.activeActionType = 'skill';
    gameState.selectedOption = 'attack';
    gameState.notification = '请选择偷袭目标';
    gameState.activeSkillState = { skillId: 'sneak_attack', sourceTokenId };
    gameState.selectedTokenId = sourceTokenId;
    gameState.activeSkillId = 'sneak_attack';

    return { success: true, inProgress: true };
  }
};

export const thiefSleightOfHand: SkillDefinition = {
  id: 'sleight_of_hand',
  name: '顺手牵羊',
  description: '被动技：当你使敌方英雄弃置手牌后，你可以移动 1 格，或从牌库抽 1 张牌。',
  kind: 'passive',
  // Note: custom trigger type needed
  trigger: ['onCardsDiscardedEffect'] as any,
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, sourceTokenId, playerIndex, discardedBy } = context;
    if (playerIndex !== discardedBy) return { success: true };

    const heroToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!heroToken) return { success: false };

    const selectedOption = await helpers.promptPlayer!(playerIndex, 'select_skill', {
        skills: [
            { id: 'move_1', name: '移动 1 格', description: '移动英雄 1 格' },
            { id: 'draw_1', name: '抽 1 张牌', description: '从动作牌堆抽 1 张牌' },
            { id: 'cancel', name: '取消', description: '不发动技能' }
        ],
        message: '顺手牵羊：请选择移动 1 格，或抽 1 张牌。'
    });

    if (selectedOption === 'move_1') {
        const currentHex = pixelToHex(heroToken.x, heroToken.y);
        gameState.reachableCells = getReachableHexes(currentHex, 1, playerIndex, gameState);
        
        const response = await helpers.promptPlayer!(playerIndex, 'heal_move', {
             message: '顺手牵羊：请选择移动目标。'
        });

        if (response && response.targetHex) {
            const { hexToPixel } = await import('../../../shared/utils/hexUtils.ts');
            const newPos = hexToPixel(response.targetHex.q, response.targetHex.r);
            heroToken.x = newPos.x;
            heroToken.y = newPos.y;
            helpers.addLog(`【顺手牵羊】发动，移动了 1 格！`, playerIndex);
        }
    } else if (selectedOption === 'draw_1') {
        if (gameState.decks.action.length > 0) {
            const card = gameState.decks.action.pop()!;
            const socketId = gameState.seats[playerIndex];
            if (socketId && gameState.players[socketId]) {
                gameState.players[socketId].hand.push(card);
                helpers.addLog(`【顺手牵羊】发动，抽了 1 张牌！`, playerIndex);
            }
        } else {
            helpers.addLog('动作牌堆已空。', playerIndex);
        }
    }

    gameState.reachableCells = [];
    return { success: true };
  }
};

export const thiefStealSkills: SkillDefinition = {
  id: 'steal_skills',
  name: '偷天换日',
  description: '被动技：回合开始时，选择一名敌方英雄已解锁的一个技能。直到回合结束前，你获得该技能。',
  kind: 'passive',
  trigger: ['onTurnStart', 'onTurnEnd'],
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, eventName } = context;
    
    if (eventName === 'onTurnEnd') {
      if ((gameState as any).stolenSkill && (gameState as any).stolenSkill.sourceTokenId === sourceTokenId) {
        helpers.addLog(`【偷天换日】持续时间结束。`, playerIndex);
        (gameState as any).stolenSkill = null;
      }
      return { success: true };
    }

    // onTurnStart
    const enemyPlayer = 1 - playerIndex;
    const enemyCards = gameState.tableCards.filter(c => c.type === 'hero' && (enemyPlayer === 0 ? c.y > 0 : c.y < 0));
    const enemySkills: string[] = [];

    enemyCards.forEach(ec => {
      const eToken = gameState.tokens.find(t => t.boundToCardId === ec.id);
      if (eToken) {
        // Need dynamic require for HEROES_DATABASE to avoid circular issues
        const { HEROES_DATABASE } = require('../../../shared/config/heroes.ts');
        const heroData = HEROES_DATABASE.heroes.find((h: any) => h.name === eToken.heroClass || h.id === eToken.heroClass);
        if (heroData) {
          const levelData = heroData.levels[eToken.lv.toString()];
          if (levelData && levelData.skills) {
            levelData.skills.forEach((sk: any) => {
              if (sk.id && sk.id !== 'steal_skills') { // Don't steal itself
                enemySkills.push(sk.id);
              }
            });
          }
        }
      }
    });

    if (enemySkills.length === 0) return { success: true };

    const { SKILLS_LIBRARY } = await import('../../../shared/config/skills.ts');
    const skillOptions = enemySkills.map(id => ({
        id, 
        name: SKILLS_LIBRARY[id]?.name || id,
        description: SKILLS_LIBRARY[id]?.description || ''
    })).concat([{ id: 'cancel', name: '不发动', description: '忽略此技能' }]);

    const selectedSkillId = await helpers.promptPlayer!(playerIndex, 'select_skill', {
        skills: skillOptions,
        message: '偷天换日：请选择一个要窃取的敌方技能。'
    });

    if (selectedSkillId && selectedSkillId !== 'cancel') {
        const skillName = SKILLS_LIBRARY[selectedSkillId]?.name || selectedSkillId;
        helpers.addLog(`【偷天换日】发动！窃取了技能：${skillName}，持续到回合结束。`, playerIndex);
        (gameState as any).stolenSkill = { sourceTokenId, skillId: selectedSkillId };
    }

    return { success: true };
  }
};
