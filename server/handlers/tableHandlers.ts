import { HeroEngine } from '../../src/logic/hero/heroEngine.ts';

export const createTableHandlers = (deps: any) => {
  const {
    gameState,
    io,
    addLog,
    checkBotTurn,
    broadcastState,
    getPlayerIndex,
    createInitialState,
    getHeroTokenImage,
    getHeroCardImage,
    getHeroBackImage,
    generateId,
    drawCards,
    heroesDatabase
  } = deps;

  return {
    start_game: (socket: any) => {
      if (gameState.seats[0] === null || gameState.seats[1] === null) {
        socket.emit('error_message', '需要两名玩家才能开始游戏 (Need two players to start)');
        return;
      }

      gameState.gameStarted = true;
      gameState.phase = 'setup';
      gameState.round = 1;
      gameState.firstPlayerIndex = Math.random() < 0.5 ? 0 : 1;
      gameState.activePlayerIndex = gameState.firstPlayerIndex;
      gameState.castleHP = {0: 3,  1: 3};
      gameState.reputation = {0: 0, 1:0 };
      gameState.notification = null;

      // Initialize decks
      const initialDecks = createInitialState().decks;
      gameState.decks = {
        treasure1: [...initialDecks.treasure1].sort(() => Math.random() - 0.5),
        treasure2: [...initialDecks.treasure2].sort(() => Math.random() - 0.5),
        treasure3: [...initialDecks.treasure3].sort(() => Math.random() - 0.5),
        action: [...initialDecks.action].sort(() => Math.random() - 0.5),
        hero: [...initialDecks.hero].sort(() => Math.random() - 0.5)
      };

      gameState.discardPiles = {
        action: []
      };

      // Draw initial hands
      const p1Id = gameState.seats[0];
      const p2Id = gameState.seats[1];
      
      if (p1Id && gameState.players[p1Id]) {
        gameState.players[p1Id].hand = [];
        for(let i=0;i<4;i++){
          gameState.players[p1Id].hand.push(gameState.decks.hero.pop()!)
        }
      }
      if (p2Id && gameState.players[p2Id]) {
        gameState.players[p2Id].hand = [];
        for(let i=0;i<4;i++){
          gameState.players[p2Id].hand.push(gameState.decks.hero.pop()!)
        }
      }

      addLog(`游戏开始！玩家 ${gameState.firstPlayerIndex + 1} 先手 (Game Started! Player ${gameState.firstPlayerIndex + 1} goes first)`, -1);
      broadcastState();
      checkBotTurn();
    },
    reset_game: (socket: any) => {
      const seats = [...gameState.seats];
      const players = { ...gameState.players };
      const map = gameState.map;
      const mapConfig = gameState.mapConfig;
      const imageConfig = gameState.imageConfig;
      
      // Completely clear gameState to remove any optional runtime fields (e.g. emberZones, icePillars, blizzardZones)
      for (const key in gameState) {
        delete (gameState as any)[key];
      }
      
      const newState = createInitialState();
      Object.assign(gameState, newState);
      
      gameState.seats = seats;
      gameState.players = players;
      gameState.map = map;
      gameState.mapConfig = mapConfig;
      if (imageConfig) {
        gameState.imageConfig = imageConfig;
      }
      
      gameState.notification = null;
      gameState.gameStarted = false;
      
      Object.values(gameState.players).forEach((p: any) => {
        p.hand = [];
        p.gold = 0;
        p.discardFinished = false;
        p.discardHistory = [];
      });
      
      addLog('游戏已重置 (Game Reset)', -1);
      broadcastState();
    },
    update_image_config: (socket: any) => {
      broadcastState();
    },
    update_map: (socket: any, mapConfig: any) => {
      gameState.map = JSON.parse(JSON.stringify(mapConfig));
      gameState.mapConfig = JSON.parse(JSON.stringify(mapConfig));
      gameState.magicCircles = (mapConfig.magicCircles || []).map((mc: any) => ({
        q: mc.q,
        r: mc.r,
        state: 'idle'
      }));
      broadcastState();
    },
    draw_card: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1) return;
      
      if (gameState.decks.action.length === 0) {
        if (gameState.discardPiles.action.length === 0) return;
        gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
        gameState.discardPiles.action = [];
      }
      
      drawCards(socket.id, 1);
      addLog(`玩家${playerIndex + 1}抽了一张牌 (Player ${playerIndex + 1} drew a card)`, playerIndex);
      broadcastState();
    },
    draw_card_to_table: (socket: any, deckType: string, x: number, y: number) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1) return;

      let deck;
      if (deckType === 'discard_action') {
        deck = gameState.discardPiles.action;
      } else {
        deck = gameState.decks[deckType as keyof typeof gameState.decks];
      }
      
      if (!deck || deck.length === 0) return;

      const card = deck.pop()!;
      card.x = x;
      card.y = y;
      gameState.tableCards.push(card);

      addLog(`玩家${playerIndex + 1}从${deckType}抽牌到桌面 (Player ${playerIndex + 1} drew from ${deckType} to table)`, playerIndex);
      broadcastState();
    },
    shuffle_deck: (socket: any, deckType: string) => {
      if (deckType === 'discard_action') {
        gameState.discardPiles.action.sort(() => Math.random() - 0.5);
        addLog(`弃牌堆已洗牌 (Discard pile shuffled)`, -1);
        broadcastState();
      } else if (gameState.decks[deckType as keyof typeof gameState.decks]) {
        gameState.decks[deckType as keyof typeof gameState.decks].sort(() => Math.random() - 0.5);
        addLog(`${deckType} 牌堆已洗牌 (Deck shuffled)`, -1);
        broadcastState();
      }
    },
    take_card_to_hand: (socket: any, cardId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1) return;

      const player = gameState.players[socket.id];
      if (!player) return;

      let cardIndex = gameState.tableCards.findIndex((c: any) => c.id === cardId);
      if (cardIndex !== -1) {
        const card = gameState.tableCards.splice(cardIndex, 1)[0];
        card.faceUp = false;
        player.hand.push(card);
        addLog(`玩家${playerIndex + 1}将卡牌拿回手牌 (Player ${playerIndex + 1} took card to hand)`, playerIndex);
        broadcastState();
        return;
      }

      cardIndex = gameState.hireAreaCards.findIndex((c: any) => c.id === cardId);
      if (cardIndex !== -1) {
        const card = gameState.hireAreaCards.splice(cardIndex, 1)[0];
        card.faceUp = false;
        player.hand.push(card);
        addLog(`玩家${playerIndex + 1}将卡牌拿回手牌 (Player ${playerIndex + 1} took card to hand)`, playerIndex);
        broadcastState();
      }
    },
    move_item: (socket: any, { type, id, x, y }: any) => {
      if (type === 'card') {
        const card = gameState.tableCards.find((c: any) => c.id === id);
        if (card) {
          card.x = x;
          card.y = y;
          io.emit('state_update', gameState);
        } else {
          const hireCard = gameState.hireAreaCards.find((c: any) => c.id === id);
          if (hireCard) {
            hireCard.x = x;
            hireCard.y = y;
            io.emit('state_update', gameState);
          } else if (gameState.playAreaCards) {
            const playCard = gameState.playAreaCards.find((c: any) => c.id === id);
            if (playCard) {
              playCard.x = x;
              playCard.y = y;
              io.emit('state_update', gameState);
            }
          }
        }
      } else if (type === 'token') {
        const token = gameState.tokens.find((t: any) => t.id === id);
        if (token) {
          token.x = x;
          token.y = y;
          io.emit('state_update', gameState);
        }
      } else if (type === 'counter') {
        const counter = gameState.counters.find((c: any) => c.id === id);
        if (counter) {
          counter.x = x;
          counter.y = y;
          io.emit('state_update', gameState);
        }
      }
    },
    flip_card: (socket: any, cardId: string) => {
      const card = gameState.tableCards.find((c: any) => c.id === cardId);
      if (card) {
        card.faceUp = !card.faceUp;
        io.emit('state_update', gameState);
      }
    },
    add_counter: (socket: any, { type, x, y, value }: any) => {
      gameState.counters.push({
        id: generateId(),
        type,
        x,
        y,
        value: value || 1
      });
      io.emit('state_update', gameState);
    },
    update_counter: (socket: any, { id, delta }: any) => {
      const counterIndex = gameState.counters.findIndex((c: any) => c.id === id);
      if (counterIndex !== -1) {
        const counter = gameState.counters[counterIndex];
        counter.value += delta;
        if (counter.value <= 0) {
          gameState.counters.splice(counterIndex, 1);
        }
        io.emit('state_update', gameState);
      }
    },
    update_token_value: (socket: any, { id, field, delta }: any) => {
      const token = gameState.tokens.find((t: any) => t.id === id);
      if (token && typeof token[field] === 'number') {
        token[field] += delta;
        io.emit('state_update', gameState);
      }
    },
    spawn_hero: (socket: any, { heroClass, level, x, y }: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1) return;

      const cardId = generateId();
      const tokenId = generateId();

      const card = {
        id: cardId,
        type: 'hero',
        heroClass,
        level,
        x,
        y,
        faceUp: true,
        image: getHeroCardImage(heroClass, level),
        backImage: getHeroBackImage(level)
      };

      const token = {
        id: tokenId,
        type: 'hero',
        heroClass,
        level,
        x,
        y: y + 80,
        hp: 10,
        maxHp: 10,
        boundToCardId: cardId,
        image: getHeroTokenImage(heroClass)
      };

      gameState.tableCards.push(card);
      gameState.tokens.push(token);
      
      addLog(`玩家${playerIndex + 1}生成了 ${heroClass} (Lv${level}) (Player ${playerIndex + 1} spawned ${heroClass})`, playerIndex);
      broadcastState();
    },
    clear_notification: (socket: any) => {
      gameState.notification = null;
      broadcastState();
    },
    steal_first_player: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1) return;

      gameState.firstPlayerIndex = playerIndex;
      addLog(`玩家${playerIndex + 1}抢夺了先手 (Player ${playerIndex + 1} stole first player)`, playerIndex);
      broadcastState();
    } 
  };
};
