
import { ActionEngine } from './src/logic/action/actionEngine.ts';
import { HeroEngine } from './src/logic/hero/heroEngine.ts';
import { CardLogic } from './src/logic/card/cardLogic.ts';
import {
  isEnhancementCardName,
  getMoveBonusFromEnhancement,
  getAttackRangeBonusFromEnhancement,
  getAttackDamageBonusFromEnhancement
} from './src/logic/card/enhancementModifiers';

export const createHandlers = (deps: any) => {
  const {
    gameState,
    io,
    actionHelpers,
    HeroEngine,
    addLog,
    checkBotTurn,
    broadcastState,
    checkAllTokensUsed,
    pixelToHex,
    getReachableHexes,
    hexToPixel,
    getRecoilHex,
    REWARDS,
    addReputation,
    getAttackableHexes,
    getPlayerIndex,
    heroesDatabase,
    isTargetInAttackRange,
    getNeighbors,
    alignHireArea,
    setPhase,
    createActionTokensForPlayer,
    updateAvailableActions,
    drawCards,
    discardOpponentCard
  } = deps;

  return {
    play_card: (socket: any, { cardId, x, y, targetCastleIndex }: { cardId: string, x?: number, y?: number, targetCastleIndex?: number }) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);

      const result = CardLogic.playCard(
        gameState,
        playerIndex,
        socket.id,
        cardId,
        x,
        y,
        targetCastleIndex,
        {
          addLog,
          broadcastState,
          setPhase,
          alignHireArea,
          createActionTokensForPlayer,
          updateAvailableActions,
          drawCards: (pIdx: number, count: number) => {
            const sid = gameState.seats?.[pIdx];
            if (sid) drawCards(sid, count);
          },
          discardOpponentCard: (pIdx: number) => {
            const opponentId = gameState.seats?.[1 - pIdx];
            if (opponentId) {
              const opponent = gameState.players?.[opponentId];
              if (opponent && opponent.hand.length > 0) {
                const randomIndex = Math.floor(Math.random() * opponent.hand.length);
                const discarded = opponent.hand.splice(randomIndex, 1)[0];
                gameState.discardPiles.action.push(discarded);
              }
            }
          }
        }
      );

      if (!result.success) {
        socket.emit('error_message', result.reason);
        return;
      }

      broadcastState();
      checkBotTurn();
    },
    discard_card: (socket: any, cardId: string) => {
      const player = gameState.players?.[socket.id];
      if (!player) return;

      if (gameState.phase !== 'discard') {
        let cardIndex = gameState.tableCards.findIndex((c: any) => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.tableCards.splice(cardIndex, 1)[0];
          gameState.discardPiles.action.push(card);
          io.emit('state_update', gameState);
          return;
        }
        
        cardIndex = gameState.hireAreaCards.findIndex((c: any) => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.hireAreaCards.splice(cardIndex, 1)[0];
          gameState.discardPiles.action.push(card);
          alignHireArea();
          io.emit('state_update', gameState);
          return;
        }
        
        if (gameState.playAreaCards) {
          cardIndex = gameState.playAreaCards.findIndex((c: any) => c.id === cardId);
          if (cardIndex !== -1) {
            const card = gameState.playAreaCards.splice(cardIndex, 1)[0];
            gameState.discardPiles.action.push(card);
            io.emit('state_update', gameState);
            return;
          }
        }
        return;
      }

      const cardIndex = player.hand.findIndex((c: any) => c.id === cardId);
      if (cardIndex !== -1 && gameState.phase === 'discard' && !player.discardFinished) {
        const card = player.hand.splice(cardIndex, 1)[0];
        gameState.discardPiles.action.push(card);
        // Save state for undo
        if (!player.discardHistory) player.discardHistory = [];
        player.discardHistory.push(card);
        io.emit('state_update', gameState);
      }
    },
    checkAndResetChanting: (tokenId: string) => {
      const magicCircle = gameState.magicCircles.find((mc: any) => mc.state === 'chanting' && mc.chantingTokenId === tokenId);
      if (magicCircle) {
        const token = gameState.tokens.find((t: any) => t.id === tokenId);
        const card = token ? gameState.tableCards.find((c: any) => c.id === token.boundToCardId) : null;
        const ownerIndex = card ? (card.y > 0 ? 0 : 1) : -1;

        magicCircle.state = 'idle';
        magicCircle.chantingTokenId = undefined;
        if (ownerIndex !== -1) {
          addLog(`玩家${ownerIndex + 1}的英雄中断了咏唱 (Player ${ownerIndex + 1}'s hero interrupted chanting)`, ownerIndex);
        }
      }
    },
    revive_hero: (socket: any, { heroCardId, targetCastleIndex }: { heroCardId: string, targetCastleIndex: number }) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const playerIndex = isPlayer1 ? 0 : 1;
      
      const result = HeroEngine.reviveHero(gameState, playerIndex, heroCardId, targetCastleIndex, {
        addLog,
        checkBotTurn
      });

      if (!result.success) {
        socket.emit('error_message', result.reason);
        return;
      }

      broadcastState();
      checkBotTurn();
    },
    move_token_to_cell: (socket: any, { q, r }: { q: number, r: number }) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      ActionEngine.moveTokenToCell(gameState, playerIndex, q, r, actionHelpers, socket);
    },
    select_hire_cost: (socket: any, cost: number) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (playerIndex === gameState.activePlayerIndex) {
        gameState.selectedHireCost = cost;
        broadcastState();
      }
    },
    select_token: (socket: any, tokenId: string) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_select_option' && playerIndex === gameState.activePlayerIndex) {
        const isAction = ['move', 'sprint', 'attack', 'chant', 'fire'].includes(gameState.selectedOption || '');
        
        const token = gameState.tokens.find((t: any) => t.id === tokenId);
        if (token && token.boundToCardId) {
          const isAlive = !gameState.counters.some((counter: any) => counter.type === 'time' && counter.boundToCardId === token.boundToCardId);
          if (!isAlive) {
            socket.emit('error_message', '该英雄正在复活中，无法行动。');
            return;
          }
          const card = gameState.tableCards.find((c: any) => c.id === token.boundToCardId);
          if (card && ((isPlayer1 && card.y > 0) || (isPlayer2 && card.y < 0))) {
            
            if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
              if (!gameState.globalMovementMovedTokens) gameState.globalMovementMovedTokens = [];
              
              if (gameState.globalMovementMovedTokens.includes(tokenId)) {
                socket.emit('error_message', '该英雄本回合已经移动过。');
                return;
              }
              
              gameState.selectedTokenId = tokenId;
              const hex = pixelToHex(token.x, token.y);
              gameState.reachableCells = getReachableHexes(hex, gameState.remainingMv, gameState);
              broadcastState();
            } else if (gameState.selectedOption === 'attack') {
              gameState.selectedTokenId = tokenId;
              const hex = pixelToHex(token.x, token.y);
              gameState.reachableCells = getAttackableHexes(hex, card.heroClass, gameState);
              broadcastState();
            } else if (gameState.selectedOption === 'chant') {
              gameState.selectedTokenId = tokenId;
              const hex = pixelToHex(token.x, token.y);
              gameState.reachableCells = getNeighbors(hex).filter((h: any) => gameState.magicCircles.some((mc: any) => mc.q === h.q && mc.r === h.r && mc.state === 'idle'));
              broadcastState();
            } else if (gameState.selectedOption === 'fire') {
              gameState.selectedTokenId = tokenId;
              const hex = pixelToHex(token.x, token.y);
              // Simple range check for fire
              gameState.reachableCells = getNeighbors(hex); // Placeholder
              broadcastState();
            }
          }
        }
      }
    },
    select_option: (socket: any, option: string) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if ((gameState.phase === 'action_select_option' || gameState.phase === 'shop') && playerIndex === gameState.activePlayerIndex) {
        if (option === 'heal' && (!gameState.healableHeroIds || gameState.healableHeroIds.length === 0)) {
          socket.emit('error_message', '没有可以回复的英雄。 (No heroes available to heal.)');
          return;
        }
        if (option === 'evolve' && (!gameState.evolvableHeroIds || gameState.evolvableHeroIds.length === 0)) {
          socket.emit('error_message', '没有可以进化的英雄。 (No heroes available to evolve.)');
          return;
        }
        if (option === 'hire') {
          const playerCastles = gameState.map?.castles?.[playerIndex as 0 | 1] || [];
          const anyCastleFree = playerCastles.some((cCoord: any) => {
            const pos = hexToPixel(cCoord.q, cCoord.r);
            return !gameState.tokens.some((t: any) => Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
          });
          
          if (!anyCastleFree) {
            socket.emit('error_message', '所有王城均被占用，无法雇佣。 (All castles are occupied, cannot hire.)');
            return;
          }
          const goldCounter = gameState.counters.find((c: any) => c.type === 'gold' && (isPlayer1 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
          if (!goldCounter || goldCounter.value < 2) {
            socket.emit('error_message', '金币不足，无法雇佣。 (Not enough gold to hire.)');
            return;
          }
        }

        if (option === 'fire') {
          const lastCard = gameState.playAreaCards[gameState.playAreaCards.length - 1] || 
                           gameState.tableCards.find((c: any) => c.id === gameState.lastPlayedCardId);
          if (!lastCard || lastCard.type !== 'action') {
            socket.emit('error_message', '只有打出行动卡才能开火。 (Only action cards can trigger fire.)');
            return;
          }
        }

        const optionNames: any = {
          'move': '移动',
          'sprint': '冲刺',
          'attack': '攻击',
          'heal': '回复',
          'evolve': '进化',
          'hire': '雇佣',
          'spy': '间谍',
          'seize': '抢先手',
          'chant': '咏唱',
          'fire': '开火',
          'turret_attack': '炮台攻击'
        };
        if (optionNames[option]) {
          addLog(`玩家${playerIndex + 1}选择了${optionNames[option]}`, playerIndex);
        }

        // Manage action counts if changing option while a token is selected
        if (gameState.selectedTokenId) {
          const isPrevAction = ['move', 'sprint', 'attack', 'turret_attack'].includes(gameState.selectedOption || '');
          if (isPrevAction) {
            const prevTokenId = gameState.selectedTokenId;
            if (gameState.roundActionCounts[prevTokenId] > 0) {
              gameState.roundActionCounts[prevTokenId]--;
            }
          }
        }

        gameState.selectedOption = option;
        gameState.selectedTokenId = null;
        gameState.remainingMv = 0;
        gameState.reachableCells = [];
        gameState.movementHistory = undefined;
        broadcastState();
      }
    },
    select_action_category: (socket: any, category: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectActionCategory(gameState, playerIndex, category, actionHelpers, socket);
    },
    select_common_action: (socket: any, action: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectCommonAction(gameState, playerIndex, action, actionHelpers, socket);
    },
    select_hero_action: (socket: any, action: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectHeroAction(gameState, playerIndex, action, actionHelpers, socket);
    },
    select_hero_for_action: (socket: any, tokenId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectHeroForAction(gameState, playerIndex, tokenId, actionHelpers, socket);
    },
    click_action_token: (socket: any, tokenId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.clickActionToken(gameState, playerIndex, tokenId, actionHelpers, socket);
    }, 
    cancel_action_token: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.cancelActionToken(gameState, playerIndex, actionHelpers, socket);
    },
    draw_card_to_table: (socket: any, deckType: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero' | 'discard_action', x: number, y: number) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1) return;
      
      const isEarlyBuy = gameState.phase === 'action_select_option' && gameState.selectedOption === 'buy';
      if (deckType.startsWith('treasure') && !((gameState.phase === 'shop' || isEarlyBuy) && playerIndex === gameState.activePlayerIndex)) {
        socket.emit('error_message', '现在不是你的商店阶段，无法购买装备。');
        return;
      }

      let deck;
      if (deckType === 'discard_action') {
        deck = gameState.discardPiles.action;
      } else {
        deck = gameState.decks[deckType];
      }

      if (deck && deck.length > 0) {
        const card = deck.pop()!;
        gameState.tableCards.push({
          ...card,
          x,
          y,
          faceUp: true
        });
        
        if (isEarlyBuy && deckType.startsWith('treasure')) {
          if (gameState.activeActionTokenId) {
            const token = gameState.actionTokens.find((t: any) => t.id === gameState.activeActionTokenId);
            if (token) token.used = true;
            gameState.activeActionTokenId = null;
          }
          gameState.phase = 'action_play';
          gameState.selectedOption = null;
          gameState.activePlayerIndex = 1 - playerIndex;
          checkAllTokensUsed();
        } else {
          io.emit('state_update', gameState);
        }
      } else if (deckType === 'action' && gameState.discardPiles.action.length > 0) {
        gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
        gameState.discardPiles.action = [];
        const card = gameState.decks.action.pop()!;
        gameState.tableCards.push({
          ...card,
          x,
          y,
          faceUp: true
        });
        io.emit('state_update', gameState);
      }
    },
    select_target: (socket: any, targetId: string) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      console.log(`[DEBUG] Received select_target: ${targetId}`);
     
      if ((gameState.phase === 'action_select_option' || gameState.phase === 'action_resolve') && playerIndex === gameState.activePlayerIndex) {
        gameState.selectedTargetId = targetId;
        io.emit('state_update', gameState);
      }
      ActionEngine.resolveTargetSelection(gameState, playerIndex, targetId, actionHelpers, socket);
    },

    proceed_phase: (socket: any) => {
      ActionEngine.proceedPhase(gameState, actionHelpers, socket);
    },

    play_enhancement_card: (socket: any, cardId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_play_enhancement') return;

      const player = gameState.players[socket.id];
      const cardIndex = player.hand.findIndex((c: any) => c.id === cardId);
      if (cardIndex === -1) return;

      const card = player.hand[cardIndex];
      
      if (!isEnhancementCardName(card.name || '')) {
        socket.emit('error_message', '只能打出增强卡');
        return;
      }

      player.hand.splice(cardIndex, 1);
      gameState.discardPiles.action.push(card);
      gameState.activeEnhancementCardId = card.id;

      const { logs, nextPhase } = CardLogic.applyActionCard(
        card as any,
        gameState,
        playerIndex,
        {
          addLog,
          discardOpponentCard
        }
      );

      logs.forEach((log: string) => addLog(log, playerIndex));

      if (nextPhase) {
        gameState.phase = nextPhase as any;
      }

      broadcastState();
      checkBotTurn();
    },

    pass_enhancement: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_play_enhancement') return;

      // @ts-ignore
      handlers.resolve_action_start(socket);
    },

    resolve_action_start: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      const heroToken = gameState.tokens.find((t: any) => t.id === gameState.activeHeroTokenId);
      if (!heroToken) {
        // @ts-ignore
        handlers.finish_action(socket);
        return;
      }
      
      const heroCard = gameState.tableCards.find((c: any) => c.id === heroToken.boundToCardId);
      const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard?.heroClass);
      const levelData = heroData?.levels?.[heroCard?.level || 1];

      const enhancementCard = gameState.activeEnhancementCardId 
        ? (gameState.playAreaCards.find((c: any) => c.id === gameState.activeEnhancementCardId) || 
           gameState.discardPiles.action.find((c: any) => c.id === gameState.activeEnhancementCardId))
        : null;

      if (gameState.activeActionType === 'move') {
        let mv = levelData?.mv || 1;
        mv += getMoveBonusFromEnhancement(enhancementCard?.name);
        
        const hex = pixelToHex(heroToken.x, heroToken.y);
        gameState.reachableCells = getReachableHexes(hex, mv, playerIndex, gameState);
        gameState.selectedTokenId = heroToken.id;
        gameState.remainingMv = mv;
        gameState.phase = 'action_resolve';
        gameState.notification = null;
      } else if (gameState.activeActionType === 'attack') {
        let ar = levelData?.ar || 1;
        ar += getAttackRangeBonusFromEnhancement(enhancementCard?.name);
        
        const hex = pixelToHex(heroToken.x, heroToken.y);
        gameState.reachableCells = getAttackableHexes(hex.q, hex.r, ar, playerIndex, gameState, heroCard?.level || 1);
        gameState.selectedTokenId = heroToken.id;
        gameState.phase = 'action_resolve';
        gameState.notification = null;
      } else if (gameState.activeActionType === 'skill') {
        gameState.selectedTokenId = heroToken.id;
        gameState.phase = 'action_resolve';
        gameState.notification = null;
      } else if (gameState.activeActionType === 'evolve') {
        if (heroCard && heroCard.level < 3) {
          const expCounter = gameState.counters.find((c: any) => c.type === 'exp' && c.boundToCardId === heroCard.id);
          const expNeeded = levelData?.xp;
          if (expCounter && typeof expNeeded === 'number' && expCounter.value >= expNeeded) {
            expCounter.value -= expNeeded;
            heroCard.level += 1;
            heroToken.lv = heroCard.level;
            heroToken.label = `${heroCard.heroClass} Lv${heroCard.level}`;
            addLog(`玩家${playerIndex + 1}的英雄 ${heroCard.heroClass} 进化到了 Lv${heroCard.level}`, playerIndex);
          } else {
            socket.emit('error_message', '经验不足，无法进化');
          }
        }
        // @ts-ignore
        handlers.finish_action(socket);
        return;
      }
      broadcastState();
    },

    finish_action: (socket: any) => {
      const token = gameState.actionTokens.find((t: any) => t.id === gameState.activeActionTokenId);
      if (token) token.used = true;

      gameState.activeActionTokenId = null;
      gameState.activeActionType = null;
      gameState.activeEnhancementCardId = null;
      gameState.phase = 'action_play';
      gameState.selectedOption = null;
      gameState.selectedTargetId = null;
      gameState.selectedTokenId = null;
      gameState.reachableCells = [];
      gameState.remainingMv = 0;
      gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
      broadcastState();
      checkBotTurn();
    },
    pass_action: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_play' && playerIndex === gameState.activePlayerIndex) {
        const availableTokens = gameState.actionTokens.filter((t: any) => t.playerIndex === playerIndex && !t.used);
        if (availableTokens.length > 0) {
          socket.emit('error_message', '请选择一个行动Token进行Pass (翻面)');
          return;
        }

        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        checkAllTokensUsed();
      }
    },
    pass_defend: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        addLog(`玩家${playerIndex + 1}放弃防御 (Pass Defend)`, playerIndex);
        gameState.phase = 'action_resolve_attack';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
    declare_defend: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        const defenseCard = gameState.playAreaCards.find((c: any) => c.name === '防御' || c.name === '闪避');
        const targetCard = gameState.tableCards.find((c: any) => c.id === gameState.selectedTargetId);
        if (targetCard && defenseCard) {
          addLog(`响应阶段: ${targetCard.heroClass} 打出了 ${defenseCard.name} 卡`, playerIndex);
        } else {
          addLog(`玩家${playerIndex + 1}选择防御 (Declare Defend)`, playerIndex);
        }
        const hasDefenseCard = !!defenseCard;
        if (hasDefenseCard) {
          gameState.phase = 'action_resolve_attack';
          gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        } else {
          gameState.phase = 'action_play_defense';
          gameState.notification = '请打出一张防御卡。 (Please play a defense card.)';
        }
        broadcastState();
        checkBotTurn();
      }
    },
    declare_counter: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        const defenseCard = gameState.playAreaCards.find((c: any) => c.name === '防御');
        if (!defenseCard) {
          socket.emit('error_message', '请先打出一张【防御】卡才能反击。 (Please play a [Defense] card to counter.)');
          return;
        }

        const targetCard = gameState.tableCards.find((c: any) => c.id === gameState.selectedTargetId);
        addLog(`响应阶段: ${targetCard?.heroClass || '英雄'} 选择反击 (Declare Counter)`, playerIndex);

        const attackerToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
        const defenderCard = gameState.tableCards.find((c: any) => c.id === gameState.selectedTargetId);
        const defenderToken = gameState.tokens.find((t: any) => t.boundToCardId === gameState.selectedTargetId);
        
        if (attackerToken && defenderToken && defenderCard) {
          const attackerHex = pixelToHex(attackerToken.x, attackerToken.y);
          const defenderHex = pixelToHex(defenderToken.x, defenderToken.y);
          
          const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === defenderCard.heroClass);
          const levelData = heroData?.levels?.[defenderCard.level || 1];
          const ar = levelData?.ar || 1;
          
          if (!isTargetInAttackRange(defenderHex, attackerHex, ar, gameState)) {
            socket.emit('error_message', '攻击者不在反击范围内。 (Attacker is out of counter-attack range.)');
            return;
          }
        }

        gameState.phase = 'action_resolve_attack_counter';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
  };
};
