
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
    discardOpponentCard,
    generateId,
    getHeroTokenImage,
    getHeroCardImage,
    getHeroBackImage,
    createInitialState
  } = deps;

  const handlers: any = {
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
    undo_play: (socket: any) => {
      const player = gameState.players[socket.id];
      if (!player) return;
      
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if ((gameState.phase === 'action_select_option' || gameState.phase === 'action_defend' || gameState.phase === 'action_resolve') && playerIndex === gameState.activePlayerIndex) {
        if (gameState.selectedTargetId) {
          gameState.selectedTargetId = null;
          broadcastState();
        } else if (gameState.movementHistory && gameState.movementHistory.length > 0 && (!gameState.selectedTokenId || gameState.movementHistory[gameState.movementHistory.length - 1].tokenId === gameState.selectedTokenId)) {
          const lastStep = gameState.movementHistory.pop()!;
          const token = gameState.tokens.find((t: any) => t.id === lastStep.tokenId);
          
          if (token) {
            if (!gameState.selectedTokenId) {
              gameState.selectedTokenId = token.id;
              if (gameState.globalMovementMovedTokens) {
                gameState.globalMovementMovedTokens = gameState.globalMovementMovedTokens.filter((id: any) => id !== token.id);
              }
              
              const card = gameState.tableCards.find((c: any) => c.id === token.boundToCardId);
              if (card) {
                const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
                const levelData = heroData?.levels?.[card.level || 1];
                let mv = levelData?.mv || 1;
                if (gameState.selectedOption === 'sprint') mv += 1;
                
                const totalMvCost = gameState.movementHistory.filter((step: any) => step.tokenId === token.id).reduce((sum: any, step: any) => sum + step.mvCost, 0);
                gameState.remainingMv = mv - totalMvCost;
              }
            } else {
              gameState.remainingMv! += lastStep.mvCost;
            }
            
            token.x = lastStep.fromX;
            token.y = lastStep.fromY;
            
            const hasOtherMoves = gameState.movementHistory?.some((step: any) => step.tokenId === token.id && step.mvCost > 0);
            if (!hasOtherMoves && lastStep.mvCost > 0) {
              if (gameState.roundActionCounts[token.id]) {
                gameState.roundActionCounts[token.id]--;
              }
            }
            
            if (lastStep.wasChanting) {
              const hex = pixelToHex(token.x, token.y);
              const magicCircle = gameState.magicCircles?.find((mc: any) => mc.q === hex.q && mc.r === hex.r);
              if (magicCircle) {
                magicCircle.state = 'chanting';
                magicCircle.chantingTokenId = token.id;
              }
            }
            
            const hex = pixelToHex(token.x, token.y);
            gameState.reachableCells = getReachableHexes(hex, gameState.remainingMv!, gameState);
          }
          broadcastState();
        } else if (gameState.selectedTokenId) {
          const deselectedTokenId = gameState.selectedTokenId;
          gameState.selectedTokenId = null;
          gameState.remainingMv = 0;
          gameState.reachableCells = [];
          
          if (gameState.movementHistory && gameState.movementHistory.length > 0) {
             const prevTokenId = gameState.movementHistory[gameState.movementHistory.length - 1].tokenId;
             if (gameState.globalMovementMovedTokens) {
               gameState.globalMovementMovedTokens = gameState.globalMovementMovedTokens.filter((id: any) => id !== deselectedTokenId);
             }
             if (gameState.globalMovementMovedTokens) {
               gameState.globalMovementMovedTokens = gameState.globalMovementMovedTokens.filter((id: any) => id !== prevTokenId);
             }
          }
          
          broadcastState();
        } else if (gameState.selectedOption) {
          gameState.selectedOption = null;
          gameState.selectedTokenId = null;
          gameState.remainingMv = 0;
          gameState.reachableCells = [];
          gameState.globalMovementMovedTokens = [];
          gameState.movementHistory = undefined;
          broadcastState();
        } else if (gameState.lastPlayedCardId) {
          let cardIndex = gameState.playAreaCards.findIndex((c: any) => c.id === gameState.lastPlayedCardId);
          let card;
          
          if (cardIndex !== -1) {
            card = gameState.playAreaCards.splice(cardIndex, 1)[0];
          } else {
            cardIndex = gameState.tableCards.findIndex((c: any) => c.id === gameState.lastPlayedCardId);
            if (cardIndex !== -1) {
              card = gameState.tableCards.splice(cardIndex, 1)[0];
            }
          }

          if (card) {
            if (gameState.movedTokens) {
              Object.entries(gameState.movedTokens).forEach(([tokenId, pos]: [string, any]) => {
                const token = gameState.tokens.find((t: any) => t.id === tokenId);
                if (token) {
                  token.x = pos.x;
                  token.y = pos.y;
                }
              });
              gameState.movedTokens = undefined;
            }

            if (card.type === 'hero') {
              gameState.tokens = gameState.tokens.filter((t: any) => t.boundToCardId !== card.id);
              gameState.counters = gameState.counters.filter((c: any) => c.boundToCardId !== card.id);
              gameState.heroPlayed[socket.id] = false;
            }

            player.hand.push({
              id: card.id,
              frontImage: card.frontImage,
              backImage: card.backImage,
              type: card.type,
              name: card.name,
              heroClass: card.heroClass,
              level: card.level
            });
            if (gameState.phase !== 'action_defend') {
              gameState.phase = 'action_play';
            }
            gameState.lastPlayedCardId = null;
            gameState.selectedOption = null;
            gameState.selectedTokenId = null;
            gameState.remainingMv = 0;
            gameState.reachableCells = [];
            broadcastState();
          }
        }
      }
    },
    undo_discard: (socket: any) => {
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'discard' || player.discardFinished || !player.discardHistory || player.discardHistory.length === 0) return;

      const card = player.discardHistory.pop();
      if (card) {
        player.hand.push(card);
        const discardIndex = gameState.discardPiles.action.findIndex((c: any) => c.id === card.id);
        if (discardIndex !== -1) gameState.discardPiles.action.splice(discardIndex, 1);
        io.emit('state_update', gameState);
      }
    },
    steal_first_player: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (playerIndex !== -1 && playerIndex !== gameState.firstPlayerIndex) {
        gameState.firstPlayerIndex = playerIndex;
        io.emit('state_update', gameState);
      }
    },
    clear_notification: (socket: any) => {
      gameState.notification = null;
      broadcastState();
    },
    cancel_defend_or_counter: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if ((gameState.phase === 'action_play_defense' || gameState.phase === 'action_play_counter') && playerIndex === gameState.activePlayerIndex) {
        gameState.phase = 'action_defend';
        gameState.notification = null;
        broadcastState();
        checkBotTurn();
      }
    },
    next_shop: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'shop' && playerIndex === gameState.activePlayerIndex) {
        gameState.consecutivePasses = 0;
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
    pass_shop: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'shop' && playerIndex === gameState.activePlayerIndex) {
        gameState.consecutivePasses = (gameState.consecutivePasses || 0) + 1;
        if (gameState.consecutivePasses >= 2) {
          // @ts-ignore
          handlers.proceed_phase(socket);
        } else {
          gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
          broadcastState();
          checkBotTurn();
        }
      }
    },
    evolve_hero: (socket: any, cardId: string) => {
      const card = gameState.tableCards.find((c: any) => c.id === cardId);
      if (card && card.type === 'hero' && card.heroClass && card.level && card.level < 3) {
        const expCounter = gameState.counters.find((c: any) => c.type === 'exp' && c.boundToCardId === card.id);
        const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
        const levelData = heroData?.levels?.[card.level.toString()];
        const expNeeded = levelData?.xp;

        if (expCounter && typeof expNeeded === 'number' && expNeeded > 0 && expCounter.value >= expNeeded) {
          expCounter.value -= expNeeded;
          card.level += 1;
          card.frontImage = getHeroCardImage(card.heroClass, card.level);
          card.backImage = getHeroBackImage(card.level);
          
          const token = gameState.tokens.find((t: any) => t.boundToCardId === card.id);
          if (token) {
            token.lv = card.level;
            token.label = `${card.heroClass} Lv${card.level}`;
          }
          
          addLog(`玩家${gameState.activePlayerIndex + 1}进化了${card.heroClass}到Lv${card.level}`, gameState.activePlayerIndex);
          gameState.lastEvolvedId = card.id;
          broadcastState();
          
          setTimeout(() => {
            if (gameState.lastEvolvedId === card.id) {
              gameState.lastEvolvedId = null;
              broadcastState();
            }
          }, 2000);
        }
      }
    },
    flip_card: (socket: any, cardId: string) => {
      let card = gameState.tableCards.find((c: any) => c.id === cardId);
      if (!card) card = gameState.hireAreaCards.find((c: any) => c.id === cardId);
      if (!card && gameState.playAreaCards) card = gameState.playAreaCards.find((c: any) => c.id === cardId);
      
      if (card) {
        card.faceUp = !card.faceUp;
        io.emit('card_flipped', { id: cardId, faceUp: card.faceUp });
      }
    },
    add_counter: (socket: any, { type, x, y, value }: any) => {
      const counter: any = { id: generateId(), type, x, y, value: value ?? 0 };
      gameState.counters.push(counter);
      io.emit('state_update', gameState);
    },
    update_counter: (socket: any, { id, delta }: any) => {
      const counterIndex = gameState.counters.findIndex((c: any) => c.id === id);
      if (counterIndex !== -1) {
        const counter = gameState.counters[counterIndex];
        counter.value += delta;
        
        if (counter.type === 'damage' && counter.boundToCardId) {
          const card = gameState.tableCards.find((c: any) => c.id === counter.boundToCardId);
          if (card) {
            card.damage = counter.value;
          }
        }

        if (counter.type === 'time' && counter.value >= 4) {
          gameState.counters.splice(counterIndex, 1);
          io.emit('state_update', gameState);
        } else {
          io.emit('counter_updated', { id, value: counter.value });
        }
      }
    },
    update_token_value: (socket: any, { id, field, delta }: any) => {
      const token = gameState.tokens.find((t: any) => t.id === id);
      if (token && (field === 'lv' || field === 'time')) {
        token[field] += delta;
        io.emit('state_update', gameState);
      }
    },
    spawn_hero: (socket: any, { heroClass, level, x, y }: any) => {
      if (level === 1) {
        const token: any = {
          id: generateId(),
          x, y,
          image: getHeroTokenImage(heroClass),
          label: `${heroClass} Lv1`,
          lv: 1,
          time: 0
        };
        gameState.tokens.push(token);
      } else {
        const card: any = {
          id: generateId(),
          x, y,
          frontImage: getHeroCardImage(heroClass, level),
          backImage: getHeroBackImage(level),
          type: 'hero',
          faceUp: true
        };
        gameState.tableCards.push(card);
      }
      io.emit('state_update', gameState);
    },
    reset_game: (socket: any) => {
      const currentPlayers = { ...gameState.players };
      const currentSeats = [...gameState.seats];
      
      const newState = createInitialState(gameState.map);
      Object.assign(gameState, newState);
      gameState.players = currentPlayers;
      gameState.seats = currentSeats;
      Object.keys(currentPlayers).forEach(id => {
        gameState.heroPlayed[id] = false;
        gameState.heroPlayedCount[id] = 0;
        if (gameState.players[id]) {
          gameState.players[id].discardFinished = false;
          gameState.players[id].hand = [];
        }
      });
      io.emit('init', gameState);
    },
    add_bot: (socket: any, { seatIndex, difficulty }: { seatIndex: number, difficulty: number }) => {
      if (!gameState.gameStarted && gameState.seats[seatIndex] === null) {
        const botId = `bot_${generateId()}`;
        gameState.seats[seatIndex] = botId;
        gameState.players[botId] = {
          id: botId,
          name: `AI (Lv${difficulty})`,
          hand: [],
          isBot: true,
          botDifficulty: difficulty
        };
        gameState.heroPlayed[botId] = false;
        gameState.heroPlayedCount[botId] = 0;
        io.emit('state_update', gameState);
      }
    },
    remove_bot: (socket: any, { seatIndex }: { seatIndex: number }) => {
      if (!gameState.gameStarted) {
        const occupantId = gameState.seats[seatIndex];
        if (occupantId && occupantId.startsWith('bot_')) {
          gameState.seats[seatIndex] = null;
          if (gameState.players[occupantId]) {
            delete gameState.players[occupantId];
          }
          io.emit('state_update', gameState);
        }
      }
    },
    sit_down: (socket: any, { seatIndex, playerName }: { seatIndex: number, playerName: string }) => {
      if (!gameState.gameStarted && gameState.seats[seatIndex] === null) {
        const existingIndex = gameState.seats.indexOf(socket.id);
        if (existingIndex !== -1) {
          gameState.seats[existingIndex] = null;
        }
        gameState.seats[seatIndex] = socket.id;
        
        if (gameState.players[socket.id]) {
          gameState.players[socket.id].name = playerName;
        } else {
          gameState.players[socket.id] = {
            id: socket.id,
            name: playerName,
            hand: [],
            discardFinished: false,
            isBot: false
          };
        }
        
        io.emit('state_update', gameState);
      } else if (gameState.gameStarted && gameState.seats[seatIndex] === null) {
        // Reconnect logic
        const oldPlayerId = Object.keys(gameState.players).find(id => gameState.players[id].name === playerName);
        if (oldPlayerId) {
          // Transfer data to new socket id
          gameState.players[socket.id] = { ...gameState.players[oldPlayerId], id: socket.id };
          if (gameState.heroPlayed[oldPlayerId] !== undefined) {
             gameState.heroPlayed[socket.id] = gameState.heroPlayed[oldPlayerId];
          }
          if (gameState.heroPlayedCount[oldPlayerId] !== undefined) {
             gameState.heroPlayedCount[socket.id] = gameState.heroPlayedCount[oldPlayerId];
          }
          gameState.seats[seatIndex] = socket.id;
          io.emit('state_update', gameState);
        }
      }
    },
    start_game: (socket: any) => {
      if (gameState.gameStarted) return;
      
      const occupiedSeats = gameState.seats.filter(id => id !== null) as string[];
      if (occupiedSeats.length === 0) return;

      gameState.gameStarted = true;
      
      // AI Substitute for Player 2 if only one player is present and no bot added
      const botCount = Object.values(gameState.players).filter((p: any) => p.isBot).length;
      if (occupiedSeats.length === 1 && botCount === 0) {
        const emptySeatIndex = gameState.seats.indexOf(null);
        if (emptySeatIndex !== -1 && emptySeatIndex < 2) {
          const botId = `bot_player_${emptySeatIndex + 1}`;
          gameState.seats[emptySeatIndex] = botId;
          gameState.players[botId] = {
            id: botId,
            name: 'Computer (AI)',
            hand: [],
            isBot: true,
            botDifficulty: 0
          };
          gameState.heroPlayed[botId] = false;
          gameState.heroPlayedCount[botId] = 0;
        }
      }

      const activeSeats = gameState.seats.filter(id => id !== null) as string[];
      activeSeats.forEach(id => {
        for (let i = 0; i < 4; i++) {
          if (gameState.decks.hero.length > 0) {
            gameState.players[id].hand.push(gameState.decks.hero.pop()!);
          }
        }
      });
      
      broadcastState();
      checkBotTurn();
    },
    update_image_config: (socket: any) => {
      const newState = createInitialState();
      Object.assign(gameState, newState);
      io.emit('init', gameState);
    },
    update_map: (socket: any, mapConfig: any) => {
      if (!gameState.gameStarted) {
        const currentPlayers = { ...gameState.players };
        const currentSeats = [...gameState.seats];
        const newState = createInitialState(mapConfig);
        Object.assign(gameState, newState);
        gameState.players = currentPlayers;
        gameState.seats = currentSeats;
        Object.keys(currentPlayers).forEach(id => {
          gameState.heroPlayed[id] = false;
          gameState.heroPlayedCount[id] = 0;
          if (gameState.players[id]) {
            gameState.players[id].discardFinished = false;
            gameState.players[id].hand = [];
          }
        });
        io.emit('init', gameState);
      }
    },
    draw_card: (socket: any) => {
      // This is a simple draw card to hand
      const player = gameState.players[socket.id];
      if (!player) return;
      
      if (gameState.decks.action.length > 0) {
        player.hand.push(gameState.decks.action.pop()!);
        io.emit('state_update', gameState);
      } else if (gameState.discardPiles.action.length > 0) {
        gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
        gameState.discardPiles.action = [];
        if (gameState.decks.action.length > 0) {
          player.hand.push(gameState.decks.action.pop()!);
          io.emit('state_update', gameState);
        }
      }
    },
    shuffle_deck: (socket: any, deckType: string) => {
      let deck;
      if (deckType === 'discard_action') {
        deck = gameState.discardPiles.action;
      } else {
        deck = (gameState.decks as any)[deckType];
      }
      if (deck) {
        deck.sort(() => Math.random() - 0.5);
        io.emit('state_update', gameState);
      }
    },
    take_card_to_hand: (socket: any, cardId: string) => {
      const player = gameState.players[socket.id];
      if (!player) return;

      let cardIndex = gameState.tableCards.findIndex((c: any) => c.id === cardId);
      if (cardIndex !== -1) {
        const card = gameState.tableCards.splice(cardIndex, 1)[0];
        player.hand.push(card);
        io.emit('state_update', gameState);
        return;
      }
      cardIndex = gameState.hireAreaCards.findIndex((c: any) => c.id === cardId);
      if (cardIndex !== -1) {
        const card = gameState.hireAreaCards.splice(cardIndex, 1)[0];
        player.hand.push(card);
        alignHireArea();
        io.emit('state_update', gameState);
        return;
      }
      if (gameState.playAreaCards) {
        cardIndex = gameState.playAreaCards.findIndex((c: any) => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.playAreaCards.splice(cardIndex, 1)[0];
          player.hand.push(card);
          io.emit('state_update', gameState);
          return;
        }
      }
    },
    move_item: (socket: any, { type, id, x, y }: any) => {
      let item;
      if (type === 'token') item = gameState.tokens.find((t: any) => t.id === id);
      if (type === 'card') {
        item = gameState.tableCards.find((c: any) => c.id === id);
        if (!item) item = gameState.hireAreaCards.find((c: any) => c.id === id);
        if (!item && gameState.playAreaCards) item = gameState.playAreaCards.find((c: any) => c.id === id);
      }
      if (type === 'counter') item = gameState.counters.find((c: any) => c.id === id);

      if (item) {
        if (x > 800 && y > 400) {
          if (type === 'token') gameState.tokens = gameState.tokens.filter((t: any) => t.id !== id);
          if (type === 'card') {
            gameState.tableCards = gameState.tableCards.filter((c: any) => c.id !== id);
            gameState.hireAreaCards = gameState.hireAreaCards.filter((c: any) => c.id !== id);
            if (gameState.playAreaCards) gameState.playAreaCards = gameState.playAreaCards.filter((c: any) => c.id !== id);
          }
          if (type === 'counter') gameState.counters = gameState.counters.filter((c: any) => c.id !== id);
          io.emit('state_update', gameState);
          return;
        }

        if (type === 'card' && x > 100 && y < -350) {
          const cardIndex = gameState.tableCards.findIndex((c: any) => c.id === id);
          if (cardIndex !== -1) {
            const card = gameState.tableCards.splice(cardIndex, 1)[0];
            gameState.hireAreaCards.push(card);
            alignHireArea();
            io.emit('state_update', gameState);
            return;
          }
        }

        if (type === 'card' && gameState.phase === 'discard') {
          socket.emit('error_message', '弃牌阶段无法移动卡牌。');
          return;
        }

        const dx = x - item.x;
        const dy = y - item.y;
        item.x = x;
        item.y = y;
        socket.broadcast.emit('item_moved', { type, id, x, y });

        if (type === 'card') {
          gameState.counters.filter((c: any) => c.boundToCardId === id).forEach((c: any) => {
            c.x += dx;
            c.y += dy;
            io.emit('item_moved', { type: 'counter', id: c.id, x: c.x, y: c.y });
          });
          gameState.tokens.filter((t: any) => t.boundToCardId === id).forEach((t: any) => {
            t.x += dx;
            t.y += dy;
            io.emit('item_moved', { type: 'token', id: t.id, x: t.x, y: t.y });
          });
        }
      }
    },
    disconnect: (socket: any) => {
      console.log('User disconnected:', socket.id);
      const existingIndex = gameState.seats.indexOf(socket.id);
      if (existingIndex !== -1) {
        gameState.seats[existingIndex] = null;
      }
      // Do not delete player data to allow reconnection by name
      io.emit('state_update', gameState);
    },
    leave_seat: (socket: any) => {
      if (!gameState.gameStarted) {
        const existingIndex = gameState.seats.indexOf(socket.id);
        if (existingIndex !== -1) {
          gameState.seats[existingIndex] = null;
          io.emit('state_update', gameState);
        }
      }
    },
    join_seat: (socket: any, { seatIndex, name, isBot }: any) => {
      const existingIndex = gameState.seats.indexOf(socket.id);
      if (existingIndex !== -1) {
        gameState.seats[existingIndex] = null;
      }

      gameState.seats[seatIndex] = socket.id;
      gameState.players[socket.id] = {
        id: socket.id,
        name: name || `玩家 ${seatIndex + 1}`,
        hand: [],
        discardFinished: false,
        isBot: isBot || false
      };
      
      gameState.heroPlayed[socket.id] = false;
      gameState.heroPlayedCount[socket.id] = 0;

      io.emit('state_update', gameState);
      
      const allSeatsFilled = gameState.seats.every(s => s !== null);
      if (allSeatsFilled && !gameState.gameStarted) {
        gameState.gameStarted = true;
        gameState.round = 1;
        gameState.phase = 'action_play';
        gameState.activePlayerIndex = gameState.firstPlayerIndex;
        
        gameState.seats.forEach(sid => {
          if (sid) {
            createActionTokensForPlayer(sid);
            drawCards(sid, 5);
          }
        });
        
        addLog('游戏开始！', -1);
        io.emit('init', gameState);
        checkBotTurn();
      }
    },
    finish_resolve: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_resolve' && playerIndex === gameState.activePlayerIndex) {
        if (gameState.selectedOption === 'seize') {
          gameState.firstPlayerIndex = playerIndex;
          gameState.hasSeizedInitiative = true;
          addLog(`玩家${playerIndex + 1}抢占了先手`, playerIndex);
        } else if (gameState.selectedOption === 'spy') {
          const opponentIndex = 1 - playerIndex;
          const opponentId = gameState.seats?.[opponentIndex];
          if (opponentId) {
            const opponent = gameState.players[opponentId];
            if (opponent && opponent.hand.length > 0) {
              const randomIndex = Math.floor(Math.random() * opponent.hand.length);
              const discarded = opponent.hand.splice(randomIndex, 1)[0];
              gameState.discardPiles.action.push(discarded);
              addLog(`玩家${playerIndex + 1}发动了间谍，弃掉了对手的一张手牌`, playerIndex);
            }
          }
        } else if (gameState.selectedOption === 'heal') {
          const heroId = gameState.selectedTargetId;
          const card = gameState.tableCards.find((c: any) => c.id === heroId);
          if (card) {
            card.damage = 0;
            const counter = gameState.counters.find((c: any) => c.type === 'damage' && c.boundToCardId === heroId);
            if (counter) counter.value = 0;
            addLog(`玩家${playerIndex + 1}回复了${card.heroClass}的生命`, playerIndex);
          }
        } else if (gameState.selectedOption === 'evolve') {
          const heroId = gameState.selectedTargetId;
          const card = gameState.tableCards.find((c: any) => c.id === heroId);
          if (card && card.level < 3) {
            const expCounter = gameState.counters.find((c: any) => c.type === 'exp' && c.boundToCardId === card.id);
            const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
            const levelData = heroData?.levels?.[card.level.toString()];
            const expNeeded = levelData?.xp;
            if (expCounter && typeof expNeeded === 'number' && expCounter.value >= expNeeded) {
              expCounter.value -= expNeeded;
              card.level += 1;
              card.frontImage = getHeroCardImage(card.heroClass, card.level);
              card.backImage = getHeroBackImage(card.level);
              const token = gameState.tokens.find((t: any) => t.boundToCardId === card.id);
              if (token) {
                token.lv = card.level;
                token.label = `${card.heroClass} Lv${card.level}`;
              }
              addLog(`玩家${playerIndex + 1}进化了${card.heroClass}到Lv${card.level}`, playerIndex);
            }
          }
        } else if (gameState.selectedOption === 'hire') {
          // Handled by hire_hero event, but we might need to close the resolve phase
        }

        // @ts-ignore
        handlers.finish_action(socket);
      }
    },
    finish_discard: (socket: any) => {
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'discard' || player.discardFinished) return;

      if (player.hand.length > 5) {
        socket.emit('error_message', `你还需要弃掉 ${player.hand.length - 5} 张牌。`);
        return;
      }

      player.discardFinished = true;
      player.discardHistory = []; // Clear history after finishing
      addLog(`玩家 ${player.name} 完成了弃牌`, -1);

      const allFinished = gameState.seats
        .filter(id => id !== null)
        .every(id => gameState.players[id!].discardFinished);

      if (allFinished) {
        // @ts-ignore
        handlers.startShopPhase();
      } else {
        broadcastState();
      }
    },
    end_resolve_attack: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_resolve_attack' && playerIndex === gameState.activePlayerIndex) {
        const attackerToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
        const targetId = gameState.selectedTargetId;
        const targetToken = gameState.tokens.find((t: any) => t.id === targetId);
        const targetCard = gameState.tableCards.find((c: any) => c.id === targetId);
        
        const defenseCard = gameState.playAreaCards.find((c: any) => c.name === '防御' || c.name === '闪避');
        const isDefended = !!defenseCard;

        if (targetToken && targetCard) {
          if (isDefended) {
            addLog(`${targetCard.heroClass} 使用了 ${defenseCard.name}，攻击被抵消`, 1 - playerIndex);
          } else {
            const attackerCard = gameState.tableCards.find((c: any) => c.id === attackerToken?.boundToCardId);
            const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === attackerCard?.heroClass);
            const levelData = heroData?.levels?.[attackerCard?.level || 1];
            let damage = levelData?.atk || 1;
            
            const enhancementCard = gameState.activeEnhancementCardId 
              ? (gameState.playAreaCards.find((c: any) => c.id === gameState.activeEnhancementCardId) || 
                 gameState.discardPiles.action.find((c: any) => c.id === gameState.activeEnhancementCardId))
              : null;
            damage += getAttackDamageBonusFromEnhancement(enhancementCard?.name);

            targetCard.damage = (targetCard.damage || 0) + damage;
            let damageCounter = gameState.counters.find((c: any) => c.type === 'damage' && c.boundToCardId === targetCard.id);
            if (!damageCounter) {
              damageCounter = { id: generateId(), type: 'damage', x: targetToken.x, y: targetToken.y, value: 0, boundToCardId: targetCard.id };
              gameState.counters.push(damageCounter);
            }
            damageCounter.value = targetCard.damage;

            addLog(`${attackerCard?.heroClass} 对 ${targetCard.heroClass} 造成了 ${damage} 点伤害`, playerIndex);

            const targetHeroData = heroesDatabase?.heroes?.find((h: any) => h.name === targetCard.heroClass);
            const targetMaxHP = targetHeroData?.levels?.[targetCard.level || 1]?.hp || 1;
            if (targetCard.damage >= targetMaxHP) {
              addLog(`${targetCard.heroClass} 阵亡了！`, 1 - playerIndex);
              gameState.tokens = gameState.tokens.filter((t: any) => t.id !== targetToken.id);
              gameState.counters.push({ id: generateId(), type: 'time', x: targetToken.x, y: targetToken.y, value: 0, boundToCardId: targetCard.id });
              addReputation(playerIndex, REWARDS.KILL_HERO.REP, "击杀英雄");
            }
          }
        } else if (targetId && targetId.startsWith('monster_')) {
          const monster = gameState.map?.monsters?.find((m: any) => `monster_${m.q}_${m.r}` === targetId);
          if (monster) {
            addLog(`击败了等级 ${monster.level} 的怪物`, playerIndex);
            const goldCounter = gameState.counters.find((c: any) => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
            if (goldCounter) goldCounter.value += REWARDS.MONSTER[monster.level as 1|2|3].GOLD;
            addReputation(playerIndex, REWARDS.MONSTER[monster.level as 1|2|3].REP, "击杀怪物");
            
            const pos = hexToPixel(monster.q, monster.r);
            gameState.counters.push({ id: generateId(), type: 'time', x: pos.x, y: pos.y, value: 0 });
          }
        } else if (targetId && targetId.startsWith('castle_')) {
          const castleIndex = parseInt(targetId.split('_')[1]);
          gameState.castleHP[castleIndex as 0|1] -= 1;
          addLog(`对王城 ${castleIndex + 1} 造成了 1 点伤害`, playerIndex);
          addReputation(playerIndex, REWARDS.ATTACK_CASTLE.REP, "攻击王城");
          
          if (gameState.castleHP[castleIndex as 0|1] <= 0) {
            gameState.notification = `游戏结束！玩家 ${playerIndex + 1} 攻陷了王城，获得胜利！`;
            gameState.gameStarted = false;
          }
        }

        // @ts-ignore
        handlers.finish_action(socket);
      }
    },
    end_resolve_attack_counter: (socket: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const isPlayer2 = gameState.seats?.[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_resolve_attack_counter' && playerIndex === gameState.activePlayerIndex) {
        const attackerToken = gameState.tokens.find((t: any) => t.id === gameState.selectedTokenId);
        const attackerCard = gameState.tableCards.find((c: any) => c.id === attackerToken?.boundToCardId);
        const defenderCard = gameState.tableCards.find((c: any) => c.id === gameState.selectedTargetId);
        const defenderToken = gameState.tokens.find((t: any) => t.boundToCardId === gameState.selectedTargetId);

        if (attackerToken && attackerCard && defenderCard && defenderToken) {
          const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === defenderCard.heroClass);
          const levelData = heroData?.levels?.[defenderCard.level || 1];
          const damage = levelData?.atk || 1;

          attackerCard.damage = (attackerCard.damage || 0) + damage;
          let damageCounter = gameState.counters.find((c: any) => c.type === 'damage' && c.boundToCardId === attackerCard.id);
          if (!damageCounter) {
            damageCounter = { id: generateId(), type: 'damage', x: attackerToken.x, y: attackerToken.y, value: 0, boundToCardId: attackerCard.id };
            gameState.counters.push(damageCounter);
          }
          damageCounter.value = attackerCard.damage;

          addLog(`${defenderCard.heroClass} 对 ${attackerCard.heroClass} 进行了反击，造成了 ${damage} 点伤害`, playerIndex);

          const attackerHeroData = heroesDatabase?.heroes?.find((h: any) => h.name === attackerCard.heroClass);
          const attackerMaxHP = attackerHeroData?.levels?.[attackerCard.level || 1]?.hp || 1;
          if (attackerCard.damage >= attackerMaxHP) {
            addLog(`${attackerCard.heroClass} 阵亡了！`, 1 - playerIndex);
            gameState.tokens = gameState.tokens.filter((t: any) => t.id !== attackerToken.id);
            gameState.counters.push({ id: generateId(), type: 'time', x: attackerToken.x, y: attackerToken.y, value: 0, boundToCardId: attackerCard.id });
            addReputation(1 - playerIndex, REWARDS.KILL_HERO.REP, "反击击杀英雄");
          }
        }

        // @ts-ignore
        handlers.finish_action(socket);
      }
    },
    end_resolve_counter: (socket: any) => {
      // @ts-ignore
      handlers.end_resolve_attack_counter(socket);
    },
    hire_hero: (socket: any, { cardId, goldAmount, targetCastleIndex }: any) => {
      const isPlayer1 = gameState.seats?.[0] === socket.id;
      const playerIndex = isPlayer1 ? 0 : 1;
      
      const result = HeroEngine.hireHero(gameState, playerIndex, cardId, goldAmount, targetCastleIndex, {
        addLog,
        checkBotTurn,
        generateId,
        getHeroTokenImage,
        broadcastState
      });

      if (!result.success) {
        socket.emit('error_message', result.reason);
        return;
      }

      broadcastState();
      checkBotTurn();
    },
    cancel_play_card: (socket: any) => {
      const player = gameState.players[socket.id];
      if (!player || !gameState.lastPlayedCardId) return;

      const cardId = gameState.lastPlayedCardId;
      let cardIndex = gameState.playAreaCards.findIndex((c: any) => c.id === cardId);
      let card;
      if (cardIndex !== -1) {
        card = gameState.playAreaCards.splice(cardIndex, 1)[0];
      } else {
        cardIndex = gameState.tableCards.findIndex((c: any) => c.id === cardId);
        if (cardIndex !== -1) {
          card = gameState.tableCards.splice(cardIndex, 1)[0];
        }
      }

      if (card) {
        player.hand.push(card);
        gameState.lastPlayedCardId = null;
        gameState.phase = 'action_play';
        broadcastState();
      }
    },
  };

  return handlers;
};
