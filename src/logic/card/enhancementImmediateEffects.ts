import { GameState } from '../../shared/types';

export type EnhancementImmediateContext = {
  gameState: GameState;
  playerIndex: number;
  addLog: (message: string, playerIndex?: number) => void;
  discardOpponentCard: (playerIndex: number) => void;
};

export function applyEnhancementImmediateEffect(
  cardName: string,
  ctx: EnhancementImmediateContext
): void {
  switch (cardName) {
    case '回复':
    case '治疗药水':
      applyHealEffect(ctx, cardName);
      return;

    case '间谍':
      applySpyEffect(ctx);
      return;

    default:
      return;
  }
}

function applyHealEffect(
  ctx: EnhancementImmediateContext,
  cardName: string
): void {
  const { gameState, playerIndex, addLog } = ctx;

  const heroToken = gameState.tokens.find(
    (t: any) => t.id === gameState.activeHeroTokenId
  );
  if (!heroToken) return;

  const targetCard = gameState.tableCards.find(
    (c: any) => c.id === heroToken.boundToCardId
  );
  if (!targetCard) return;

  if (targetCard.damage && targetCard.damage > 0) {
    targetCard.damage -= 1;

    const damageCounter = gameState.counters.find(
      (c: any) =>
        c.type === 'damage' && c.boundToCardId === heroToken.boundToCardId
    );
    if (damageCounter) {
      damageCounter.value = targetCard.damage;
    }

    addLog(
      `玩家${playerIndex + 1}使用了${cardName}，恢复了${targetCard.heroClass}的1点生命值`,
      playerIndex
    );
    gameState.notification = `${cardName}生效：${targetCard.heroClass}恢复1点生命值`;
  } else {
    gameState.notification = `${cardName}生效，但目标没有受伤`;
  }
}

function applySpyEffect(ctx: EnhancementImmediateContext): void {
  const { gameState, playerIndex, addLog, discardOpponentCard } = ctx;

  const opponentId = gameState.seats[1 - playerIndex];
  const opponent = opponentId ? gameState.players[opponentId] : null;
  const oldHandCount = opponent?.hand?.length || 0;

  discardOpponentCard(playerIndex);

  const newHandCount = opponent?.hand?.length || 0;

  if (newHandCount < oldHandCount) {
    addLog(`玩家${playerIndex + 1}使用了间谍，随机弃掉了对方一张手牌`, playerIndex);
    gameState.notification = '间谍生效：对手随机弃掉了1张手牌';
  } else {
    addLog(`玩家${playerIndex + 1}使用了间谍，但对方没有手牌可弃`, playerIndex);
    gameState.notification = '间谍生效，但对方没有手牌可弃';
  }
}