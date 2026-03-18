import { GameState, TableCard, Token, ActionCard, HeroCard, GamePhase, Card } from '../../shared/types';
import { hexToPixel, generateId } from '../../shared/utils/hexUtils';
import { getHeroTokenImage } from '../../shared/utils/assetUtils';

/**
 * 卡牌效果引擎
 */
export class CardLogic {
  /**
   * 检查是否可以打出卡牌
   */
  static canPlayCard(card: Card, gameState: GameState, playerIndex: number): { canPlay: boolean; reason?: string } {
    const allowedPhases = ['action_select_card', 'discard', 'setup', 'action_select_option', 'action_defend', 'action_play_defense', 'action_resolve_attack_counter', 'action_play_counter'];
    
    if (!allowedPhases.includes(gameState.phase)) {
      return { canPlay: false, reason: '当前阶段不允许打出卡牌。' };
    }

    if (gameState.phase === 'action_select_option') {
      return { canPlay: false, reason: '请先完成当前卡牌的结算。' };
    }

    if (gameState.phase === 'action_defend' || gameState.phase === 'action_play_defense') {
      if (card.name !== '防御' && card.name !== '闪避') {
        return { canPlay: false, reason: '只能打出防御卡。' };
      }
    }

    if (gameState.phase === 'action_play_counter') {
      if (card.name !== '行动') {
        return { canPlay: false, reason: '只能打出攻击卡。' };
      }
    }

    return { canPlay: true };
  }

  /**
   * 打出卡牌的主入口
   */
  static playCard(
    gameState: GameState,
    playerIndex: number,
    socketId: string,
    cardId: string,
    x: number | undefined,
    y: number | undefined,
    targetCastleIndex: number | undefined,
    helpers: {
      addLog: (msg: string, pIdx: number) => void;
      broadcastState: () => void;
      setPhase: (phase: GamePhase) => void;
      alignHireArea: () => void;
      createActionTokensForPlayer: (id: string) => void;
      updateAvailableActions: (pIdx: number) => void;
      drawCards: (pIdx: number, count: number) => void;
      discardOpponentCard: (pIdx: number) => void;
    }
  ): { success: boolean; reason?: string } {
    const player = gameState.players[socketId];
    if (!player) return { success: false, reason: '找不到玩家。' };

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, reason: '找不到该卡牌。' };

    const card = player.hand[cardIndex];

    // 1. 基础检查
    const playCheck = this.canPlayCard(card, gameState, playerIndex);
    if (!playCheck.canPlay) return { success: false, reason: playCheck.reason };

    // 2. 移除手牌
    player.hand.splice(cardIndex, 1);

    // 3. 分支处理：英雄牌
    if (card.type === 'hero') {
      const playedCount = gameState.heroPlayedCount[socketId] || 0;
      if (playedCount >= 2) {
        player.hand.push(card); // 放回手牌
        return { success: false, reason: '你已经打出了两名英雄。' };
      }

      gameState.heroPlayedCount[socketId] = playedCount + 1;
      const { tableCard, token, logs } = this.applyHeroCard(card as HeroCard, targetCastleIndex, gameState, playerIndex);
      logs.forEach(log => helpers.addLog(log, playerIndex));

      gameState.tableCards.push(tableCard);
      gameState.tokens.push(token);

      // 生成计数器
      gameState.counters.push({ id: generateId(), type: 'exp', x: tableCard.x! + 50, y: tableCard.y! - 30, value: 0, boundToCardId: tableCard.id });
      gameState.counters.push({ id: generateId(), type: 'damage', x: tableCard.x! + 50, y: tableCard.y! + 180, value: 0, boundToCardId: tableCard.id });

      // 检查是否完成初始放置
      if (gameState.heroPlayedCount[socketId] === 2) {
        gameState.heroPlayed[socketId] = true;
        
        // 剩余英雄进入招募区
        const otherHeroes = player.hand.filter(c => c.type === 'hero');
        player.hand = player.hand.filter(c => c.type !== 'hero');
        otherHeroes.forEach(h => {
          gameState.hireAreaCards.push({ ...h, x: 0, y: 0, faceUp: true });
        });
        helpers.alignHireArea();

        // 补牌
        helpers.drawCards(playerIndex, 4);
      }

      // 检查所有玩家是否都已完成放置
      const allPlayed = gameState.seats.filter(id => id !== null).every(id => gameState.heroPlayed[id!]);
      if (allPlayed) {
        gameState.decks.hero = [];
        if (gameState.phase === 'setup') {
          helpers.setPhase('action_play');
          gameState.seats.forEach(id => {
            if (id) helpers.createActionTokensForPlayer(id);
          });
        }
        gameState.activePlayerIndex = gameState.firstPlayerIndex;
        gameState.consecutivePasses = 0;
        gameState.round = 1;
      } else {
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
      }

      gameState.lastPlayedCardId = tableCard.id;
    } 
    // 4. 分支处理：行动牌
    else if (card.type === 'action') {
      const playAreaX = 650;
      const playAreaY = 100;
      const offset = gameState.playAreaCards.length * 30;
      const tableCard: TableCard = { ...card, x: playAreaX + offset, y: playAreaY, faceUp: true };
      gameState.playAreaCards.push(tableCard);
      gameState.lastPlayedCardId = tableCard.id;
      
      // 清理移动历史
      gameState.movedTokens = undefined;
      gameState.movementHistory = undefined;

      const { logs, nextPhase } = this.applyActionCard(card as ActionCard, gameState, playerIndex);
      logs.forEach(log => helpers.addLog(log, playerIndex));

      // 特殊处理：间谍
      if (card.name === '间谍') {
        helpers.discardOpponentCard(playerIndex);
      }

      if (nextPhase) {
        helpers.setPhase(nextPhase as GamePhase);
        if (nextPhase === 'action_select_option') {
          gameState.selectedOption = null;
          gameState.selectedTargetId = null;
          gameState.consecutivePasses = 0;
          helpers.updateAvailableActions(playerIndex);
        }
      } else if (gameState.phase === 'action_play_defense') {
        helpers.setPhase('action_defend');
      } else if (gameState.phase === 'action_play_counter') {
        helpers.setPhase('action_resolve_attack_counter');
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
      }
    }
    // 5. 分支处理：其他（宝藏等）
    else {
      const tableCard: TableCard = { ...card, x: x || 0, y: y || 0, faceUp: true };
      gameState.tableCards.push(tableCard);
      gameState.lastPlayedCardId = tableCard.id;
      
      if (gameState.phase === 'action_play') {
        helpers.setPhase('action_select_option');
        gameState.selectedOption = null;
        gameState.selectedTargetId = null;
        gameState.consecutivePasses = 0;
      }
    }

    return { success: true };
  }

  /**
   * 执行英雄牌效果
   */
  static applyHeroCard(
    card: HeroCard, 
    targetCastleIndex: number | undefined, 
    gameState: GameState, 
    playerIndex: number
  ): { tableCard: TableCard; token: Token; logs: string[] } {
    const isPlayer1 = playerIndex === 0;
    const logs: string[] = [];
    
    logs.push(`玩家${playerIndex + 1}选择了英雄：${card.heroClass}`);

    // 计算英雄牌位置
    const playerHeroes = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (!isPlayer1 && c.y < 0)));
    const heroCount = playerHeroes.length;
    const heroX = -50 + (heroCount * 120);
    const heroY = isPlayer1 ? 550 : -700;
    
    const tableCard: TableCard = { ...card, x: heroX, y: heroY, faceUp: true, level: 1 };
    
    // 生成 Token
    const castleIdx = (targetCastleIndex !== undefined) ? targetCastleIndex : 0;
    const playerCastles = gameState.map!.castles[playerIndex as 0 | 1];
    const castleCoord = playerCastles[castleIdx] || playerCastles[0];
    const castlePos = hexToPixel(castleCoord.q, castleCoord.r);
    
    const token: Token = {
      id: generateId(),
      x: castlePos.x,
      y: castlePos.y,
      image: getHeroTokenImage(card.heroClass!),
      label: `${card.heroClass} Lv1`,
      lv: 1,
      time: 0,
      boundToCardId: tableCard.id
    };

    return { tableCard, token, logs };
  }

  /**
   * 执行行动牌效果
   */
  static applyActionCard(
    card: ActionCard, 
    gameState: GameState, 
    playerIndex: number
  ): { logs: string[]; nextPhase?: string } {
    const logs: string[] = [];
    let nextPhase: string | undefined;

    if (gameState.phase === 'action_play' || gameState.phase === 'setup') {
      logs.push(`玩家${playerIndex + 1}打出了${card.name}`);
      nextPhase = 'action_select_option';
    } else if (gameState.phase === 'action_select_card') {
      logs.push(`玩家${playerIndex + 1}打出了增强卡${card.name}`);
      
      // 立即效果处理
      if (card.name === '回复' || card.name === '治疗药水') {
        const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
        if (heroToken) {
          const targetCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
          if (targetCard && targetCard.damage && targetCard.damage > 0) {
            targetCard.damage -= 1;
            logs.push(`玩家${playerIndex + 1}使用了回复，英雄恢复1点生命`);
          }
        }
      } else if (card.name === '间谍') {
        // 间谍逻辑涉及随机弃牌，建议在 server.ts 处理或返回指令
        // 这里仅记录日志
      }

      if (card.name === '替身') {
        nextPhase = 'action_select_substitute';
      } else {
        nextPhase = 'action_select_action';
      }
    }

    return { logs, nextPhase };
  }
}
