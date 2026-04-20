import { SkillDefinition, SkillContext, SkillHelpers, SkillResult } from '../types.ts';
import { getHexDistance, pixelToHex } from '../../../shared/utils/hexUtils.ts';

export const guardianSwap: SkillDefinition = {
  id: 'guardian_swap',
  name: '守护换位',
  description: '当距离 2 以内的我方英雄受到攻击时，你可以与其交换位置，并成为该次攻击的目标。',
  kind: 'semi_passive',
  trigger: 'onBeforeAttack',
  
  canUse: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId, defenderTokenId } = context;
    if (!defenderTokenId || defenderTokenId === sourceTokenId) return false;

    // Check if defender is an ally
    const defenderToken = gameState.tokens.find(t => t.id === defenderTokenId);
    if (!defenderToken) return false;
    const defenderCard = gameState.tableCards.find(c => c.id === defenderToken.boundToCardId);
    if (!defenderCard) return false;

    // CRITICAL: Ensure the target hasn't already been swapped by another heavy armor
    if (gameState.selectedTargetId !== defenderCard.id) return false;

    const defenderOwnerIndex = defenderCard.y > 0 ? 0 : 1;
    if (defenderOwnerIndex !== playerIndex) return false;

    // Check distance <= 2
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return false;

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const defenderHex = pixelToHex(defenderToken.x, defenderToken.y);
    const dist = getHexDistance(sourceHex, defenderHex);

    return dist <= 2;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, defenderTokenId } = context;
    
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const defenderToken = gameState.tokens.find(t => t.id === defenderTokenId);
    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken?.boundToCardId);
    const defenderCard = gameState.tableCards.find(c => c.id === defenderToken?.boundToCardId);

    if (!sourceToken || !defenderToken || !sourceCard || !defenderCard) {
      return { success: false };
    }

    if (helpers.promptPlayer) {
      const response = await helpers.promptPlayer(playerIndex, 'guardian_swap', {
        message: `是否使用【守护换位】代替 ${defenderCard.heroClass} 承受攻击？`,
        sourceTokenId,
        defenderTokenId
      });

      if (response) {
        // Swap positions
        const tempX = sourceToken.x;
        const tempY = sourceToken.y;
        sourceToken.x = defenderToken.x;
        sourceToken.y = defenderToken.y;
        defenderToken.x = tempX;
        defenderToken.y = tempY;

        // Change target
        gameState.selectedTargetId = sourceCard.id;
        
        helpers.addLog(`${sourceCard.heroClass} 发动了【守护换位】，与 ${defenderCard.heroClass} 交换了位置并成为了攻击目标！`, playerIndex);
        helpers.broadcastState();
      }
    }

    return { success: true, data: { interrupt: false } }; // Don't interrupt the whole flow, just modify state inline
  }
};

export const suppression: SkillDefinition = {
  id: 'suppression',
  name: '压制',
  description: '每名敌方英雄每回合第一次从重甲战士的相邻格移动时（包括经过），须弃置 1 张手牌；否则不能执行此次移动。',
  kind: 'passive',
  trigger: 'onBeforeMove',
  
  canUse: (context: SkillContext) => {
    const { gameState, playerIndex, sourceTokenId, movingTokenId } = context;
    if (!movingTokenId) return false;

    // Check if movingToken is an enemy hero
    const movingToken = gameState.tokens.find(t => t.id === movingTokenId);
    if (!movingToken) return false;
    const movingCard = gameState.tableCards.find(c => c.id === movingToken.boundToCardId);
    if (!movingCard) return false;
    const movingOwnerIndex = movingCard.y > 0 ? 0 : 1;
    if (movingOwnerIndex === playerIndex) return false; // Must be enemy

    // Check if already suppressed this turn
    if (gameState.suppressedTokensThisTurn?.includes(movingTokenId)) return false;

    // Check if movingToken is adjacent to the Heavy Armored Soldier (sourceTokenId)
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    if (!sourceToken) return false;

    const sourceHex = pixelToHex(sourceToken.x, sourceToken.y);
    const movingHex = pixelToHex(movingToken.x, movingToken.y);
    const distance = getHexDistance(sourceHex, movingHex);

    if (distance !== 1) return false;

    return true;
  },

  execute: async (context: SkillContext, helpers: SkillHelpers): Promise<SkillResult> => {
    const { gameState, playerIndex, sourceTokenId, movingTokenId } = context;
    
    const movingToken = gameState.tokens.find(t => t.id === movingTokenId);
    const movingCard = gameState.tableCards.find(c => c.id === movingToken?.boundToCardId);
    const sourceToken = gameState.tokens.find(t => t.id === sourceTokenId);
    const sourceCard = gameState.tableCards.find(c => c.id === sourceToken?.boundToCardId);
    
    if (!movingToken || !movingCard || !sourceToken || !sourceCard) return { success: false };
    
    const movingOwnerIndex = movingCard.y > 0 ? 0 : 1;

    if (helpers.promptPlayer) {
      // Prompt the ENEMY player (movingOwnerIndex)
      const response = await helpers.promptPlayer(movingOwnerIndex, 'suppression_discard', {
        message: `${sourceCard.heroClass} 发动了【压制】！你必须弃置 1 张手牌才能继续移动，否则移动将被取消。`,
        sourceTokenId,
        movingTokenId
      });

      if (response && response.discardedCardId) {
        // Discard the card
        const cardId = response.discardedCardId;
        const playerId = gameState.seats[movingOwnerIndex];
        const hand = gameState.players[playerId].hand;
        const cardIndex = hand.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          const [discardedCard] = hand.splice(cardIndex, 1);
          gameState.discardPiles.action.push(discardedCard);
          
          // Add to suppressed list only if successfully discarded and moved
          if (!gameState.suppressedTokensThisTurn) gameState.suppressedTokensThisTurn = [];
          gameState.suppressedTokensThisTurn.push(movingTokenId);

          helpers.addLog(`${movingCard.heroClass} 弃置了 1 张手牌以突破 ${sourceCard.heroClass} 的【压制】！`, movingOwnerIndex);
          helpers.broadcastState();
          return { success: true, data: { interrupt: false } };
        }
      }

      // If cancelled or failed to discard
      helpers.addLog(`${movingCard.heroClass} 无法突破 ${sourceCard.heroClass} 的【压制】，移动被取消！`, movingOwnerIndex);
      helpers.broadcastState();
      return { success: true, data: { interrupt: true } };
    }

    return { success: true, data: { interrupt: false } };
  }
};
