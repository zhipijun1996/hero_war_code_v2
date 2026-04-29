import { GameState, TableCard, Token, ActionCard, HeroCard, GamePhase, Card } from '../../shared/types/index.ts';
import { hexToPixel, generateId } from '../../shared/utils/hexUtils';
import { getHeroTokenImage } from '../../shared/utils/assetUtils';
import { applyEnhancementImmediateEffect } from './enhancementImmediateEffects';
import { isEnhancementCardName, requiresSubstituteSelection } from './enhancementModifiers.ts';
import { HeroEngine } from '../hero/heroEngine';
import { HEROES_DATABASE } from '../../shared/config/heroes.ts';

/**
 * 卡牌效果引擎
 */
export class CardLogic {
  /**
   * 检查是否可以打出卡牌
   */
  static canPlayCard(card: Card, gameState: GameState, playerIndex: number): { canPlay: boolean; reason?: string } {
    const allowedPhases = ['action_play_enhancement', 'discard', 'setup', 'action_defend',  'action_resolve_attack_counter'];
    
    if (!allowedPhases.includes(gameState.phase)) {
      return { canPlay: false, reason: '当前阶段不允许打出卡牌。' };
    }

    if (gameState.phase === 'action_play_enhancement') {
      if (!isEnhancementCardName(card.name)) {
        return { canPlay: false, reason: '只能打出增强卡。' };
      }
    }

    if (gameState.phase === 'action_defend') {
      if (card.name !== '防御') {
        const defenderToken = gameState.tokens.find((t: any) => t.boundToCardId === gameState.selectedTargetId);
        let hasResolute = false;
        if (defenderToken?.heroClass) {
          const heroData = HEROES_DATABASE.heroes.find(h => h.name === defenderToken.heroClass || h.id === defenderToken.heroClass);
          if (heroData) {
            const levelData = heroData.levels[defenderToken.lv.toString()];
            if (levelData?.skills?.some(s => s.id === 'resolute')) {
              hasResolute = true;
            }
          }
        }
        if (!hasResolute) {
          return { canPlay: false, reason: '只能打出防御卡。' };
        }
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
    if (playerIndex !== 0 && playerIndex !== 1) {
      return { success: false, reason: '无效的玩家索引。' };
    }

    const resolvedPlayerId =
      gameState.players[socketId]
        ? socketId
        : ((playerIndex === 0 || playerIndex === 1)
            ? gameState.seats?.[playerIndex] || socketId
            : socketId);

    const player = resolvedPlayerId ? gameState.players[resolvedPlayerId] : undefined;
    if (!player) return { success: false, reason: '找不到玩家。' };

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, reason: '找不到该卡牌。' };

    const card = player.hand[cardIndex];

    // 1. 基础检查
    const playCheck = this.canPlayCard(card, gameState, playerIndex);
    if (!playCheck.canPlay) return { success: false, reason: playCheck.reason };

    // 2. 移除手牌
    player.hand.splice(cardIndex, 1);

    if (gameState.phase === 'action_defend' || gameState.phase === 'action_play_defense') {
      card.type = 'action';
    }

    // 3. 分支处理：英雄牌
    if (card.type === 'hero') {
      const playedCount = gameState.heroPlayedCount[resolvedPlayerId] || 0;
      if (playedCount >= 2) {
        player.hand.push(card); // 放回手牌
        return { success: false, reason: '你已经打出了两名英雄。' };
      }

      gameState.heroPlayedCount[resolvedPlayerId] = playedCount + 1;
      
      const isPlayer1 = playerIndex === 0;
      const playerHeroes = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (!isPlayer1 && c.y < 0)));
      const heroCount = playerHeroes.length;
      const heroX = -50 + (heroCount * 120);
      const heroY = isPlayer1 ? 550 : -700;
      
      const tableCard: TableCard = { ...card, x: heroX, y: heroY, faceUp: true, level: 1 };
      
      const castleIdx = (targetCastleIndex !== undefined) ? targetCastleIndex : 0;
      const playerCastles = gameState.map?.castles?.[playerIndex as 0 | 1] || [];
      const castleCoord = playerCastles[castleIdx] || playerCastles[0];
      
      if (!castleCoord) {
        return { success: false, reason: '错误：找不到王城坐标' };
      }

      const { token, counters } = HeroEngine.createHeroToken(tableCard, castleCoord.q, castleCoord.r, gameState);
      
      helpers.addLog(`玩家${playerIndex + 1}选择了英雄：${card.heroClass}`, playerIndex);

      gameState.tableCards.push(tableCard);
      gameState.tokens.push(token);
      gameState.counters.push(...counters);

      // 检查是否完成初始放置
      if (gameState.heroPlayedCount[resolvedPlayerId] === 2) {
        gameState.heroPlayed[resolvedPlayerId] = true;
        
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
        // 轮到下一个玩家
        let nextIndex = (gameState.activePlayerIndex + 1) % gameState.seats.length;
        while (!gameState.seats[nextIndex] && nextIndex !== gameState.activePlayerIndex) {
          nextIndex = (nextIndex + 1) % gameState.seats.length;
        }
        gameState.activePlayerIndex = nextIndex;
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
      
      if (gameState.phase === 'action_defend' || gameState.phase === 'action_play_defense') {
        const defenderToken = gameState.tokens.find((t: any) => t.boundToCardId === gameState.selectedTargetId);
        let hasResolute = false;
        if (defenderToken?.heroClass) {
          const heroData = HEROES_DATABASE.heroes.find(h => h.name === defenderToken.heroClass || h.id === defenderToken.heroClass);
          if (heroData) {
            const levelData = heroData.levels[defenderToken.lv.toString()];
            if (levelData?.skills?.some(s => s.id === 'resolute')) {
              hasResolute = true;
            }
          }
        }

        if (card.name === '防御' || hasResolute) {
          gameState.hasDefenseCard = true;
          gameState.pendingDefenseCardId = tableCard.id;
          gameState.lastPlayedCardId = tableCard.id;
          gameState.isDefended = false;
          gameState.isCounterAttack = false;
          // If using resolute with a non-defense card, they cannot counter attack!
          gameState.canCounterAttack = false;

          // Note: we'll let ActionEngine and CombatLogic know about the state via `canCounterAttack` 
          // However, ActionEngine explicitly recalculates canCounterAttack after playing card:
          //   gameState.canCounterAttack = CombatLogic.canCounterAttack(gameState, playerIndex);
          // Therefore, we must pass the knowledge that we used resolute down.
          // Let's add a flag on gameState tracking if resolute was used for this defense.
          if (card.name !== '防御') {
             (gameState as any).usedResoluteForDefense = true;
          } else {
             (gameState as any).usedResoluteForDefense = false;
          }
        }
      }
      
      // 清理移动历史
      gameState.movedTokens = undefined;
      gameState.movementHistory = undefined;

      const { logs, nextPhase } = this.applyActionCard(
        card as ActionCard,
        gameState,
        playerIndex,{
          addLog: helpers.addLog,
          discardOpponentCard: helpers.discardOpponentCard
        }
        );
      logs.forEach(log => helpers.addLog(log, playerIndex));

      if (nextPhase) {
        helpers.setPhase(nextPhase as GamePhase);
      } 
    }
    // 5. 分支处理：其他（宝藏等）
    else {
      const tableCard: TableCard = { ...card, x: x || 0, y: y || 0, faceUp: true };
      gameState.tableCards.push(tableCard);
      gameState.lastPlayedCardId = tableCard.id;
      
      if (gameState.phase === 'action_play') {
        helpers.setPhase('action_play');
        gameState.selectedOption = null;
        gameState.selectedTargetId = null;
        gameState.consecutivePasses = 0;
      }
    }

    return { success: true };
  }

  /**
   * 执行行动牌效果
   */
  static applyActionCard(
    card: ActionCard, 
    gameState: GameState, 
    playerIndex: number,
    helpers?: {
      addLog?: (message: string, playerIndex?: number) => void;
      discardOpponentCard?: (playerIndex: number) => void;
    }
  ): { logs: string[]; nextPhase?: string } {
    const logs: string[] = [];
    let nextPhase: string | undefined;

    if (gameState.phase === 'action_play' || gameState.phase === 'setup') {
      logs.push(`玩家${playerIndex + 1}打出了${card.name}`);
      nextPhase = 'action_play';
    } else if (gameState.phase === 'action_defend' || gameState.phase === 'action_play_defense') {
      if (card.name !== '防御') {
        logs.push(`玩家${playerIndex + 1}消耗了一张【${card.name}】发动了坚毅防御！`);
      } else {
        logs.push(`玩家${playerIndex + 1}打出了防御！`);
      }
    } else if (
      gameState.phase === 'action_play_enhancement'
    ) {
      logs.push(`玩家${playerIndex + 1}打出了增强卡${card.name}`);

      applyEnhancementImmediateEffect(card.name || '', {
        gameState,
        playerIndex,
        addLog: (message: string) => logs.push(message),
        discardOpponentCard: helpers?.discardOpponentCard || (() => {})
      });

      if (requiresSubstituteSelection(card.name)) {
        nextPhase = 'action_select_substitute';
      } else {
        nextPhase = 'action_select_action';
      }
    }

    return { logs, nextPhase };
  }
}
