import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import type { GameState, Card, TableCard, Token, Counter, Player, ImageConfig, MapConfig, GamePhase } from './src/shared/types/index.ts';
import { REWARDS } from './src/shared/hex/tileLogic.ts';
import { DEFAULT_MAP, BUILTIN_MAPS } from './src/shared/config/maps/mapIndex.ts';
import { getHeroTokenImage } from './src/shared/utils/assetUtils.ts';

import { HEROES_DATABASE } from './src/shared/config/heroes.ts';
import { Hex, hexRound, hexToPixel, pixelToHex, getHexDistance, HEX_DIRECTIONS } from './src/shared/utils/hexUtils.ts';
import { isTargetInAttackRange, getNeighbors, getRecoilHex, getPathDist, isHexInEnemyAttackRange, getReachableHexes, resolveTileEffect, getAttackableHexes } from './src/logic/map/mapLogic.ts';
import { getHeroStat, canHeroEvolve, getRespawnTime, getHeroCurrentHP } from './src/logic/hero/heroLogic.ts';
import { PhaseManager } from './src/logic/phase/phaseLogic.ts';
import { CardLogic } from './src/logic/card/cardLogic.ts';
import { HeroEngine } from './src/logic/hero/heroEngine.ts';
import { BotStrategy, BotAction } from './src/logic/ai/botStrategy.ts';
import { ActionEngine, ActionHelpers } from './src/logic/action/actionEngine.ts';
import { createHandlers } from './socketHandlers.ts';
import { dispatchGameCommand } from './server/dispatchGameCommand.ts';

const heroesDatabase = HEROES_DATABASE;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
 
// --- CONFIGURATION FOR DEVELOPER ---
const BASE_URL = 'https://raw.githubusercontent.com/zhipijun1996/heros_war/main/';

const TREASURE1_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_t1.png`;
const TREASURE2_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8Ct2.png`;
const TREASURE3_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_t3.png`;
const ACTION_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E5%85%AC%E5%85%B1%E7%89%8C%E5%A0%86.png`;
const HERO1_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv1.png`;
const HERO2_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv2.png`;
const HERO3_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv3.png`;

const HERO_CLASSES = [
  '重甲兵', '巨盾卫士', '战士', '狂战士', '决斗大师', '刺客', '盗贼', 
  '弓箭手', '冰法师', '火法师', '圣职者', '指挥官'
];

const HERO_PRIORITY: Record<string, number> = {
  '指挥官': 15,
  '火法师': 14,
  '冰法师': 13,
  '圣职者': 12,
  '重甲兵': 11,
  '巨盾卫士': 10,
  '战士': 9,
  '狂战士': 8,
  '决斗大师': 7,
  '刺客': 6,
  '盗贼': 5,
  '弓箭手': 4
};

// --- HERO IMAGES CONFIGURATION ---

const getHeroCardImage = (heroClass: string, level: number) => {
  if (heroClass === '圣职者' && level === 2) return `${BASE_URL}%E5%9C%A3%E8%81%8C%E8%80%85_LV2.png`;
  if (heroClass === '重甲兵' && level === 2) return `${BASE_URL}%E9%87%8D%E7%94%B2%E5%85%B5_LV2.png`;
  return `${BASE_URL}${encodeURIComponent(heroClass)}lv${level}.png`;
};

const getHeroBackImage = (level: number) => {
  if (level === 1) return HERO1_BACK;
  if (level === 2) return HERO2_BACK;
  return HERO3_BACK;
};

const generateId = () => Math.random().toString(36).substring(2, 9);

const getPlayerIndex = (socketId: string) => {
  return gameState.seats.indexOf(socketId);
};

const T1_CARDS = ['冲刺卷轴', '治疗药水', '移动号角', '经验卷轴', '远程战术', '防御符文'].map(n => `${BASE_URL}t1_${encodeURIComponent(n)}.png`);
const T2_CARDS = ['侦察镜', '战术盾', '战术腰带', '指挥旗', '防御手套', '骑士战靴'].map(n => `${BASE_URL}t2_${encodeURIComponent(n)}.png`);
const T3_CARDS = ['战场旗帜', '战术望远镜', '战马', '重装铠甲'].map(n => `${BASE_URL}t3_${encodeURIComponent(n)}.png`);

const ACTION_CARDS_CONFIG = [
  { name: '冲刺', copies: 3, image: 'https://image.pollinations.ai/prompt/A%20pair%20of%20glowing%20winged%20boots%20speeding%20forward%20fantasy%20anime%20art?nologo=true' },
  { name: '回复', copies: 2, image: 'https://image.pollinations.ai/prompt/A%20glowing%20green%20healing%20potion%20bottle%20fantasy%20anime%20art?nologo=true' },
  { name: '间谍', copies: 3, image: 'https://image.pollinations.ai/prompt/A%20mysterious%20rogue%20in%20a%20dark%20cloak%20hiding%20in%20shadows%20fantasy%20anime%20art?nologo=true' },
  { name: '替身', copies: 3, image: 'https://image.pollinations.ai/prompt/A%20magical%20shadow%20clone%20or%20substitute%20dummy%20in%20fantasy%20style%20anime%20art?nologo=true' },
  { name: '远攻', copies: 3, image: 'https://image.pollinations.ai/prompt/A%20glowing%20magic%20arrow%20flying%20through%20the%20air%20fantasy%20anime%20art?nologo=true' },
  { name: '防御', copies: 5, image: 'https://image.pollinations.ai/prompt/A%20glowing%20magical%20shield%20blocking%20an%20attack%20fantasy%20anime%20art?nologo=true' },
];

const MONSTER_CELLS = [
  { q: -2, r: 4 }, { q: 2, r: 2 }, { q: -2, r: -2 }, { q: 2, r: -4 }, // M1
  { q: -3, r: 1 }, { q: -1, r: 1 }, { q: 3, r: -1 }, { q: 1, r: -1 }, // M2
  { q: -3, r: 3 }, { q: 3, r: -3 } // M3
];

const CHEST_HEXES = [
  { q: 0, r: 0 }, { q: -4, r: 2 }, { q: 4, r: -2 }, { q: -4, r: 4 }, { q: 4, r: -4 }
];

const createActionDeck = (): Card[] => {
  const deck: Card[] = [];
  ACTION_CARDS_CONFIG.forEach(config => {
    for (let i = 0; i < config.copies; i++) {
      deck.push({
        id: generateId(),
        frontImage: config.image,
        backImage: ACTION_BACK,
        type: 'action',
        name: config.name,
      });
    }
  });
  return deck.sort(() => Math.random() - 0.5);
};

const createHeroDeck = (): Card[] => {
  const deck: Card[] = HERO_CLASSES.map(heroClass => ({
    id: generateId(),
    frontImage: getHeroCardImage(heroClass, 1),
    backImage: HERO1_BACK,
    type: 'hero',
    heroClass: heroClass,
    level: 1,
  }));
  return deck.sort(() => Math.random() - 0.5);
};

const createSpecificDeck = (type: string, back: string, urls: string[], copies: number): Card[] => {
  const deck: Card[] = [];
  urls.forEach(url => {
    for (let i = 0; i < copies; i++) {
      deck.push({
        id: generateId(),
        frontImage: url,
        backImage: back,
        type: type as any,
      });
    }
  });
  return deck.sort(() => Math.random() - 0.5);
};

const createInitialState = (mapConfig: MapConfig = DEFAULT_MAP): GameState => {
  const state: GameState = {
    map: mapConfig,
    gameStarted: false,
    seats: [null, null],
    players: {},
    tokens: [],
    tableCards: [],
    hireAreaCards: [],
    playAreaCards: [],
    decks: {
      treasure1: createSpecificDeck('treasure1', TREASURE1_BACK, T1_CARDS, 2), // 12 cards
      treasure2: createSpecificDeck('treasure2', TREASURE2_BACK, T2_CARDS, 2), // 12 cards
      treasure3: createSpecificDeck('treasure3', TREASURE3_BACK, T3_CARDS, 1), // 4 cards
      action: createActionDeck(), // 50 cards
      hero: createHeroDeck(), // 12 LV1 heroes
    },
    discardPiles: {
      action: [],
    },
    counters: [
      { id: generateId(), type: 'gold', x: -150, y: 550, value: 0 },
      { id: generateId(), type: 'gold', x: -150, y: -700, value: 0 }
    ],
    imageConfig: {
      heroTokens: [], heroCards: [], actionCards: [], t1Cards: [], t2Cards: [], t3Cards: []
    },
    heroPlayed: {},
    heroPlayedCount: {},
    round: 1,
    firstPlayerIndex: 0,
    activePlayerIndex: 0,
    phase: 'setup',
    consecutivePasses: 0,
    shopPasses: 0,
    selectedOption: null,
    selectedTargetId: null,
    selectedHireCost: null,
    selectedTokenId: null,
    remainingMv: 0,
    reachableCells: [],
    castleHP: { 0: 3, 1: 3 },
    reputation: { 0: 0, 1: 0 },
    roundActionCounts: {},
    magicCircles: mapConfig.magicCircles.map(mc => ({ q: mc.q, r: mc.r, state: 'idle' })),
    pendingRevivals: [],
    logs: [],
    actionTokens: [],
    activeActionTokenId: null,
    activeActionType: null,
    activeEnhancementCardId: null,
    activeHeroTokenId: null,
  };

  const drawToTable = (deckType: keyof GameState['decks'], count: number, startX: number, startY: number) => {
    for (let i = 0; i < count; i++) {
      if (state.decks[deckType].length > 0) {
        const card = state.decks[deckType].pop()!;
        state.tableCards.push({
          ...card,
          x: startX - (i + 1) * 120,
          y: startY,
          faceUp: true
        });
      }
    }
  };

  drawToTable('treasure1', 4, -500, -200);
  drawToTable('treasure2', 3, -500, 0);
  drawToTable('treasure3', 2, -500, 200);

  return state;
};

let gameState = createInitialState();

const HEX_SIZE = 45;

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  const PORT = 3000;

  const alignHireArea = () => {
    const startX = 140;
    const startY = -500;
    gameState.hireAreaCards.forEach((card, i) => {
      card.x = startX + (i % 6) * 110;
      card.y = startY - Math.floor(i / 6) * 160;
      card.faceUp = true;
    });
  };

  const setPhase = (phase: GamePhase) => {
    PhaseManager.initPhase(gameState, phase);
    broadcastState();
  };

  const getHeroAR = (heroClass: string, level: number = 1) => {
    return getHeroStat(heroClass, level, 'ar');
  };

  const getHeroHP = (heroClass: string, level: number = 1) => {
    return getHeroStat(heroClass, level, 'hp');
  };

  const addLog = (message: string, playerIndex: number = -1) => {
    const log: any = {
      id: generateId(),
      round: gameState.round,
      playerIndex,
      message,
      timestamp: Date.now()
    };
    gameState.logs.push(log);
    if (gameState.logs.length > 100) {
      gameState.logs.shift();
    }
  };

  const addReputation = (playerIndex: number, amount: number, reason: string) => {
    if (playerIndex < 0 || playerIndex > 1 || !gameState.gameStarted) return;
    gameState.reputation[playerIndex] = (gameState.reputation[playerIndex] || 0) + amount;
    addLog(`声望奖励: 玩家${playerIndex + 1} 获得 ${amount} 点声望 (${reason})，当前声望: ${gameState.reputation[playerIndex]}`, playerIndex);
    
    if (gameState.reputation[playerIndex] >= 15) {
      gameState.notification = `游戏结束！玩家 ${playerIndex + 1} 声望达到 15，获得胜利！`;
      gameState.gameStarted = false;
      addLog(`胜利阶段: 玩家${playerIndex + 1} 达成声望胜利！`, playerIndex);
    }
  };

const broadcastState = () => {
    io.emit('state_update', gameState);
  };

  const MONSTER_HEXES = [
    { q: -2, r: 4, level: 1, icon: "👾" },
    { q: 2, r: 2, level: 1, icon: "👾" },
    { q: -2, r: -2, level: 1, icon: "👾" },
    { q: 2, r: -4, level: 1, icon: "👾" },
    { q: -3, r: 3, level: 2, icon: "💀" },
    { q: -1, r: 1, level: 2, icon: "💀" },
    { q: 3, r: -3, level: 2, icon: "💀" },
    { q: 1, r: -1, level: 2, icon: "💀" },
    { q: -3, r: 1, level: 3, icon: "🐉" },
    { q: 3, r: -1, level: 3, icon: "🐉" },
  ];


  const updateAvailableActions = (playerIndex: number) => {
    const isPlayer1 = playerIndex === 0;
    const isPlayer2 = playerIndex === 1;
    const playerHeroes = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0)));
    
    // Check evolve condition
    const evolvableHeroIds: string[] = [];
    for (const hero of playerHeroes) {
      if (canHeroEvolve(hero, gameState)) {
        evolvableHeroIds.push(hero.id);
      }
    }
    gameState.canEvolve = evolvableHeroIds.length > 0;
    gameState.evolvableHeroIds = evolvableHeroIds;

    // Check heal condition
    const healableHeroIds = playerHeroes.filter(h => (h.damage || 0) > 0).map(h => h.id);
    gameState.healableHeroIds = healableHeroIds;

    // Check chest condition
    const playerTokens = gameState.tokens.filter(t => {
      const c = gameState.tableCards.find(tc => tc.id === t.boundToCardId);
      return c && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0));
    });
    const onChest = playerTokens.some(t => {
      const hex = pixelToHex(t.x, t.y);
      return gameState.map?.chests?.some(ch => ch.q === hex.q && ch.r === hex.r) || false;
    });
    (gameState as any).canOpenChest = onChest;
  };

  let pendingBotTurnTimeout: NodeJS.Timeout | null = null;

  const checkBotTurn = () => {
    if (pendingBotTurnTimeout) {
      clearTimeout(pendingBotTurnTimeout);
      pendingBotTurnTimeout = null;
    }

    if (!gameState.gameStarted) return;

    const phase = gameState.phase;
    console.log(`checkBotTurn: phase=${phase}, activePlayerIndex=${gameState.activePlayerIndex}`);
    
    if (phase === 'discard') {
      gameState.seats?.filter(id => id !== null).forEach(id => {
        const player = gameState.players[id!];
        if (player?.isBot && !player.discardFinished && player.hand) {
          const botSocket = { id: id!, emit: () => {}, broadcast: { emit: () => {} } };
          let action = BotStrategy.decideNextAction(gameState, gameState.seats.indexOf(id!), HEROES_DATABASE);
          let safetyCounter = 0;
          while (action.type === 'discard_card' && safetyCounter < 20) {
            migratedHandlers.discard_card(botSocket, action.payload.cardId);
            action = BotStrategy.decideNextAction(gameState, gameState.seats.indexOf(id!), HEROES_DATABASE);
            safetyCounter++;
          }
          if (safetyCounter >= 20) {
            console.error(`[BotTurn] Safety break triggered for discard_card loop for player ${id}`);
            migratedHandlers.finish_discard(botSocket);
          }
          if (action.type === 'finish_discard') {
            migratedHandlers.finish_discard(botSocket);
          }
        }
      });
      return;
    }

    const activePlayerId = gameState.seats?.[gameState.activePlayerIndex];
    if (activePlayerId && gameState.players[activePlayerId]?.isBot) {
      const botPlayer = gameState.players[activePlayerId];
      if (!botPlayer || !botPlayer.hand) return;

      if (pendingBotTurnTimeout) {
        clearTimeout(pendingBotTurnTimeout);
      }
      
      pendingBotTurnTimeout = setTimeout(() => {
        pendingBotTurnTimeout = null;

        if (!gameState.gameStarted) return;
        const currentActiveId = gameState.seats?.[gameState.activePlayerIndex];
        if (currentActiveId !== activePlayerId) return;
        if (!botPlayer || !botPlayer.hand) return;

        console.log(`[BotTurn] Phase: ${gameState.phase}, Player: ${gameState.activePlayerIndex === 0 ? 'P1' : 'P2'}, Hand: ${botPlayer.hand.length}`);

        const botSocket = { id: activePlayerId, emit: () => {}, broadcast: { emit: () => {} } };
        const action = BotStrategy.decideNextAction(gameState, gameState.activePlayerIndex, HEROES_DATABASE);

        console.log(`[BotTurn] Action: ${action.type}`, action);

        dispatchGameCommand(botSocket, action, {
          migratedHandlers,
          gameState
        });

      }, 1000);
    }
  };

  const processEndOfTurn = (playerIndex: number) => {
    let stateChanged = false;

    // Clear play area cards
    if (gameState.playAreaCards.length > 0) {
      gameState.discardPiles.action.push(...gameState.playAreaCards);
      gameState.playAreaCards = [];
      stateChanged = true;
    }
    
    // Convert EXP to Gold for Lv3 heroes
    gameState.tableCards.forEach(card => {
      const isCardOwner = (playerIndex === 0 && card.y > 0) || (playerIndex === 1 && card.y < 0);
      if (isCardOwner && card.type === 'hero' && card.level === 3) {
        const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === card.id);
        if (expCounter && expCounter.value > 0) {
          const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
          if (goldCounter) {
            goldCounter.value += expCounter.value;
            expCounter.value = 0;
            stateChanged = true;
          }
        }
      }
    });

    // Magic Circle Rewards
    gameState.magicCircles.forEach(mc => {
      if (mc.state === 'chanting' && mc.chantingTokenId) {
        const token = gameState.tokens.find(t => t.id === mc.chantingTokenId);
        if (token) {
          const card = gameState.tableCards.find(tc => tc.id === token.boundToCardId);
          if (card) {
            const cardOwnerIndex = card.y > 0 ? 0 : 1;
            if (cardOwnerIndex === playerIndex) {
              addReputation(playerIndex, REWARDS.MAGIC_CIRCLE.REP_PER_TURN, "魔法阵咏唱");
              stateChanged = true;
            }
          }
        }
      }
    });

    // Chest Rewards (Automatic opening at end of turn)
    gameState.tokens.forEach(token => {
      const card = gameState.tableCards.find(tc => tc.id === token.boundToCardId);
      if (card) {
        const cardOwnerIndex = card.y > 0 ? 0 : 1;
        if (cardOwnerIndex === playerIndex) {
          const hex = pixelToHex(token.x, token.y);
          const chest = gameState.map?.chests?.find(ch => ch.q === hex.q && ch.r === hex.r);
          if (chest) {
            // Check if already depleted
            const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - token.x) < 10 && Math.abs(c.y - token.y) < 10);
            if (!hasTimer) {
              const chestType = chest.type === 'T1' ? 1 : (chest.type === 'T2' ? 2 : 3);
              
              let goldReward = 0;
              if (chestType === 1) goldReward = REWARDS.CHEST.T1_GOLD;
              else if (chestType === 2) goldReward = REWARDS.CHEST.T2_GOLD;
              else if (chestType === 3) goldReward = REWARDS.CHEST.T3_GOLD;

              const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
              if (goldCounter) goldCounter.value += goldReward;

              // Treasure card
              const deckKey = `treasure${chestType}` as keyof typeof gameState.decks;
              if (gameState.decks[deckKey] && (gameState.decks[deckKey] as any[]).length > 0) {
                const treasureCard = (gameState.decks[deckKey] as any[]).pop()!;
                const seatId = gameState.seats?.[playerIndex];
    if (!seatId) return;
    const player = gameState.players[seatId];
                if (player) {
                  player.hand.push(treasureCard);
                  addLog(`玩家${playerIndex + 1}在回合结束开启了${chestType}级宝箱，获得了${goldReward}金币和一张宝藏卡`, playerIndex);
                }
              } else {
                addLog(`玩家${playerIndex + 1}在回合结束开启了${chestType}级宝箱，获得了${goldReward}金币`, playerIndex);
              }

              // Deplete chest
              gameState.counters.push({ id: generateId(), type: 'time', x: token.x, y: token.y, value: 0 });
              stateChanged = true;
            }
          }
        }
      }
    });

    // Time counters
    const countersToRemove: string[] = [];
    gameState.counters.forEach(counter => {
      if (counter.type === 'time') {
        counter.value += 1;
        if (counter.value >= 4) {
          countersToRemove.push(counter.id);
        }
        stateChanged = true;
      }
    });
    
    if (countersToRemove.length > 0) {
      gameState.counters = gameState.counters.filter(c => !countersToRemove.includes(c.id));
    }

    return stateChanged;
  };

  const createActionTokensForPlayer = (playerId: string) => {
    const playerIndex = getPlayerIndex(playerId);
    const isPlayer1 = playerIndex === 0;
    const playerHeroes = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (!isPlayer1 && c.y < 0)));
    
    const baseY = isPlayer1 ? 350 : -450;
    
    // Add universal token
    if (!gameState.actionTokens.some(t => t.playerIndex === playerIndex && t.heroCardId === null)) {
      gameState.actionTokens.push({
        id: generateId(),
        playerIndex,
        heroCardId: null,
        used: false,
        x: -300,
        y: baseY
      });
    }

    // Add hero tokens
    playerHeroes.forEach((hero, index) => {
      if (!gameState.actionTokens.some(t => t.heroCardId === hero.id)) {
        gameState.actionTokens.push({
          id: generateId(),
          playerIndex,
          heroCardId: hero.id,
          heroClass: hero.heroClass,
          used: false,
          x: -200 + (index * 80),
          y: baseY
        });
      }
    });
  };

  function checkAllTokensUsed() {
    const allUsed = gameState.actionTokens.every(t => t.used);
    if (allUsed) {
      startSupplyPhase();
    } else {
      broadcastState();
      checkBotTurn();
    }
  }

  const drawCards = (playerSocketId: string, count: number) => {
    const player = gameState.players[playerSocketId];
    if (!player) return;
    for (let i = 0; i < count; i++) {
      if (gameState.decks.action.length > 0) {
        player.hand.push(gameState.decks.action.pop()!);
      } else if (gameState.discardPiles.action.length > 0) {
        gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
        gameState.discardPiles.action = [];
        if (gameState.decks.action.length > 0) {
          player.hand.push(gameState.decks.action.pop()!);
        }
      }
    }
  };

  function startSupplyPhase() {
    setPhase('supply');
    addLog(`进入补给阶段`, -1);
    
    if (gameState.seats?.[0]) drawCards(gameState.seats[0], 2);
    if (gameState.seats?.[1]) drawCards(gameState.seats[1], 2);

    // Check for discard phase
    const p1HandSize = (gameState.seats?.[0] && gameState.players[gameState.seats[0]]) ? gameState.players[gameState.seats[0]].hand.length : 0;
    const p2HandSize = (gameState.seats?.[1] && gameState.players[gameState.seats[1]]) ? gameState.players[gameState.seats[1]].hand.length : 0;

    if (p1HandSize > 5 || p2HandSize > 5) {
      gameState.phase = 'discard';
      addLog(`进入弃牌阶段`, -1);
    } else {
      startShopPhase();
    }
    broadcastState();
    checkBotTurn();
  }

  function startShopPhase() {
    setPhase('shop');
    gameState.shopPasses = 0;
    gameState.activePlayerIndex = gameState.firstPlayerIndex;
    addLog(`进入商店阶段`, -1);
  }

  let migratedHandlers: any;

  const actionHelpers: ActionHelpers = {
    addLog,
    broadcastState,
    checkBotTurn,
    setPhase,
    checkAndResetChanting: (tokenId) => migratedHandlers.checkAndResetChanting(tokenId),
    addReputation,
    checkAllTokensUsed: () => checkAllTokensUsed(),
    updateAvailableActions: (playerIndex) => updateAvailableActions(playerIndex),
    discardOpponentCard: (playerIndex) => {
      const opponentId = gameState.seats?.[1 - playerIndex];
      if (opponentId) {
        const opponent = gameState.players[opponentId];
        if (opponent && opponent.hand.length > 0) {
          const randomIndex = Math.floor(Math.random() * opponent.hand.length);
          const discarded = opponent.hand.splice(randomIndex, 1)[0];
          gameState.discardPiles.action.push(discarded);
        }
      }
    },
  };

  migratedHandlers = createHandlers({
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
    discardOpponentCard: (pIdx: number) => {
      const opponentId = gameState.seats?.[1 - pIdx];
      if (opponentId) {
        const opponent = gameState.players[opponentId];
        if (opponent.hand.length > 0) {
          const randomIndex = Math.floor(Math.random() * opponent.hand.length);
          const discarded = opponent.hand.splice(randomIndex, 1)[0];
          gameState.discardPiles.action.push(discarded);
        }
      }
    },
    generateId,
    getHeroTokenImage,
    getHeroCardImage,
    getHeroBackImage,
    createInitialState
  });
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    const playerCount = Object.keys(gameState.players).length;

    gameState.players[socket.id] = {
      id: socket.id,
      name: `Player ${playerCount + 1}`,
      hand: [],
      discardFinished: false
    };
    gameState.heroPlayed[socket.id] = false;
    gameState.heroPlayedCount[socket.id] = 0;

    socket.emit('init', gameState);
    socket.broadcast.emit('state_update', gameState);

    socket.on('start_game', () => migratedHandlers.start_game(socket));
    socket.on('add_bot', (payload) => migratedHandlers.add_bot(socket, payload));
    socket.on('sit_down', (payload) => migratedHandlers.sit_down(socket, payload));
    socket.on('leave_seat', () => migratedHandlers.leave_seat(socket));
    socket.on('remove_bot', (payload) => migratedHandlers.remove_bot(socket, payload));
    socket.on('update_image_config', (config: ImageConfig) => migratedHandlers.update_image_config(socket));
    socket.on('update_map', (mapConfig: MapConfig) => migratedHandlers.update_map(socket, mapConfig));
    socket.on('disconnect', () => migratedHandlers.disconnect(socket));

    socket.on('move_item', ({ type, id, x, y }) => migratedHandlers.move_item(socket, { type, id, x, y }));

    socket.on('draw_card', (deckType: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero' | 'discard_action') => migratedHandlers.draw_card(socket, deckType));

    socket.on('draw_card_to_table', (deckType: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero' | 'discard_action', x: number, y: number) => {
      migratedHandlers.draw_card_to_table(socket, deckType, x, y);
    });

    socket.on('shuffle_deck', (deckType: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero' | 'discard_action') => migratedHandlers.shuffle_deck(socket, deckType));

    socket.on('take_card_to_hand', (cardId) => migratedHandlers.take_card_to_hand(socket, cardId));

    socket.on('play_card', ({ cardId, x, y, targetCastleIndex }) => migratedHandlers.play_card(socket, { cardId, x, y, targetCastleIndex }));

    socket.on('undo_play', () => migratedHandlers.undo_play(socket));

    socket.on('click_action_token', (tokenId: string) => migratedHandlers.click_action_token(socket, tokenId));
    socket.on('cancel_action_token', () => migratedHandlers.cancel_action_token(socket));
    socket.on('cancel_play_card', () => migratedHandlers.cancel_play_card(socket));

    socket.on('select_action_category', (category: any) => migratedHandlers.select_action_category(socket, category));

    socket.on('select_common_action', (action: any) => migratedHandlers.select_common_action(socket, action));

    socket.on('select_hero_for_action', (heroTokenId: string) => migratedHandlers.select_hero_for_action(socket, heroTokenId));

    socket.on('select_hero_action', (actionType: any) => migratedHandlers.select_hero_action(socket, actionType));

    socket.on('play_enhancement_card', (cardId: string) => migratedHandlers.play_enhancement_card(socket, cardId));

    socket.on('pass_enhancement', () => migratedHandlers.pass_enhancement(socket));

    socket.on('finish_action', () => migratedHandlers.finish_action(socket));

    socket.on('start_buy', () => migratedHandlers.start_buy(socket));
    socket.on('start_hire', () => migratedHandlers.start_hire(socket));
    socket.on('select_hire_cost', (cost: number) => migratedHandlers.select_hire_cost(socket, cost));
    socket.on('select_hire_castle', (castle: number) => migratedHandlers.select_hire_castle(socket, castle));
    socket.on('cancel_hire_selection', () => migratedHandlers.cancel_hire_selection(socket));

    socket.on('pass_shop', () => migratedHandlers.pass_shop(socket));

    socket.on('end_resolve_attack_counter', () => migratedHandlers.end_resolve_attack_counter(socket));

    socket.on('end_resolve_counter', () => migratedHandlers.end_resolve_attack_counter(socket));

    socket.on('select_option', (option: string) => migratedHandlers.select_option(socket, option));

    socket.on('select_token', (tokenId: string) => migratedHandlers.select_token(socket, tokenId));

    socket.on('select_target', (targetId: string) => migratedHandlers.select_target(socket, targetId));

    socket.on('move_token_to_cell', ({ q, r }) => migratedHandlers.move_token_to_cell(socket, { q, r }));

    socket.on('steal_first_player', () => migratedHandlers.steal_first_player(socket));

    socket.on('pass_action', () => migratedHandlers.pass_action(socket));

    socket.on('clear_notification', () => migratedHandlers.clear_notification(socket));

    socket.on('declare_defend', () => migratedHandlers.declare_defend(socket));

    socket.on('declare_counter', () => migratedHandlers.declare_counter(socket));

    socket.on('cancel_defend_or_counter', () => migratedHandlers.cancel_defend_or_counter(socket));

    socket.on('pass_defend', () => migratedHandlers.pass_defend(socket));

    socket.on('end_resolve_attack', () => migratedHandlers.end_resolve_attack(socket));

    socket.on('next_shop', () => migratedHandlers.next_shop(socket));

    socket.on('proceed_phase', () => migratedHandlers.proceed_phase(socket));

    socket.on('hire_hero', ({ cardId, goldAmount, targetCastleIndex }) => migratedHandlers.hire_hero(socket, { cardId, goldAmount, targetCastleIndex }));
    socket.on('revive_hero', ({ heroCardId, targetCastleIndex }) => migratedHandlers.revive_hero(socket, { heroCardId, targetCastleIndex }));

    socket.on('evolve_hero', (cardId) => migratedHandlers.evolve_hero(socket, cardId));

    socket.on('discard_card', (cardId) => migratedHandlers.discard_card(socket, cardId));

    socket.on('undo_discard', () => migratedHandlers.undo_discard(socket));

    socket.on('finish_discard', () => migratedHandlers.finish_discard(socket));

    socket.on('flip_card', (cardId) => migratedHandlers.flip_card(socket, cardId));

    socket.on('add_counter', ({ type, x, y, value }) => migratedHandlers.add_counter(socket, { type, x, y, value }));

    socket.on('update_counter', ({ id, delta }) => migratedHandlers.update_counter(socket, { id, delta }));

    socket.on('update_token_value', ({ id, field, delta }) => migratedHandlers.update_token_value(socket, { id, field, delta }));

    socket.on('spawn_hero', ({ heroClass, level, x, y }) => migratedHandlers.spawn_hero(socket, { heroClass, level, x, y }));
    
    socket.on('reset_game', () => migratedHandlers.reset_game(socket));
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  // API routes
  app.get('/api/state', (req, res) => {
    res.json(gameState);
  });

  app.get('/api/reset', (req, res) => {
    const newState = createInitialState();
    Object.assign(gameState, newState);
    io.emit('state_update', gameState);
    res.send('Game has been reset. <a href="/">Back to game</a>');
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Global Error Handler:', err);
    res.status(500).send('Something went wrong. <a href="/api/reset">Reset Game</a>');
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
