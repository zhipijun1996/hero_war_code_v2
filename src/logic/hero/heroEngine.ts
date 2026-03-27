import { GameState, TableCard, Token, HeroCard, Counter } from '../../shared/types/index.ts';
import { hexToPixel, generateId } from '../../shared/utils/hexUtils';
import { getHeroTokenImage } from '../../shared/utils/assetUtils';
import { ActionEngine, ActionHelpers } from '../action/actionEngine.ts';
import { canHeroEvolve, getHeroStat, getHeroCardImage, getHeroBackImage } from './heroLogic.ts';
import { HEROES_DATABASE } from '../../shared/config/heroes.ts';
const heroesDatabase = HEROES_DATABASE;
/**
 * 英雄生命周期引擎
 */
export class HeroEngine {
  /**
   * 创建英雄 Token 及其计数器
   */
  static createHeroToken(
    card: HeroCard | TableCard,
    castleQ: number,
    castleR: number,
    gameState: GameState
  ): { token: Token; counters: Counter[] } {
    const castlePos = hexToPixel(castleQ, castleR);
    const tokenId = generateId();
    
    const token: Token = {
      id: tokenId,
      x: castlePos.x,
      y: castlePos.y,
      image: getHeroTokenImage(card.heroClass!),
      heroClass: card.heroClass,
      label: `${card.heroClass} Lv${card.level || 1}`,
      lv: card.level || 1,
      time: 0,
      boundToCardId: card.id
    };

    const counters: Counter[] = [
      { 
        id: generateId(), 
        type: 'exp', 
        x: (card as TableCard).x !== undefined ? (card as TableCard).x + 50 : 0, 
        y: (card as TableCard).y !== undefined ? (card as TableCard).y - 30 : 0, 
        value: 0, 
        boundToCardId: card.id 
      },
      { 
        id: generateId(), 
        type: 'damage', 
        x: (card as TableCard).x !== undefined ? (card as TableCard).x + 50 : 0, 
        y: (card as TableCard).y !== undefined ? (card as TableCard).y + 180 : 0, 
        value: 0, 
        boundToCardId: card.id 
      }
    ];

    return { token, counters };
  }

  /**
   * 雇佣英雄
   */
  static hireHero(
    gameState: GameState,
    playerIndex: number,
    cardId: string,
    goldAmount: number,
    targetCastleIndex: number = 0,
    helpers: { 
      addLog: (msg: string, pIdx: number) => void; 
      alignHireArea: () => void;
      checkAllTokensUsed: () => void;
    }
  ): { success: boolean; reason?: string } {
    const isPlayer1 = playerIndex === 0;
    const goldY = isPlayer1 ? 550 : -700;
    
    // 1. 检查阶段
    const isLeagleHire = gameState.phase === 'hire';
    if ((!isLeagleHire) || playerIndex !== gameState.activePlayerIndex) {
      return { success: false, reason: '现在不是你的雇佣时机。' };
    }

    // 2. 检查卡牌
    const cardIndex = gameState.hireAreaCards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, reason: '找不到该英雄卡牌。' };
    const card = gameState.hireAreaCards[cardIndex];

    // 3. 检查位置
    const playerCastles = gameState.map?.castles?.[playerIndex as 0 | 1] || [];
    let castleCoord = playerCastles[targetCastleIndex];
    let castlePos = castleCoord ? hexToPixel(castleCoord.q, castleCoord.r) : null;
    let castleOccupied = castlePos ? gameState.tokens.some(t => Math.abs(t.x - castlePos!.x) < 10 && Math.abs(t.y - castlePos!.y) < 10) : true;

    if (!castleCoord || castleOccupied) {
      // Find first empty castle
      for (let i = 0; i < playerCastles.length; i++) {
        const coord = playerCastles[i];
        const pos = hexToPixel(coord.q, coord.r);
        const occupied = gameState.tokens.some(t => Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
        if (!occupied) {
          castleCoord = coord;
          castlePos = pos;
          castleOccupied = false;
          break;
        }
      }
    }

    if (!castleCoord) return { success: false, reason: '雇佣失败：找不到王城坐标。' };
    if (castleOccupied) {
      return { success: false, reason: '雇佣失败：所有王城中已经有英雄了。' };
    }

    // 4. 检查金币
    const goldCounter = gameState.counters.find(c => c.type === 'gold' && Math.abs(c.y - goldY) < 100);
    if (!goldCounter || goldCounter.value < goldAmount) {
      return { success: false, reason: '雇佣失败：金币不足。' };
    }

    // 5. 检查英雄上限
    const playerHeroes = gameState.tableCards.filter(c => c.type === 'hero' && Math.abs(c.y - goldY) < 100);
    if (playerHeroes.length >= 4) {
      return { success: false, reason: '雇佣失败：英雄数量已达上限 (4)。' };
    }

    // 6. 执行雇佣
    goldCounter.value -= goldAmount;
    helpers.addLog(`玩家${playerIndex + 1}花费${goldAmount}金币雇佣了${card.heroClass}`, playerIndex);

    gameState.hireAreaCards.splice(cardIndex, 1);
    helpers.alignHireArea();

    const heroX = -50 + (playerHeroes.length * 120);
    const heroY = goldY;
    const tableCard: TableCard = { ...card, x: heroX, y: heroY, faceUp: true, level: 1 };
    gameState.tableCards.push(tableCard);

    const { token, counters } = this.createHeroToken(tableCard, castleCoord.q, castleCoord.r, gameState);
    // 根据金币数量设置初始经验
    const expCounter = counters.find(c => c.type === 'exp');
    if (expCounter) {
      expCounter.value = Math.max(0, goldAmount - 2);
    }
    
    gameState.tokens.push(token);
    gameState.counters.push(...counters);

    // 为新英雄添加行动 Token
    const baseY = isPlayer1 ? 350 : -450;
    gameState.actionTokens.push({
      id: generateId(),
      playerIndex,
      heroCardId: tableCard.id,
      heroClass: tableCard.heroClass!,
      used: false,
      x: -200 + (playerHeroes.length * 80),
      y: baseY
    });

    
    gameState.selectedOption = null;
    gameState.selectedTargetId = null;
    gameState.lastPlayedCardId = null;
    gameState.selectedTokenId = null;
    gameState.remainingMv = 0;
    gameState.reachableCells = [];

    return { success: true };
  }

  /**
   * 复活英雄
   */
  static reviveHero(
    gameState: GameState,
    playerIndex: number,
    heroCardId: string,
    targetCastleIndex: number,
    helpers: ActionHelpers
  ): { success: boolean; reason?: string } {
    if (gameState.phase !== 'revival') return { success: false, reason: '当前不是复活阶段。' };

    if (!gameState.pendingRevivals || gameState.pendingRevivals.length === 0) return { success: false, reason: '没有待复活的英雄。' };
    const revivalIndex = gameState.pendingRevivals.findIndex(r => r.heroCardId === heroCardId && r.playerIndex === playerIndex);
    if (revivalIndex === -1) return { success: false, reason: '找不到该英雄的复活请求。' };

    const playerCastles = gameState.map?.castles?.[playerIndex as 0 | 1] || [];
    const castleCoord = playerCastles[targetCastleIndex] || playerCastles[0];
    if (!castleCoord) return { success: false, reason: '找不到王城坐标。' };
    const castlePos = hexToPixel(castleCoord.q, castleCoord.r);

    const occupied = gameState.tokens.some(t => Math.abs(t.x - castlePos.x) < 10 && Math.abs(t.y - castlePos.y) < 10);
    if (occupied) {
      return { success: false, reason: '王城已被占用，请选择其他位置。' };
    } 

    const heroCard = gameState.tableCards.find(c => c.id === heroCardId);
    const token = gameState.tokens.find(t => t.boundToCardId === heroCardId);
    if (token && heroCard) {
      token.x = castlePos.x;
      token.y = castlePos.y;
      helpers.addLog(`${heroCard.heroClass} 在王城复活！`, playerIndex);
    }

    gameState.pendingRevivals.splice(revivalIndex, 1);

    // 检查是否所有复活都已完成
    if (gameState.pendingRevivals.length === 0) {
      ActionEngine.beginNextRound(gameState, helpers);
    } else {
      gameState.activePlayerIndex = gameState.pendingRevivals[0].playerIndex;
      helpers.broadcastState();
      helpers.checkBotTurn();
    }

    return { success: true };
  }

  static evolveHero(
    gameState: GameState,
    playerIndex: number,
    helpers: ActionHelpers
  ): { success: boolean; reason?: string } {
    const heroToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
    const heroCard = gameState.tableCards.find((c: any) => c.id === heroToken?.boundToCardId);
    const expCounter = gameState.counters.find(
      (c: any) => c.type === 'exp' && c.boundToCardId === heroCard.id
    );
    const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard.heroClass);
    const levelData = heroData?.levels?.[heroCard.level.toString()];
    const expNeeded = levelData?.xp;

    if (!heroToken || !heroCard) {
      return { success:false , reason:'未找到可进化的英雄'};
    } else if(canHeroEvolve(heroCard, gameState)) {
      expCounter.value -= expNeeded;
      heroCard.level += 1;
      heroToken.lv = heroCard.level;
      heroToken.label = `${heroCard.heroClass} Lv${heroCard.level}`;
      gameState.lastEvolvedId = heroCard.id;
      helpers.addLog(`玩家${playerIndex + 1}进化了${heroCard.heroClass}到Lv${heroCard.level}`, playerIndex);
      heroCard.frontImage = getHeroCardImage(heroCard.heroClass, heroCard.level); 
      heroCard.backImage = getHeroBackImage(heroCard.level);
      return { success:true , reason: 'finish evolve'};
    }
    return { success:false , reason: '不满足进化条件'};
  }



}
