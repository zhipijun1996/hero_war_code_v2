import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';

export const steadfast: SkillDefinition = {
  id: 'steadfast',
  name: '坚守',
  description: '当你防御成功后，攻击者本回合移动力-1',
  kind: 'passive',
  trigger: 'onDefended',
  
  canUse: (context: SkillContext) => {
    const { gameState, sourceTokenId, defenderTokenId, attackerTokenId } = context;
    // Only trigger if this hero is the defender
    if (sourceTokenId !== defenderTokenId) return false;
    
    // Only trigger if there is an attacker
    if (!attackerTokenId) return false;
    
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, attackerTokenId } = context;
    
    const defenderToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const defenderCard = gameState.tableCards.find(c => c.id === defenderToken?.boundToCardId);
    const attackerToken = gameState.tokens.find(t => t.id === attackerTokenId);
    const attackerCard = gameState.tableCards.find(c => c.id === attackerToken?.boundToCardId);
    
    if (!defenderToken || !defenderCard || !attackerToken || !attackerCard) return { success: false };
    
    if (!gameState.turnModifiers) gameState.turnModifiers = [];
    
    gameState.turnModifiers.push({
      tokenId: attackerTokenId!,
      stat: 'mv',
      value: -1,
      type: 'add',
      sourceSkillId: 'steadfast'
    });
    
    helpers.addLog(`${defenderCard.heroClass} 发动了【坚守】，${attackerCard.heroClass} 本回合移动力 -1！`, playerIndex);
    helpers.broadcastState();
    
    return { success: true, data: { interrupt: false } };
  }
};

export const hardened: SkillDefinition = {
  id: 'hardened',
  name: '坚硬',
  description: '被攻击时，攻击者必须额外弃一张牌，否则攻击失效。被攻击只能防御，无法反击',
  kind: 'passive',
  trigger: 'onBeforeAttack',
  
  canUse: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId, defenderTokenId } = context;
    // Only trigger if this hero is the defender
    if (sourceTokenId !== defenderTokenId) return false;
    
    // Check if attacker is a hero
    const attackerTokenId = context.attackerTokenId;
    if (!attackerTokenId) return false;
    const attackerToken = gameState.tokens.find(t => t.id === attackerTokenId);
    if (!attackerToken || !attackerToken.heroClass) return false; // Only heroes have cards to discard
    
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, attackerTokenId } = context;
    
    const defenderToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const defenderCard = gameState.tableCards.find(c => c.id === defenderToken?.boundToCardId);
    const attackerToken = gameState.tokens.find(t => t.id === attackerTokenId);
    const attackerCard = gameState.tableCards.find(c => c.id === attackerToken?.boundToCardId);
    
    if (!defenderToken || !defenderCard || !attackerToken || !attackerCard) return { success: false };
    
    const attackerOwnerIndex = attackerCard.y > 0 ? 0 : 1;

    if (helpers.promptPlayer) {
      // Prompt the attacker
      const response = await helpers.promptPlayer(attackerOwnerIndex, 'hardened_discard', {
        message: `${defenderCard.heroClass} 发动了【坚硬】！你必须额外弃置 1 张手牌才能继续攻击，否则攻击将失效。`,
        sourceTokenId,
        attackerTokenId
      });

      if (response && response.discardedCardId) {
        // Discard the card
        const cardId = response.discardedCardId;
        const playerId = gameState.seats[attackerOwnerIndex];
        const hand = gameState.players[playerId].hand;
        const cardIndex = hand.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          const [discardedCard] = hand.splice(cardIndex, 1);
          gameState.discardPiles.action.push(discardedCard);
          
          helpers.addLog(`${attackerCard.heroClass} 弃置了 1 张手牌以突破 ${defenderCard.heroClass} 的【坚硬】！`, attackerOwnerIndex);
          helpers.broadcastState();
          return { success: true, data: { interrupt: false } };
        }
      }

      // If cancelled or failed to discard
      helpers.addLog(`${attackerCard.heroClass} 无法突破 ${defenderCard.heroClass} 的【坚硬】，攻击失效！`, attackerOwnerIndex);
      helpers.broadcastState();
      return { success: true, data: { interrupt: true } };
    }

    return { success: true, data: { interrupt: false } };
  }
};

export const taunt: SkillDefinition = {
  id: 'taunt',
  name: '嘲讽',
  description: '发动后进入嘲讽状态，直到回合结束。',
  kind: 'active',
  targetType: 'none',
  
  canUse: (context: SkillContext) => {
    const { gameState, sourceTokenId } = context;
    // Check if already taunting
    const isTaunting = gameState.statuses?.some(s => s.tokenId === sourceTokenId && s.status === 'taunt');
    if (isTaunting) return { canUse: false, reason: '已经处于嘲讽状态' };
    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId } = context;
    
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken?.boundToCardId);
    
    if (!sourceToken || !sourceCard) return { success: false };
    
    if (!gameState.statuses) gameState.statuses = [];
    
    gameState.statuses.push({
      tokenId: sourceTokenId,
      status: 'taunt',
      sourceSkillId: 'taunt'
    });
    
    helpers.addLog(`${sourceCard.heroClass} 发动了【嘲讽】，进入嘲讽状态！`, playerIndex);
    helpers.broadcastState();
    
    return { success: true };
  }
};
