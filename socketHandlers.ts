
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
      const playerIndex = getPlayerIndex(socket.id);

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
      const playerIndex = getPlayerIndex(socket.id);
      
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
      const playerIndex = getPlayerIndex(socket.id);
      
      ActionEngine.moveTokenToCell(gameState, playerIndex, q, r, actionHelpers, socket);
    },
    select_hire_cost: (socket: any, cost: number) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === gameState.activePlayerIndex) {
        gameState.selectedHireCost = cost;
        broadcastState();
      }
    },
    select_token: (socket: any, tokenId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectToken(gameState, playerIndex, tokenId, actionHelpers, socket);
    },
    select_option: (socket: any, option: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectOption(gameState, playerIndex, option, actionHelpers, socket);
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
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.resolveTargetSelection(gameState, playerIndex, targetId, actionHelpers, socket);
    },

    proceed_phase: (socket: any) => {
      ActionEngine.proceedPhase(gameState, actionHelpers, socket);
    },

    play_enhancement_card: (socket: any, cardId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.playEnhancementCard(gameState, playerIndex, cardId, actionHelpers, socket);
    },

    pass_enhancement: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.passEnhancement(gameState, playerIndex, actionHelpers, socket);
    },

    finish_action: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.finishAction(gameState, playerIndex, actionHelpers, socket);
    },

    pass_action: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.passAction(gameState, playerIndex, actionHelpers, socket);
    },
    pass_defend: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        addLog(`玩家${playerIndex + 1}放弃防御 (Pass Defend)`, playerIndex);
        gameState.phase = 'action_resolve_attack';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
    declare_defend: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      
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
      const playerIndex = getPlayerIndex(socket.id);
      
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
      
      const playerIndex = getPlayerIndex(socket.id);
      
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
      const playerIndex = getPlayerIndex(socket.id);
      
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
      const playerIndex = getPlayerIndex(socket.id);
      
      if ((gameState.phase === 'action_play_defense' || gameState.phase === 'action_play_counter') && playerIndex === gameState.activePlayerIndex) {
        gameState.phase = 'action_defend';
        gameState.notification = null;
        broadcastState();
        checkBotTurn();
      }
    },
    next_shop: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      
      if (gameState.phase === 'shop' && playerIndex === gameState.activePlayerIndex) {
        gameState.consecutivePasses = 0;
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
    pass_shop: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      
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
    finish_discard: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.finishDiscard(gameState, playerIndex, actionHelpers, socket);
    },
    end_resolve_attack: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.endResolveAttack(gameState, playerIndex, actionHelpers, socket);
    },
    end_resolve_attack_counter: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.endResolveAttackCounter(gameState, playerIndex, actionHelpers, socket);
    },
    hire_hero: (socket: any, { cardId, goldAmount, targetCastleIndex }: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      
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
