import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';
import { skillRegistry } from '../skillRegistry.ts';
import { HeroEngine } from '../../hero/heroEngine.ts';
import { SkillEngine } from '../skillEngine.ts';
import { pixelToHex, getHexDistance } from '../../../shared/utils/hexUtils.ts';
import { HEROES_DATABASE } from '../../../shared/config/heroes.ts';

export const commanderCommand: SkillDefinition = {
  id: 'command',
  name: '指挥',
  description: '弃置 1 张手牌：本次行动点改为由另一名英雄行动。',
  kind: 'active',
  canUse: (context: SkillContext) => {
    const { gameState, playerIndex } = context;
    const playerId = gameState.seats[playerIndex];
    const player = playerId ? gameState.players[playerId] : null;
    if (!player || player.hand.length === 0) {
      return { canUse: false, reason: '手牌不足，无法发动指挥 (Insufficient cards)' };
    }
    return true;
  },
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId } = context;
    
    if (helpers.promptPlayer) {
      const result = await helpers.promptPlayer(playerIndex, 'discard_card', {
        count: 1,
        message: '请选择一张手牌弃置以发动【指挥】'
      });

      if (result && result.discardedCardIds && result.discardedCardIds.length > 0) {
        const cardId = result.discardedCardIds[0];
        const playerId = gameState.seats[playerIndex];
        const player = playerId ? gameState.players[playerId] : null;
        if (!player) return { success: false, reason: '找不到玩家' };
        
        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        
        if (cardIndex !== -1) {
          const [discardedCard] = player.hand.splice(cardIndex, 1);
          gameState.discardPiles.action.push(discardedCard);
          
          helpers.addLog(`指挥官弃置了 1 张手牌，发动了【指挥】`, playerIndex);
          
          // 进入选择替身英雄阶段
          gameState.phase = 'action_select_substitute';
          gameState.notification = '请选择另一名英雄进行行动。';
          
          // 触发指挥使用事件，用于联动“跟进”
          await SkillEngine.triggerEvent('onCommandUsed', gameState, helpers as any, {
            sourceTokenId
          });

          return { success: true };
        }
      }
    }

    return { success: false, reason: '取消发动或弃牌失败' };
  }
};

export const commanderFollowUp: SkillDefinition = {
  id: 'follow_up',
  name: '跟进',
  description: '使用【指挥】后，指挥官可以进行一次移动或进行一次攻击。',
  kind: 'passive',
  trigger: 'onCommandUsed' as any,
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, sourceTokenId } = context;
    
    gameState.pendingFollowUp = true;
    gameState.commanderTokenId = sourceTokenId;
    helpers.addLog(`指挥官准备【跟进】行动`, context.playerIndex);
    
    return { success: true };
  }
};

export const commanderDispatch: SkillDefinition = {
  id: 'dispatch',
  name: '临场调度',
  description: '每回合一次，选择 2 格内一名友方英雄。该英雄使用一次主动技能；然后指挥官使用一次相同技能。若所选为终极技，则该英雄须消耗其对应的行动 token。',
  kind: 'active',
  targetType: 'token',
  canUse: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId } = context;
    if (gameState.usedDispatchThisTurn?.includes(sourceTokenId)) {
      return { canUse: false, reason: '本回合已使用过临场调度' };
    }
    
    const targets = commanderDispatch.getValidTargets!(context);
    if (targets.length === 0) {
      return { canUse: false, reason: '范围内没有友方英雄可调度' };
    }

    return true;
  },
  getValidTargets: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId } = context;
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return [];

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);

    return gameState.tokens
      .filter(t => {
        if (t.id === sourceTokenId) return false;
        // 检查是否是英雄：通过 type 或是否有 heroClass 判定
        if (t.type !== 'hero' && !t.heroClass) return false;
        
        const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
        if (!card) return false;
        const ownerIndex = (card.y > 0) ? 0 : 1;
        if (ownerIndex !== playerIndex) return false;

        const targetHex = pixelToHex(t.x, t.y);
        return getHexDistance(sourceHex, targetHex) <= 2;
      })
      .map(t => t.id);
  },
  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, targetTokenId } = context;
    if (!targetTokenId) return { success: false, reason: '未选择目标' };

    const targetToken = gameState.tokens.find(t => t.id === targetTokenId);
    const targetCard = gameState.tableCards.find(c => c.id === targetToken?.boundToCardId);
    if (!targetCard) return { success: false, reason: '目标英雄不存在' };

    // 获取目标英雄的主动技能
    const heroData = HEROES_DATABASE.heroes.find((h: any) => h.id === targetCard.heroClass || h.name === targetCard.heroClass);
    
    // 识别终极技 (Lv3 新增的技能)
    const lv2Skills = heroData?.levels["2"]?.skills || [];
    const lv3Skills = heroData?.levels["3"]?.skills || [];
    const ultimateSkillId = lv3Skills.find(s3 => !lv2Skills.some(s2 => s2.id === s3.id))?.id;

    // 检查目标英雄是否有未使用的行动 Token
    const hasUnusedToken = gameState.actionTokens.some(at => at.playerIndex === playerIndex && at.heroCardId === targetCard.id && !at.used);

    // 使用 SkillEngine 获取目标英雄可用的主动技能列表
    const targetContextForOptions: SkillContext = {
      gameState,
      playerIndex,
      sourceTokenId: targetTokenId,
    };
    const options = SkillEngine.getActiveSkillOptions(targetContextForOptions);
    
    const activeSkills = options
      .filter(opt => {
        if (opt.skillId === 'dispatch') return false;
        // 如果是终极技且没有 Token，则过滤掉
        if (targetCard.level === 3 && opt.skillId === ultimateSkillId && !hasUnusedToken) return false;
        return opt.isAvailable;
      })
      .map(opt => ({
        id: opt.skillId,
        name: opt.name,
        description: opt.description
      }));

    if (activeSkills.length === 0) {
      return { success: false, reason: '目标英雄没有可用的主动技能（或终极技因缺少行动 Token 无法使用）' };
    }

    if (helpers.promptPlayer) {
      const selectedSkillId = await helpers.promptPlayer(playerIndex, 'select_skill', {
        skills: activeSkills,
        message: `请选择 ${targetCard.heroClass} 要发动的技能`
      });

      if (selectedSkillId) {
        helpers.addLog(`指挥官发动【临场调度】，命令 ${targetCard.heroClass} 发动技能`, playerIndex);
        
        if (!gameState.usedDispatchThisTurn) gameState.usedDispatchThisTurn = [];
        gameState.usedDispatchThisTurn.push(sourceTokenId);

        // 初始化技能队列
        gameState.skillQueue = [
          {
            skillId: selectedSkillId,
            sourceTokenId: targetTokenId,
            playerIndex: playerIndex,
            ignoreConditions: true,
            canUndo: true
          },
          {
            skillId: selectedSkillId,
            sourceTokenId: sourceTokenId,
            playerIndex: playerIndex,
            ignoreConditions: true,
            canUndo: false
          }
        ];
        
        return { success: true };
      }
    }

    return { success: false, reason: '取消调度' };
  }
};
