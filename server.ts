import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import type { GameState, Card, TableCard, Token, Counter, Player, ImageConfig, MapConfig, GamePhase } from './src/shared/types/index.ts';
import { REWARDS } from './src/shared/hex/tileLogic.ts';

import { HEROES_DATABASE } from './src/shared/config/heroes.ts';
import { Hex, hexRound, hexToPixel, pixelToHex, getHexDistance, HEX_DIRECTIONS } from './src/shared/utils/hexUtils.ts';
import { isTargetInAttackRange, getNeighbors, getRecoilHex, getPathDist, isHexInEnemyAttackRange, getReachableHexes, resolveTileEffect, getAttackableHexes } from './src/logic/map/mapLogic.ts';
import { getHeroStat, canHeroEvolve, getRespawnTime, getHeroCurrentHP } from './src/logic/hero/heroLogic.ts';
import { calculateDamage, isHeroDead, getCombatRewards } from './src/logic/combat/combatLogic.ts';
import { PhaseManager } from './src/logic/phase/phaseLogic.ts';
import { CardLogic } from './src/logic/card/cardLogic.ts';
import { HeroEngine } from './src/logic/hero/heroEngine.ts';
import { BotStrategy, BotAction } from './src/logic/ai/botStrategy.ts';
import { ActionEngine, ActionHelpers } from './src/logic/action/actionEngine.ts';
import { createHandlers } from './socketHandlers.ts';

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
const getHeroTokenImage = (heroClass: string) => {
  return `${BASE_URL}token_${encodeURIComponent(heroClass)}.png`;
};

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
  if (gameState.seats[0] === socketId) return 0;
  if (gameState.seats[1] === socketId) return 1;
  return -1;
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

const DEFAULT_MAP: MapConfig = {
  name: 'Default Map',
  crystal: { q: 0, r: 0 },
  castles: {
    0: [{ q: 0, r: 4 }, { q: 4, r: 0 }],
    1: [{ q: 0, r: -4 }, { q: -4, r: 0 }]
  },
  chests: [
    { q: -1, r: 3, type: 'T1' }, { q: 1, r: -3, type: 'T1' },
    { q: 1, r: 1, type: 'T2' }, { q: -1, r: -1, type: 'T2' }
  ],
  monsters: [
    { q: -2, r: 4, level: 1 }, { q: 2, r: 2, level: 1 }, { q: -2, r: -2, level: 1 }, { q: 2, r: -4, level: 1 },
    { q: -3, r: 1, level: 2 }, { q: -1, r: 1, level: 2 }, { q: 3, r: -1, level: 2 }, { q: 1, r: -1, level: 2 },
    { q: -3, r: 3, level: 3 }, { q: 3, r: -3, level: 3 }
  ],
  magicCircles: [
    { q: -2, r: 1 }, { q: 2, r: -1 }
  ],
  traps: [],
  turrets: [],
  watchtowers: [],
  obstacles: [],
  water: [],
  bushes: []
};

const createInitialState = (mapConfig: MapConfig = DEFAULT_MAP): GameState => {
  const state: GameState = {
    map: mapConfig,
    gameStarted: false,
    seats: [null, null, null, null],
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

    // Check hire condition
    const goldCounter = gameState.counters.find(c => c.type === 'gold' && (isPlayer1 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
    const totalHeroes = playerHeroes.length;
    
    // Check if any castle is free
    const playerCastles = gameState.map!.castles[playerIndex as 0 | 1];
    const anyCastleFree = playerCastles.some(cPos => {
      const pos = hexToPixel(cPos.q, cPos.r);
      return !gameState.tokens.some(t => Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
    });
    
    gameState.canHire = (goldCounter && goldCounter.value >= 2 && gameState.hireAreaCards.length > 0 && totalHeroes < 4 && anyCastleFree);

    // Check chest condition
    const playerTokens = gameState.tokens.filter(t => {
      const c = gameState.tableCards.find(tc => tc.id === t.boundToCardId);
      return c && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0));
    });
    const onChest = playerTokens.some(t => {
      const hex = pixelToHex(t.x, t.y);
      return gameState.map!.chests.some(ch => ch.q === hex.q && ch.r === hex.r);
    });
    (gameState as any).canOpenChest = onChest;
  };

  const checkBotTurn = () => {
    if (!gameState.gameStarted) return;

    const phase = gameState.phase;
    console.log(`checkBotTurn: phase=${phase}, activePlayerIndex=${gameState.activePlayerIndex}`);
    
    if (phase === 'discard') {
      gameState.seats.filter(id => id !== null).forEach(id => {
        const player = gameState.players[id!];
        if (player?.isBot && !player.discardFinished && player.hand) {
          const botSocket = { id: id!, emit: () => {}, broadcast: { emit: () => {} } };
          let action = BotStrategy.decideNextAction(gameState, gameState.seats.indexOf(id!), HEROES_DATABASE);
          while (action.type === 'discard_card') {
            handlers.discard_card(botSocket, action.payload.cardId);
            action = BotStrategy.decideNextAction(gameState, gameState.seats.indexOf(id!), HEROES_DATABASE);
          }
          if (action.type === 'finish_discard') {
            handlers.finish_discard(botSocket);
          }
        }
      });
      return;
    }

    const activePlayerId = gameState.seats[gameState.activePlayerIndex];
    if (activePlayerId && gameState.players[activePlayerId]?.isBot) {
      const botPlayer = gameState.players[activePlayerId];
      if (!botPlayer || !botPlayer.hand) return;
      
      setTimeout(() => {
        if (!gameState.gameStarted) return;
        const currentActiveId = gameState.seats[gameState.activePlayerIndex];
        if (currentActiveId !== activePlayerId) return;
        if (!botPlayer || !botPlayer.hand) return;

        console.log(`[BotTurn] Phase: ${gameState.phase}, Player: ${gameState.activePlayerIndex === 0 ? 'P1' : 'P2'}, Hand: ${botPlayer.hand.length}`);

        const botSocket = { id: activePlayerId, emit: () => {}, broadcast: { emit: () => {} } };
        const action = BotStrategy.decideNextAction(gameState, gameState.activePlayerIndex, HEROES_DATABASE);

        console.log(`[BotTurn] Action: ${action.type}`, action);

        switch (action.type) {
          case 'play_card':
            migratedHandlers.play_card(botSocket, action.payload);
            break;
          case 'revive_hero':
            handlers.revive_hero(botSocket, action.payload);
            break;
          case 'hire_hero':
            handlers.hire_hero(botSocket, action.payload);
            break;
          case 'move_token_to_cell':
            handlers.move_token_to_cell(botSocket, action.payload);
            break;
          case 'click_action_token':
            if (gameState.phase === 'action_select_hero' || gameState.phase === 'action_select_substitute') {
              handlers.select_hero_for_action(botSocket, action.payload.tokenId);
            } else {
              handlers.click_action_token(botSocket, action.payload.tokenId);
            }
            break;
          case 'select_option':
            if (gameState.phase === 'action_select_category' || gameState.phase === 'action_options') {
              handlers.select_action_category(botSocket, action.payload.option as any);
            } else if (gameState.phase === 'action_common') {
              handlers.select_common_action(botSocket, action.payload.option as any);
            } else if (gameState.phase === 'action_select_action') {
              handlers.select_hero_action(botSocket, action.payload.option as any);
            } else {
              handlers.select_option(botSocket, action.payload.option);
            }
            break;
          case 'select_target':
            handlers.select_target(botSocket, action.payload.targetId);
            break;
          case 'pass_action':
            if (gameState.phase === 'action_play_enhancement') {
              handlers.pass_enhancement(botSocket);
            } else {
              handlers.pass_action(botSocket);
            }
            break;
          case 'finish_resolve':
            handlers.finish_resolve(botSocket);
            break;
          case 'none':
            if (gameState.phase === 'action_play') {
              handlers.pass_action(botSocket);
            } else if (gameState.phase === 'shop') {
              handlers.pass_shop(botSocket);
            } else if (gameState.phase === 'supply' || gameState.phase === 'end') {
              handlers.proceed_phase(botSocket);
            }
            break;
        }
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
          const chest = gameState.map!.chests.find(ch => ch.q === hex.q && ch.r === hex.r);
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
                const player = gameState.players[gameState.seats[playerIndex]!];
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
    const isPlayer1 = gameState.seats[0] === playerId;
    const playerIndex = isPlayer1 ? 0 : 1;
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
    
    if (gameState.seats[0]) drawCards(gameState.seats[0], 2);
    if (gameState.seats[1]) drawCards(gameState.seats[1], 2);

    // Check for discard phase
    const p1HandSize = gameState.seats[0] ? gameState.players[gameState.seats[0]]?.hand.length : 0;
    const p2HandSize = gameState.seats[1] ? gameState.players[gameState.seats[1]]?.hand.length : 0;

    if (p1HandSize > 5 || p2HandSize > 5) {
      gameState.phase = 'discard';
      addLog(`进入弃牌阶段`, -1);
    } else {
      startShopPhase();
    }
    broadcastState();
  }

  function startShopPhase() {
    setPhase('shop');
    gameState.shopPasses = 0;
    gameState.activePlayerIndex = gameState.firstPlayerIndex;
    addLog(`进入商店阶段`, -1);
  }

  function startEndPhase() {
    setPhase('end');
    addLog(`进入回合结束阶段`, -1);
    
    // 1. Time counters +1
    gameState.counters.forEach(c => {
      if (c.type === 'time') {
        c.value += 1;
      }
    });

    // 2. Reset action tokens
    gameState.actionTokens.forEach(t => t.used = false);

    // 3. Check respawn (time=1) and refresh (time=3)
    const countersToRemove: string[] = [];
    gameState.counters.forEach(counter => {
      if (counter.type === 'time') {
        if (counter.value === 1 && counter.boundToCardId) {
          // Respawn logic
          const heroCard = gameState.tableCards.find(c => c.id === counter.boundToCardId);
          if (heroCard) {
            const playerIndex = heroCard.y > 0 ? 0 : 1;
            const castles = gameState.map!.castles[playerIndex as 0 | 1];
            const freeCastle = castles.find(hex => !gameState.tokens.some(t => {
              const tHex = pixelToHex(t.x, t.y);
              return tHex.q === hex.q && tHex.r === hex.r;
            }));
            
            if (freeCastle) {
              const pos = hexToPixel(freeCastle.q, freeCastle.r);
              const token = gameState.tokens.find(t => t.boundToCardId === heroCard.id);
              if (token) {
                token.x = pos.x;
                token.y = pos.y;
                countersToRemove.push(counter.id);
                addLog(`${heroCard.heroClass} 在王城复活了`, playerIndex);
              }
            }
          }
        } else if (counter.value >= 3) {
          // Refresh logic
          countersToRemove.push(counter.id);
          // Add logic to refresh monster/chest if needed
        }
      }
    });

    gameState.counters = gameState.counters.filter(c => !countersToRemove.includes(c.id));

    gameState.round += 1;
    gameState.phase = 'action_play';
    gameState.activePlayerIndex = gameState.firstPlayerIndex;
    gameState.consecutivePasses = 0;
    gameState.hasSeizedInitiative = false;
    
    broadcastState();
  }

  const actionHelpers: ActionHelpers = {
    addLog,
    broadcastState,
    checkBotTurn,
    setPhase,
    checkAndResetChanting: (tokenId) => handlers.checkAndResetChanting(tokenId),
    addReputation,
    finish_resolve: (socket) => handlers.finish_resolve(socket),
    end_resolve_attack: (socket) => handlers.end_resolve_attack(socket),
    checkAllTokensUsed: () => checkAllTokensUsed(),
    updateAvailableActions: (playerIndex) => updateAvailableActions(playerIndex),
  };

  const migratedHandlers = createHandlers({
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
      const opponentId = gameState.seats[1 - pIdx];
      if (opponentId) {
        const opponent = gameState.players[opponentId];
        if (opponent.hand.length > 0) {
          const randomIndex = Math.floor(Math.random() * opponent.hand.length);
          const discarded = opponent.hand.splice(randomIndex, 1)[0];
          gameState.discardPiles.action.push(discarded);
        }
      }
    }
  });
  const handlers = {
    checkAndResetChanting: (tokenId: string) => {
      const magicCircle = gameState.magicCircles.find(mc => mc.state === 'chanting' && mc.chantingTokenId === tokenId);
      if (magicCircle) {
        const token = gameState.tokens.find(t => t.id === tokenId);
        const card = token ? gameState.tableCards.find(c => c.id === token.boundToCardId) : null;
        const ownerIndex = card ? (card.y > 0 ? 0 : 1) : -1;

        magicCircle.state = 'idle';
        magicCircle.chantingTokenId = undefined;
        if (ownerIndex !== -1) {
          addLog(`玩家${ownerIndex + 1}的英雄中断了咏唱 (Player ${ownerIndex + 1}'s hero interrupted chanting)`, ownerIndex);
        }
      }
    },
    revive_hero: (socket: any, { heroCardId, targetCastleIndex }: { heroCardId: string, targetCastleIndex: number }) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
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
    select_hire_cost: (socket: any, cost: number) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (playerIndex === gameState.activePlayerIndex) {
        gameState.selectedHireCost = cost;
        io.emit('state_update', gameState);
      }
    },
    select_token: (socket: any, tokenId: string) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_select_option' && playerIndex === gameState.activePlayerIndex) {
        const isAction = ['move', 'sprint', 'attack', 'chant', 'fire'].includes(gameState.selectedOption || '');
        
        const token = gameState.tokens.find(t => t.id === tokenId);
        if (token && token.boundToCardId) {
          const isAlive = !gameState.counters.some(counter => counter.type === 'time' && counter.boundToCardId === token.boundToCardId);
          if (!isAlive) {
            socket.emit('error_message', '该英雄正在复活中，无法行动。');
            return;
          }
          const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
          if (card && ((isPlayer1 && card.y > 0) || (isPlayer2 && card.y < 0))) {
            
            if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
              if (!gameState.globalMovementMovedTokens) gameState.globalMovementMovedTokens = [];
              
              if (gameState.globalMovementMovedTokens.includes(tokenId)) {
                socket.emit('error_message', '该英雄在本次全军行军中已经移动过。 (This hero has already moved in this global movement.)');
                return;
              }

              // If selecting a new token, finalize the previous one
              if (gameState.selectedTokenId && gameState.selectedTokenId !== tokenId) {
                const prevToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
                const prevCard = prevToken ? gameState.tableCards.find(c => c.id === prevToken.boundToCardId) : null;
                const prevHeroData = prevCard ? heroesDatabase?.heroes?.find((h: any) => h.name === prevCard.heroClass) : null;
                const prevLevelData = prevHeroData ? prevHeroData.levels?.[prevCard.level || 1] : null;
                const prevMv = prevLevelData?.mv || 1;
                const sprintMv = prevMv + 1;
                
                const currentMaxMv = gameState.selectedOption === 'sprint' ? sprintMv : prevMv;

                if (gameState.remainingMv !== undefined && gameState.remainingMv < currentMaxMv) {
                  gameState.globalMovementMovedTokens.push(gameState.selectedTokenId);
                }
              }

              const oldSelectedTokenId = gameState.selectedTokenId;
              gameState.selectedTokenId = tokenId;
              if (!gameState.movedTokens) gameState.movedTokens = {};
              if (!gameState.movedTokens[tokenId]) {
                gameState.movedTokens[tokenId] = { x: token.x, y: token.y };
              }
              const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
              const levelData = heroData?.levels?.[card.level || 1];
              let mv = levelData?.mv || 1;
              if (gameState.selectedOption === 'sprint') mv += 1;
              
              // Only reset remainingMv if it's a new selection, otherwise keep current remainingMv
              if (!gameState.globalMovementMovedTokens.includes(tokenId) && oldSelectedTokenId !== tokenId) {
                  // Check if this token has movement history
                  const hasHistory = gameState.movementHistory && gameState.movementHistory.some(step => step.tokenId === tokenId);
                  if (hasHistory) {
                    const totalMvCost = gameState.movementHistory!.filter(step => step.tokenId === tokenId).reduce((sum, step) => sum + step.mvCost, 0);
                    gameState.remainingMv = mv - totalMvCost;
                  } else {
                    // Check action limit for movement
                    const maxHP = levelData?.hp || 3;
                    const currentHP = maxHP - (card.damage || 0);
                    const currentCount = gameState.roundActionCounts[tokenId] || 0;
                    if (currentCount >= currentHP) {
                      socket.emit('error_message', `该英雄本回合行动次数已达上限（当前血量：${currentHP}）。 (Action limit reached for this hero this round based on current HP.)`);
                      gameState.selectedTokenId = oldSelectedTokenId;
                      return;
                    }

                    gameState.remainingMv = mv;
                  }
              } else if (gameState.remainingMv === undefined) {
                  gameState.remainingMv = mv;
              }
              
              const hex = pixelToHex(token.x, token.y);
              gameState.reachableCells = getReachableHexes(hex, gameState.remainingMv, playerIndex, gameState);
              broadcastState();
            } else if (gameState.selectedOption === 'chant') {
              const hex = pixelToHex(token.x, token.y);
              const magicCircle = gameState.magicCircles.find(mc => mc.q === hex.q && mc.r === hex.r);
              if (!magicCircle) {
                socket.emit('error_message', '英雄必须在魔法阵上才能咏唱。 (Hero must be on a magic circle to chant.)');
                return;
              }
              if (magicCircle.state === 'chanting') {
                socket.emit('error_message', '该魔法阵已经在咏唱中。 (This magic circle is already chanting.)');
                return;
              }

              // Action Limit Check
              const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
              const levelData = heroData?.levels?.[card.level || 1];
              const maxHP = levelData?.hp || 3;
              const currentHP = maxHP - (card.damage || 0);
              const currentCount = gameState.roundActionCounts[tokenId] || 0;
              if (currentCount >= currentHP) {
                socket.emit('error_message', `该英雄本回合行动次数已达上限（当前血量：${currentHP}）。 (Action limit reached for this hero this round based on current HP.)`);
                return;
              }

              // Apply chant
              magicCircle.state = 'chanting';
              magicCircle.chantingTokenId = tokenId;
              gameState.roundActionCounts[tokenId] = currentCount + 1;
              
              addLog(`玩家${playerIndex + 1}的${card.heroClass}开始咏唱`, playerIndex);
              
              // Finish action
              gameState.phase = 'action_play';
              gameState.selectedOption = null;
              gameState.selectedTargetId = null;
              gameState.selectedTokenId = null;
              gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
              broadcastState();
              checkBotTurn();
              return;

            } else if (gameState.selectedOption === 'fire') {
              const hex = pixelToHex(token.x, token.y);
              const magicCircle = gameState.magicCircles.find(mc => mc.q === hex.q && mc.r === hex.r);
              if (!magicCircle) {
                socket.emit('error_message', '英雄必须在魔法阵上才能开火。 (Hero must be on a magic circle to fire.)');
                return;
              }
              if (magicCircle.state !== 'chanting' || magicCircle.chantingTokenId !== tokenId) {
                socket.emit('error_message', '该英雄没有在该魔法阵上咏唱。 (This hero is not chanting on this magic circle.)');
                return;
              }

              // Action Limit Check
              const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
              const levelData = heroData?.levels?.[card.level || 1];
              const maxHP = levelData?.hp || 3;
              const currentHP = maxHP - (card.damage || 0);
              const currentCount = gameState.roundActionCounts[tokenId] || 0;
              if (currentCount >= currentHP) {
                socket.emit('error_message', `该英雄本回合行动次数已达上限（当前血量：${currentHP}）。 (Action limit reached for this hero this round based on current HP.)`);
                return;
              }

              // Apply fire
              const enemyPlayerIndex = 1 - playerIndex;
              gameState.castleHP[enemyPlayerIndex] -= 1;
              
              // Reputation scoring for damaging castle via fire
              addReputation(playerIndex, REWARDS.CASTLE_ATTACK.REP, "王城伤害");
              
              magicCircle.state = 'idle';
              magicCircle.chantingTokenId = undefined;
              gameState.roundActionCounts[tokenId] = currentCount + 1;

              addLog(`玩家${playerIndex + 1}的${card.heroClass}开火，对敌方王城造成1点伤害！`, playerIndex);
              
              // Recoil Mechanism
              const enemyCastleQ = 0;
              const enemyCastleR = enemyPlayerIndex === 0 ? 4 : -4; // Enemy castle position
              const currentHex = pixelToHex(token.x, token.y);
              const recoilHex = getRecoilHex(currentHex, { q: enemyCastleQ, r: enemyCastleR }, gameState);
              
              if (recoilHex.q !== currentHex.q || recoilHex.r !== currentHex.r) {
                const recoilPixel = hexToPixel(recoilHex.q, recoilHex.r);
                token.x = recoilPixel.x;
                token.y = recoilPixel.y;
                addLog(`${card.heroClass} 受到后坐力影响，后退至 (${recoilHex.q}, ${recoilHex.r})`, playerIndex);
              }

              if (gameState.castleHP[enemyPlayerIndex] <= 0) {
                gameState.notification = `游戏结束！玩家 ${playerIndex + 1} 摧毁了敌方王城，获得胜利！`;
                gameState.gameStarted = false;
              } else {
                gameState.notification = `王城受到攻击！玩家 ${enemyPlayerIndex + 1} 的王城 HP 剩余 ${gameState.castleHP[enemyPlayerIndex]}。`;
              }

              // Finish action
              gameState.phase = 'action_play';
              gameState.selectedOption = null;
              gameState.selectedTargetId = null;
              gameState.selectedTokenId = null;
              gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
              broadcastState();
              checkBotTurn();
              return;

            } else if (gameState.selectedOption === 'turret_attack') {
              const hex = pixelToHex(token.x, token.y);
              const turret = gameState.map?.turrets?.find(tu => tu.q === hex.q && tu.r === hex.r);
              if (!turret) {
                socket.emit('error_message', '英雄必须在炮台上才能发动炮台攻击。 (Hero must be on a turret to use turret attack.)');
                return;
              }
              
              // Find attackable targets in straight lines
              const directions = [
                { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
                { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
              ];
              
              const attackable: {q: number, r: number}[] = [];
              
              directions.forEach(dir => {
                let currentQ = hex.q + dir.q;
                let currentR = hex.r + dir.r;
                
                while (Math.abs(currentQ) <= 4 && Math.abs(currentR) <= 4 && Math.abs(currentQ + currentR) <= 4) {
                  // Check if there's a target here
                  const targetPos = hexToPixel(currentQ, currentR);
                  const hasEnemyToken = gameState.tokens.some(t => {
                    const c = gameState.tableCards.find(tc => tc.id === t.boundToCardId);
                    const isEnemy = c && ((playerIndex === 0 && c.y < 0) || (playerIndex === 1 && c.y > 0));
                    return isEnemy && Math.abs(t.x - targetPos.x) < 10 && Math.abs(t.y - targetPos.y) < 10;
                  });
                  
                  const hasMonster = gameState.map!.monsters.some(m => m.q === currentQ && m.r === currentR && !gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - targetPos.x) < 10 && Math.abs(c.y - targetPos.y) < 10));
                  
                  const hasEnemyCastle = gameState.map!.castles[1 - playerIndex as 0 | 1].some(c => c.q === currentQ && c.r === currentR);
                  
                  if (hasEnemyToken || hasMonster || hasEnemyCastle) {
                    attackable.push({ q: currentQ, r: currentR });
                    break; // Stop at the first target in this direction
                  }
                  
                  // Check for obstacles that block line of sight
                  const hasObstacle = gameState.map?.obstacles?.some(o => o.q === currentQ && o.r === currentR);
                  if (hasObstacle) {
                    break; // Line of sight blocked
                  }
                  
                  currentQ += dir.q;
                  currentR += dir.r;
                }
              });
              
              if (attackable.length === 0) {
                socket.emit('error_message', '直线上没有可以攻击的对象。 (No targets in straight lines.)');
                return;
              }

              // Action Limit Check
              if (isAction) {
                const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
                const levelData = heroData?.levels?.[card.level || 1];
                const currentCount = gameState.roundActionCounts[tokenId] || 0;
                const maxHP = levelData?.hp || 3;
                const currentHP = maxHP - (card.damage || 0);
                
                if (gameState.selectedTokenId !== tokenId) {
                  if (currentCount >= currentHP) {
                    socket.emit('error_message', '该英雄本回合行动次数已达上限。 (This hero has reached its action limit for this round.)');
                    return;
                  }
                  
                  if (gameState.selectedTokenId) {
                    const prevTokenId = gameState.selectedTokenId;
                    if (gameState.roundActionCounts[prevTokenId] > 0) {
                      gameState.roundActionCounts[prevTokenId]--;
                    }
                  }
                  gameState.roundActionCounts[tokenId] = (gameState.roundActionCounts[tokenId] || 0) + 1;
                }
              }
              
              gameState.selectedTokenId = tokenId;
              gameState.reachableCells = attackable;
              broadcastState();
              
            } else if (gameState.selectedOption === 'attack') {
              const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
              const levelData = heroData?.levels?.[card.level || 1];
              const ar = levelData?.ar || 1;
              const hex = pixelToHex(token.x, token.y);
              const attackable = getAttackableHexes(hex.q, hex.r, ar, playerIndex, gameState, card.level);
              
              if (attackable.length === 0) {
                socket.emit('error_message', '攻击范围内没有可以攻击的对象。 (No targets in attack range.)');
                return;
              }

              // Action Limit Check
              if (isAction) {
                const currentCount = gameState.roundActionCounts[tokenId] || 0;
                const maxHP = levelData?.hp || 3;
                const currentHP = maxHP - (card.damage || 0);
                
                if (gameState.selectedTokenId !== tokenId) {
                  if (currentCount >= currentHP) {
                    socket.emit('error_message', `该英雄本回合行动次数已达上限（当前血量：${currentHP}）。 (Action limit reached for this hero this round based on current HP.)`);
                    return;
                  }
                  
                  if (gameState.selectedTokenId) {
                    const prevTokenId = gameState.selectedTokenId;
                    if (gameState.roundActionCounts[prevTokenId] > 0) {
                      gameState.roundActionCounts[prevTokenId]--;
                    }
                  }
                  gameState.roundActionCounts[tokenId] = (gameState.roundActionCounts[tokenId] || 0) + 1;
                }
              }

              gameState.selectedTokenId = tokenId;
              gameState.reachableCells = attackable;
              broadcastState();
            }
          }
        }
      }
    },
    move_token_to_cell: (socket: any, { q, r }) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      ActionEngine.moveTokenToCell(gameState, playerIndex, q, r, actionHelpers, socket);
    },
    select_option: (socket: any, option: string) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
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
          const playerCastles = gameState.map!.castles[playerIndex as 0 | 1];
          const anyCastleFree = playerCastles.some(cCoord => {
            const pos = hexToPixel(cCoord.q, cCoord.r);
            return !gameState.tokens.some(t => Math.abs(t.x - pos.x) < 10 && Math.abs(t.y - pos.y) < 10);
          });
          
          if (!anyCastleFree) {
            socket.emit('error_message', '所有王城均被占用，无法雇佣。 (All castles are occupied, cannot hire.)');
            return;
          }
          const goldCounter = gameState.counters.find(c => c.type === 'gold' && (isPlayer1 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
          if (!goldCounter || goldCounter.value < 2) {
            socket.emit('error_message', '金币不足，无法雇佣。 (Not enough gold to hire.)');
            return;
          }
        }

        if (option === 'fire') {
          const lastCard = gameState.playAreaCards[gameState.playAreaCards.length - 1] || 
                           gameState.tableCards.find(c => c.id === gameState.lastPlayedCardId);
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
            const token = gameState.actionTokens.find(t => t.id === gameState.activeActionTokenId);
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
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
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

    click_action_token: (socket: any, tokenId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.clickActionToken(gameState, playerIndex, tokenId, actionHelpers, socket);
    },

    cancel_action_token: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.cancelActionToken(gameState, playerIndex, actionHelpers, socket);
    },

    select_action_category: (socket: any, category: 'play_card' | 'direct_action' | 'common_action' | 'pass') => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectActionCategory(gameState, playerIndex, category, actionHelpers, socket);
    },

    select_common_action: (socket: any, action: 'open_chest' | 'early_buy' | 'seize_initiative' | 'recruit') => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectCommonAction(gameState, playerIndex, action, actionHelpers, socket);
    },

    select_hero_for_action: (socket: any, heroTokenId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectHeroForAction(gameState, playerIndex, heroTokenId, actionHelpers, socket);
    },

    select_hero_action: (socket: any, actionType: 'move' | 'attack' | 'skill' | 'evolve') => {
      const playerIndex = getPlayerIndex(socket.id);
      ActionEngine.selectHeroAction(gameState, playerIndex, actionType, actionHelpers, socket);
    },

    play_enhancement_card: (socket: any, cardId: string) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_play_enhancement') return;

      const player = gameState.players[socket.id];
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return;

      const card = player.hand[cardIndex];
      
      const enhancementNames = ['冲刺', '回复', '间谍', '替身', '远攻', '强击', '冲刺卷轴', '治疗药水', '远程战术'];
      if (!enhancementNames.includes(card.name || '')) {
        socket.emit('error_message', '只能打出增强卡');
        return;
      }

      player.hand.splice(cardIndex, 1);
      gameState.discardPiles.action.push(card);
      gameState.activeEnhancementCardId = card.id;

      if (card.name === '回复') {
        const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
        if (heroToken) {
          const targetCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
          if (targetCard && targetCard.damage && targetCard.damage > 0) {
            targetCard.damage -= 1;
            const damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === heroToken.boundToCardId);
            if (damageCounter) damageCounter.value = targetCard.damage;
            addLog(`玩家${playerIndex + 1}使用了回复，英雄恢复1点生命`, playerIndex);
          }
        }
      } else if (card.name === '间谍') {
        const opponentId = gameState.seats[1 - playerIndex];
        if (opponentId) {
          const opponent = gameState.players[opponentId];
          if (opponent.hand.length > 0) {
            const randomIndex = Math.floor(Math.random() * opponent.hand.length);
            const discarded = opponent.hand.splice(randomIndex, 1)[0];
            gameState.discardPiles.action.push(discarded);
            addLog(`玩家${playerIndex + 1}使用了间谍，弃掉了对方一张手牌`, playerIndex);
          }
        }
      }

      if (card.name === '替身') {
        gameState.phase = 'action_select_substitute';
        gameState.notification = "请选择另一个英雄替代行动";
        broadcastState();
      } else {
        handlers.resolve_action_start(socket);
      }
    },

    pass_enhancement: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'action_play_enhancement') return;

      handlers.resolve_action_start(socket);
    },

    resolve_action_start: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      const heroToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
      if (!heroToken) {
        handlers.finish_action(socket);
        return;
      }
      
      const heroCard = gameState.tableCards.find(c => c.id === heroToken.boundToCardId);
      const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard?.heroClass);
      const levelData = heroData?.levels?.[heroCard?.level || 1];

      const enhancementCard = gameState.activeEnhancementCardId 
        ? (gameState.playAreaCards.find(c => c.id === gameState.activeEnhancementCardId) || 
           gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId))
        : null;

      if (gameState.activeActionType === 'move') {
        let mv = levelData?.mv || 1;
        if (enhancementCard?.name === '冲刺' || enhancementCard?.name === '冲刺卷轴') mv += 1;
        
        const hex = pixelToHex(heroToken.x, heroToken.y);
        gameState.reachableCells = getReachableHexes(hex, mv, playerIndex, gameState);
        gameState.selectedTokenId = heroToken.id;
        gameState.remainingMv = mv;
        gameState.phase = 'action_resolve';
        gameState.notification = null;
      } else if (gameState.activeActionType === 'attack') {
        let ar = levelData?.ar || 1;
        if (enhancementCard?.name === '远攻' || enhancementCard?.name === '远程战术') ar += 1;
        
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
          const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === heroCard.id);
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
        handlers.finish_action(socket);
        return;
      }
      broadcastState();
    },

    finish_action: (socket: any) => {
      const token = gameState.actionTokens.find(t => t.id === gameState.activeActionTokenId);
      if (token) token.used = true;

      gameState.activeActionTokenId = null;
      gameState.activeActionType = null;
      gameState.activeEnhancementCardId = null;
      gameState.activeHeroTokenId = null;
      gameState.selectedTokenId = null;
      gameState.reachableCells = [];
      gameState.notification = null;
      gameState.selectedOption = null;

      if (gameState.playAreaCards.length > 0) {
        gameState.discardPiles.action.push(...gameState.playAreaCards);
        gameState.playAreaCards = [];
      }

      if (token) {
        const playerIndex = token.playerIndex;
        if (playerIndex !== -1) {
          gameState.activePlayerIndex = 1 - playerIndex;
        }
      } else {
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
      }
      
      gameState.phase = 'action_play';
      gameState.consecutivePasses = 0;
      checkAllTokensUsed();
    },

    pass_action: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_play' && playerIndex === gameState.activePlayerIndex) {
        const availableTokens = gameState.actionTokens.filter(t => t.playerIndex === playerIndex && !t.used);
        if (availableTokens.length > 0) {
          socket.emit('error_message', '请选择一个行动Token进行Pass (翻面)');
          return;
        }

        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        checkAllTokensUsed();
      }
    },
    pass_defend: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
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
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        const defenseCard = gameState.playAreaCards.find(c => c.name === '防御' || c.name === '闪避');
        const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
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
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        const defenseCard = gameState.playAreaCards.find(c => c.name === '防御');
        if (!defenseCard) {
          socket.emit('error_message', '请先打出一张【防御】卡才能反击。 (Please play a [Defense] card to counter.)');
          return;
        }

        const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
        addLog(`响应阶段: ${targetCard?.heroClass || '英雄'} 选择反击 (Declare Counter)`, playerIndex);

        const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
        const defenderCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
        const defenderToken = gameState.tokens.find(t => t.boundToCardId === gameState.selectedTargetId);
        
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
    end_resolve_attack: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_resolve_attack' && playerIndex === gameState.activePlayerIndex) {
        // Check if attack was blocked
        const hasDefense = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
        
        if (!hasDefense && gameState.selectedTargetId) {
          // Attack succeeds
          const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
          const attackerCard = attackerToken ? gameState.tableCards.find(c => c.id === attackerToken.boundToCardId) : null;
          const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
          const monster = gameState.map?.monsters?.find(m => `monster_${m.q}_${m.r}` === gameState.selectedTargetId);
          const isCastle = gameState.selectedTargetId.startsWith('castle_');

          if (monster) {
            const enhancementCard = gameState.activeEnhancementCardId 
              ? gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId) 
              : null;
            
            let damage = 1;
            if (enhancementCard?.name === '强击') damage += 1;

            addLog(`结算阶段: ${attackerCard?.heroClass || '英雄'} 击败了 怪物 LV${monster.level}`, playerIndex);
            gameState.notification = `攻击成功！击败了 怪物 LV${monster.level}。 (Attack successful! Defeated Monster LV${monster.level}.)`;

            // Reward attacker
            if (attackerToken && attackerToken.boundToCardId) {
              const reward = monster.level;
              const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === attackerToken.boundToCardId);
              if (expCounter) expCounter.value += reward;
              
              const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
              if (goldCounter) goldCounter.value += reward;
              
              addLog(`奖励阶段: 获得 ${reward} 经验和 ${reward} 金币`, playerIndex);
              gameState.notification += ` 获得 ${reward} 经验 and ${reward} 金币。`;
              
              // Reputation scoring
              addReputation(playerIndex, REWARDS.MONSTER_KILL.REP, "击杀怪物");
            }

            // Remove monster from map
            gameState.map!.monsters = gameState.map!.monsters.filter(m => `monster_${m.q}_${m.r}` !== gameState.selectedTargetId);
          } else if (isCastle) {
            const parts = gameState.selectedTargetId.split('_');
            const cq = parseInt(parts[1]);
            const cr = parseInt(parts[2]);
            const castleIdx = (cq === 0 && cr === -4) || (gameState.map?.castles[0]?.some(c => c.q === cq && c.r === cr)) ? 0 : 1;
            
            const enhancementCard = gameState.activeEnhancementCardId 
              ? gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId) 
              : null;
            
            let damage = 1;
            if (enhancementCard?.name === '强击') damage += 1;

            gameState.castleHP[castleIdx] = Math.max(0, gameState.castleHP[castleIdx] - damage);
            
            addLog(`结算阶段: ${attackerCard?.heroClass || '英雄'} 攻击了敌方城堡，造成 ${damage} 点伤害`, playerIndex);
            gameState.notification = `攻击成功！敌方城堡受到 ${damage} 点伤害。 (Attack successful! Enemy castle took ${damage} damage.)`;

            // Reward attacker
            if (attackerToken && attackerToken.boundToCardId) {
              const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === attackerToken.boundToCardId);
              if (expCounter) expCounter.value += REWARDS.CASTLE_ATTACK.EXP;
              
              addLog(`奖励阶段: 获得 ${REWARDS.CASTLE_ATTACK.EXP} 经验`, playerIndex);
              
              // Reputation scoring
              addReputation(playerIndex, REWARDS.CASTLE_ATTACK.REP, "攻击敌方城堡");
            }

            if (gameState.castleHP[castleIdx] <= 0) {
              addLog(`游戏结束: 玩家${playerIndex + 1} 摧毁了敌方城堡！`, playerIndex);
              gameState.phase = 'end';
              gameState.notification = `游戏结束！玩家${playerIndex + 1} 获胜！`;
            }
          } else if (targetCard) {
            const enhancementCard = gameState.activeEnhancementCardId 
              ? gameState.discardPiles.action.find(c => c.id === gameState.activeEnhancementCardId) 
              : null;
            
            const damage = calculateDamage(attackerCard!, targetCard, false, gameState, {
              isEnhanced: enhancementCard?.name === '强击'
            });
            
            targetCard.damage = (targetCard.damage || 0) + damage;

            // Interrupt chanting when attacked
            const targetToken = gameState.tokens.find(t => t.boundToCardId === targetCard.id);
            if (targetToken) handlers.checkAndResetChanting(targetToken.id);

            let damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === targetCard.id);
            if (!damageCounter) {
               damageCounter = { id: generateId(), type: 'damage', x: targetCard.x, y: targetCard.y, value: 0, boundToCardId: targetCard.id };
               gameState.counters.push(damageCounter);
            }
            damageCounter.value = targetCard.damage;
            
            if (attackerCard) {
              addLog(`发起阶段: ${attackerCard.heroClass} 对 ${targetCard.heroClass} 发起了攻击`, playerIndex);
            }
            addLog(`结算阶段: ${targetCard.heroClass} 受到 ${damage} 点伤害，当前受伤计数器为 ${targetCard.damage}`, playerIndex);
            
            gameState.notification = `攻击成功！${targetCard.heroClass} 受到了 ${damage} 点伤害。 (Attack successful! ${targetCard.heroClass} took ${damage} damage.)`;
            
            // Check hero death
            if (isHeroDead(targetCard, gameState)) {
              // Hero dies
              targetCard.damage = 0;
              if (damageCounter) damageCounter.value = 0;
              
              // Remove token from map, place on hero card
              const token = gameState.tokens.find(t => t.boundToCardId === targetCard.id);
              if (token) {
                token.x = targetCard.x;
                token.y = targetCard.y;
              }
              
              // Add time counter to hero card
              gameState.counters.push({ id: generateId(), type: 'time', x: targetCard.x, y: targetCard.y, value: 0, boundToCardId: targetCard.id });
              if (token) handlers.checkAndResetChanting(token.id);
              
              addLog(`阵亡阶段: ${targetCard.heroClass} 已阵亡`, playerIndex);
              gameState.notification += ` ${targetCard.heroClass} 阵亡！ (Hero died!)`;

              // Reward attacker
              if (attackerToken && attackerToken.boundToCardId) {
                const reward = targetCard.level || 1;
                const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === attackerToken.boundToCardId);
                if (expCounter) expCounter.value += reward;
                
                const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
                if (goldCounter) goldCounter.value += reward;
                
                addLog(`奖励阶段: ${attackerCard?.heroClass} 击败了 ${targetCard.heroClass}，获得 ${reward} 经验和 ${reward} 金币`, playerIndex);
                gameState.notification += ` 获得 ${reward} 经验和 ${reward} 金币。 (Gained ${reward} EXP and ${reward} Gold.)`;
                
                // Reputation scoring
                addReputation(playerIndex, REWARDS.HERO_KILL.REP, "击杀敌方英雄");
              }
            }
          }
        } else if (hasDefense) {
          const defenseCard = gameState.playAreaCards.find(c => c.name === '防御' || c.name === '闪避');
          const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
          if (targetCard && defenseCard) {
            addLog(`响应阶段: ${targetCard.heroClass} 打出了 ${defenseCard.name} 卡`, playerIndex);
          }
          gameState.notification = `攻击被防御！ (Attack was defended!)`;
        }
        
        // Clear play area cards (move to discard)
        gameState.playAreaCards.forEach(c => gameState.discardPiles.action.push(c));
        gameState.playAreaCards = [];
        
        if (gameState.activeActionTokenId) {
          handlers.finish_action(socket);
        } else {
          if (gameState.playAreaCards.length > 0) {
            gameState.discardPiles.action.push(...gameState.playAreaCards);
            gameState.playAreaCards = [];
          }
          gameState.phase = 'action_play';
          gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
          gameState.selectedTargetId = null;
          gameState.selectedTokenId = null; // Also clear selected token
          gameState.selectedOption = null;
          broadcastState();
          checkBotTurn();
        }
      }
    },
    end_resolve_attack_counter: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_resolve_attack_counter' && playerIndex === gameState.activePlayerIndex) {
        // Check if attack was blocked
        const hasDefense = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');

        // 1. Original attack hits defender (only if not blocked)
        if (!hasDefense && gameState.selectedTargetId) {
          const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
          if (targetCard) {
            const damage = 1;
            targetCard.damage = (targetCard.damage || 0) + damage;

            // Interrupt chanting when attacked
            const targetToken = gameState.tokens.find(t => t.boundToCardId === targetCard.id);
            if (targetToken) handlers.checkAndResetChanting(targetToken.id);

            let damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === targetCard.id);
            if (!damageCounter) {
               damageCounter = { id: generateId(), type: 'damage', x: targetCard.x, y: targetCard.y, value: 0, boundToCardId: targetCard.id };
               gameState.counters.push(damageCounter);
            }
            damageCounter.value = targetCard.damage;
            const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
            const attackerCard = attackerToken ? gameState.tableCards.find(c => c.id === attackerToken.boundToCardId) : null;
            
            if (attackerCard) {
              addLog(`发起阶段: ${attackerCard.heroClass} 对 ${targetCard.heroClass} 发起了攻击`, playerIndex);
            }
            addLog(`结算阶段: ${targetCard.heroClass} 受到 ${damage} 点伤害，当前受伤计数器为 ${targetCard.damage}`, playerIndex);

            // Reward attacker for successful hit
            if (attackerToken && attackerToken.boundToCardId) {
              const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === attackerToken.boundToCardId);
              if (expCounter) expCounter.value += REWARDS.HERO_ATTACK.EXP;
              addLog(`奖励阶段: ${attackerCard?.heroClass} 攻击成功，获得 ${REWARDS.HERO_ATTACK.EXP} 经验`, playerIndex);
            }

            gameState.notification = `攻击成功！${targetCard.heroClass} 受到了 ${damage} 点伤害。接下来触发反击！`;
            
            // Check hero death
            const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === targetCard.heroClass);
            const levelData = heroData?.levels?.[targetCard.level || 1];
            const hp = levelData?.hp || 3;
            if (targetCard.damage >= hp) {
              targetCard.damage = 0;
              if (damageCounter) damageCounter.value = 0;
              const token = gameState.tokens.find(t => t.boundToCardId === targetCard.id);
              if (token) { token.x = targetCard.x; token.y = targetCard.y; }
              gameState.counters.push({ id: generateId(), type: 'time', x: targetCard.x, y: targetCard.y, value: 0, boundToCardId: targetCard.id });
              if (token) handlers.checkAndResetChanting(token.id);
              
              addLog(`阵亡阶段: ${targetCard.heroClass} 已阵亡`, playerIndex);
              gameState.notification += ` ${targetCard.heroClass} 阵亡！`;

              // Reward attacker
              if (attackerToken && attackerToken.boundToCardId) {
                const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === attackerToken.boundToCardId);
                if (expCounter) expCounter.value += REWARDS.HERO_KILL.EXP;
                
                const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
                if (goldCounter) goldCounter.value += REWARDS.HERO_KILL.GOLD;
                
                addLog(`奖励阶段: ${attackerCard?.heroClass} 击败了 ${targetCard.heroClass}，获得 ${REWARDS.HERO_KILL.EXP} 经验和 ${REWARDS.HERO_KILL.GOLD} 金币`, playerIndex);
                gameState.notification += ` 获得 ${REWARDS.HERO_KILL.EXP} 经验和 ${REWARDS.HERO_KILL.GOLD} 金币。`;
                
                // Reputation scoring
                addReputation(playerIndex, REWARDS.HERO_KILL.REP, "击杀敌方英雄");
              }
              
              // Skip counter-attack if defender dies
              gameState.playAreaCards.forEach(c => gameState.discardPiles.action.push(c));
              gameState.playAreaCards = [];
              
              if (gameState.activeActionTokenId) {
                handlers.finish_action(socket);
              } else {
                gameState.phase = 'action_play';
                gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
                gameState.selectedTargetId = null;
                gameState.selectedTokenId = null;
                io.emit('state_update', gameState);
                checkBotTurn();
              }
              return;
            }
          }
        } else if (hasDefense) {
          const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
          const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
          const attackerCard = attackerToken ? gameState.tableCards.find(c => c.id === attackerToken.boundToCardId) : null;
          
          if (attackerCard && targetCard) {
            addLog(`发起阶段: ${attackerCard.heroClass} 对 ${targetCard.heroClass} 发起了攻击`, playerIndex);
          }
          addLog(`结算阶段: 攻击被防御卡格挡！接下来触发反击！`, playerIndex);
          gameState.notification = `攻击被格挡！接下来触发反击！ (Attack blocked! Counter-attack next!)`;
        }

        gameState.phase = 'action_resolve_counter';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        io.emit('state_update', gameState);
        checkBotTurn();
      }
    },
    end_resolve_counter: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_resolve_counter' && playerIndex === gameState.activePlayerIndex) {
        // 2. Counter-attack hits attacker
        if (gameState.selectedTokenId) {
          const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
          if (attackerToken && attackerToken.boundToCardId) {
            const attackerCard = gameState.tableCards.find(c => c.id === attackerToken.boundToCardId);
            if (attackerCard) {
              const counterDamage = 1;
              attackerCard.damage = (attackerCard.damage || 0) + counterDamage;
              let attackerDamageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === attackerCard.id);
              if (!attackerDamageCounter) {
                 attackerDamageCounter = { id: generateId(), type: 'damage', x: attackerCard.x, y: attackerCard.y, value: 0, boundToCardId: attackerCard.id };
                 gameState.counters.push(attackerDamageCounter);
              }
              attackerDamageCounter.value = attackerCard.damage;
              
              const defenderCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
              if (defenderCard) {
                addLog(`反击阶段: ${defenderCard.heroClass} 存活，触发反击！${attackerCard.heroClass} 受到 ${counterDamage} 点伤害`, playerIndex);
              }
              addLog(`结算阶段: ${attackerCard.heroClass} 当前受伤计数器为 ${attackerCard.damage}`, playerIndex);

              gameState.notification = `反击成功！${attackerCard.heroClass} 受到了 ${counterDamage} 点伤害。`;
              
              // Check hero death
              const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === attackerCard.heroClass);
              const levelData = heroData?.levels?.[attackerCard.level || 1];
              const hp = levelData?.hp || 3;
              if (attackerCard.damage >= hp) {
                attackerCard.damage = 0;
                if (attackerDamageCounter) attackerDamageCounter.value = 0;
                attackerToken.x = attackerCard.x;
                attackerToken.y = attackerCard.y;
                gameState.counters.push({ id: generateId(), type: 'time', x: attackerCard.x, y: attackerCard.y, value: 0, boundToCardId: attackerCard.id });
                handlers.checkAndResetChanting(attackerToken.id);
                
                addLog(`阵亡阶段: ${attackerCard.heroClass} 已阵亡`, playerIndex);
                gameState.notification += ` ${attackerCard.heroClass} 阵亡！`;

                // Reward defender (who is playerIndex)
                if (gameState.selectedTargetId) {
                  const reward = attackerCard.level || 1;
                  const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === gameState.selectedTargetId);
                  if (expCounter) expCounter.value += reward;
                  
                  const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
                  if (goldCounter) goldCounter.value += reward;
                  
                  addLog(`奖励阶段: ${defenderCard?.heroClass} 击败了 ${attackerCard.heroClass}，获得 ${reward} 经验和 ${reward} 金币`, playerIndex);
                  gameState.notification += ` 获得 ${reward} 经验和 ${reward} 金币。`;
                  
                  // Reputation scoring
                  addReputation(playerIndex, REWARDS.HERO_KILL.REP, "击杀敌方英雄");
                }
              }
            }
          }
        }

        // Clear play area cards (move to discard)
        gameState.playAreaCards.forEach(c => gameState.discardPiles.action.push(c));
        gameState.playAreaCards = [];
        
        if (gameState.activeActionTokenId) {
          handlers.finish_action(socket);
        } else {
          gameState.phase = 'action_play';
          // Turn already flipped to defender in end_resolve_attack_counter, so we don't flip again here.
          // Defender should now be the active player to play their next action card.
          gameState.selectedTargetId = null;
          gameState.selectedTokenId = null;
          io.emit('state_update', gameState);
          checkBotTurn();
        }
      }
    },
    pass_shop: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex || gameState.phase !== 'shop') return;

      gameState.shopPasses += 1;
      addLog(`玩家${playerIndex + 1}结束了购买`, playerIndex);
      
      if (gameState.shopPasses >= 2) {
        startEndPhase();
      } else {
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
    finish_resolve: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if ((gameState.phase === 'action_select_option' || gameState.phase === 'shop') && playerIndex === gameState.activePlayerIndex) {
        const option = gameState.selectedOption;
        const isShop = gameState.phase === 'shop';
        
        const lastCard = gameState.playAreaCards[gameState.playAreaCards.length - 1];
        const cardName = lastCard ? lastCard.name : '未知卡牌';

        if (option === 'seize') {
          if (playerIndex === gameState.firstPlayerIndex) {
            socket.emit('error_message', '你已经是先手玩家，无法抢先手。');
            return;
          }
          if (gameState.hasSeizedInitiative) {
            socket.emit('error_message', '本回合已经有人抢过先手了。');
            return;
          }
          gameState.firstPlayerIndex = playerIndex;
          gameState.hasSeizedInitiative = true;
          if (isShop) {
            addLog(`玩家${playerIndex + 1} 执行了 抢先手`, playerIndex);
          } else {
            addLog(`玩家${playerIndex + 1} 弃掉了 ${cardName} 执行了 抢先手`, playerIndex);
          }
        } else if (option === 'spy') {
          const opponentId = gameState.seats[1 - playerIndex];
          if (opponentId && gameState.players[opponentId]) {
            const opponent = gameState.players[opponentId];
            if (opponent && opponent.hand && opponent.hand.length > 0) {
              const randomIndex = Math.floor(Math.random() * opponent.hand.length);
              const discardedCard = opponent.hand.splice(randomIndex, 1)[0];
              if (isShop) {
                addLog(`玩家${playerIndex + 1} 执行了 间谍`, playerIndex);
              } else {
                addLog(`玩家${playerIndex + 1} 弃掉了 ${cardName} 执行了 间谍`, playerIndex);
              }
              addLog(`间谍弃置了对方的一张${discardedCard.name}`, playerIndex);
              const playAreaX = 650;
              const playAreaY = 100;
              const discardOffset = gameState.playAreaCards.length * 30;
              gameState.playAreaCards.push({ ...discardedCard, x: playAreaX + discardOffset, y: playAreaY, faceUp: true });
            }
          }
        } else if (option === 'heal') {
          if (gameState.selectedTargetId) {
            const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
            if (targetCard) {
              const targetToken = gameState.tokens.find(t => t.boundToCardId === targetCard.id);
              if (targetToken) handlers.checkAndResetChanting(targetToken.id);

              const currentDamage = targetCard.damage || 0;
              if (currentDamage > 0) {
                targetCard.damage = currentDamage - 1;
                const damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === targetCard.id);
                if (damageCounter) damageCounter.value = targetCard.damage;
                if (isShop) {
                  addLog(`玩家${playerIndex + 1} 执行了 ${targetCard.heroClass} 的回复`, playerIndex);
                } else {
                  addLog(`玩家${playerIndex + 1} 弃掉了 ${cardName} 执行了 ${targetCard.heroClass} 的回复`, playerIndex);
                }
                addLog(`${targetCard.heroClass} 恢复了1点生命值，当前受伤计数器为 ${targetCard.damage}`, playerIndex);
                gameState.notification = `回复成功！${targetCard.heroClass} 恢复了1点生命值。 (Heal successful! ${targetCard.heroClass} restored 1 HP.)`;
              }
            }
          }
        } else if (option === 'evolve') {
          if (gameState.selectedTargetId && heroesDatabase) {
            const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
            if (targetCard && targetCard.heroClass && targetCard.level) {
              const targetToken = gameState.tokens.find(t => t.boundToCardId === targetCard.id);
              if (targetToken) handlers.checkAndResetChanting(targetToken.id);

              const nextLevel = targetCard.level + 1;
              const heroData = heroesDatabase.heroes.find((h: any) => h.name === targetCard.heroClass);
              const levelData = heroData?.levels?.[targetCard.level.toString()];
              const expNeeded = levelData?.xp;
              const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === targetCard.id);
              
              if (expCounter && typeof expNeeded === 'number' && expNeeded > 0 && expCounter.value >= expNeeded) {
                // Evolve
                targetCard.level = nextLevel;
                targetCard.frontImage = getHeroCardImage(targetCard.heroClass, nextLevel);
                targetCard.backImage = getHeroBackImage(nextLevel);
                expCounter.value -= expNeeded;
                gameState.lastEvolvedId = targetCard.id;
                
                if (isShop) {
                  addLog(`玩家${playerIndex + 1} 执行了 ${targetCard.heroClass} 的进化`, playerIndex);
                } else {
                  addLog(`玩家${playerIndex + 1} 弃掉了 ${cardName} 执行了 ${targetCard.heroClass} 的进化`, playerIndex);
                }
                addLog(`${targetCard.heroClass} 进化到了 Lv${nextLevel}`, playerIndex);

                // Reputation gain for evolution
                const reputationGain = nextLevel === 2 ? 1 : (nextLevel === 3 ? 2 : 0);
                if (reputationGain > 0) {
                  addReputation(playerIndex, reputationGain, `${targetCard.heroClass} 进化到 Lv${nextLevel}`);
                }

                // Heal 1 HP on evolve
                if (targetCard.damage && targetCard.damage > 0) {
                  targetCard.damage -= 1;
                  const damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === targetCard.id);
                  if (damageCounter) damageCounter.value = targetCard.damage;
                  gameState.notification = '进化成功！英雄恢复了1点生命值。 (Evolution successful! Hero restored 1 HP.)';
                } else {
                  gameState.notification = '进化成功！ (Evolution successful!)';
                }

                // Update Token
                const token = gameState.tokens.find(t => t.image === getHeroTokenImage(targetCard.heroClass!));
                if (token) {
                  token.lv = nextLevel;
                  token.label = `${targetCard.heroClass} Lv${nextLevel}`;
                }
              }
            }
          }
        } else if (option === 'hire') {
          if (gameState.selectedTargetId) {
            const targetCard = gameState.hireAreaCards.find(c => c.id === gameState.selectedTargetId);
            if (targetCard) {
              // Deduct gold
              const goldCounter = gameState.counters.find(c => c.type === 'gold' && (isPlayer1 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
              if (goldCounter) goldCounter.value -= 2;

              // Move card to table
              const playerHeroes = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0)));
              const heroX = -50 + (playerHeroes.length * 120);
              const heroY = isPlayer1 ? 550 : -700;
              
              const cardIndex = gameState.hireAreaCards.findIndex(c => c.id === targetCard.id);
              gameState.hireAreaCards.splice(cardIndex, 1);
              
              if (isShop) {
                addLog(`玩家${playerIndex + 1} 执行了 雇佣`, playerIndex);
              } else {
                addLog(`玩家${playerIndex + 1} 弃掉了 ${cardName} 执行了 雇佣`, playerIndex);
              }
              addLog(`雇佣了英雄：${targetCard.heroClass}`, playerIndex);

              const tableCard: TableCard = { ...targetCard, x: heroX, y: heroY, faceUp: true };
              gameState.tableCards.push(tableCard);

              // Spawn Token
              const playerCastles = gameState.map!.castles[playerIndex as 0 | 1];
              const castleCoord = playerCastles[0];
              const castlePos = hexToPixel(castleCoord.q, castleCoord.r);
              if (tableCard.heroClass) {
                gameState.tokens.push({
                  id: generateId(),
                  x: castlePos.x,
                  y: castlePos.y,
                  image: getHeroTokenImage(tableCard.heroClass),
                  label: `${tableCard.heroClass} Lv1`,
                  lv: 1,
                  time: 0,
                  boundToCardId: tableCard.id
                });
              }

              // Spawn counters
              gameState.counters.push({ id: generateId(), type: 'exp', x: heroX + 50, y: heroY - 30, value: 0, boundToCardId: tableCard.id });
              gameState.counters.push({ id: generateId(), type: 'damage', x: heroX + 50, y: heroY + 180, value: 0, boundToCardId: tableCard.id });
              
              alignHireArea();
              gameState.notification = `雇佣成功！${tableCard.heroClass} 加入了战场。 (Hire successful! ${tableCard.heroClass} joined the battle.)`;
            }
          }
        }

        if (!isShop) {
          gameState.phase = 'action_play';
        }
        if (gameState.playAreaCards.length > 0) {
          gameState.discardPiles.action.push(...gameState.playAreaCards);
          gameState.playAreaCards = [];
        }
        gameState.selectedOption = null;
        gameState.selectedTargetId = null;
        gameState.selectedTokenId = null;
        gameState.remainingMv = 0;
        gameState.reachableCells = [];
        gameState.globalMovementMovedTokens = [];
        gameState.lastPlayedCardId = null;
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        gameState.consecutivePasses = 0; // Reset passes if an action was taken
        updateAvailableActions(gameState.activePlayerIndex);
        broadcastState();
        checkBotTurn();
      }
    },

    cancel_play_card: (socket: any) => {
      const playerIndex = getPlayerIndex(socket.id);
      if (playerIndex === -1 || playerIndex !== gameState.activePlayerIndex) return;

      if (gameState.phase === 'action_select_option' && gameState.lastPlayedCardId) {
        const cardIndex = gameState.playAreaCards.findIndex(c => c.id === gameState.lastPlayedCardId);
        if (cardIndex !== -1) {
          const card = gameState.playAreaCards.splice(cardIndex, 1)[0];
          const player = gameState.players[socket.id];
          if (player) {
            player.hand.push({
              id: card.id,
              frontImage: card.frontImage,
              backImage: card.backImage,
              type: card.type,
              name: card.name,
              heroClass: card.heroClass,
              level: card.level
            });
          }
          gameState.lastPlayedCardId = null;
          gameState.phase = 'action_options';
          gameState.notification = null;
          broadcastState();
        }
      }
    },

    discard_card: (socket: any, cardId) => {
      const player = gameState.players[socket.id];
      if (!player) return;

      if (gameState.phase !== 'discard') {
        let cardIndex = gameState.tableCards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.tableCards.splice(cardIndex, 1)[0];
          gameState.discardPiles.action.push(card);
          io.emit('state_update', gameState);
          return;
        }
        
        cardIndex = gameState.hireAreaCards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.hireAreaCards.splice(cardIndex, 1)[0];
          gameState.discardPiles.action.push(card);
          alignHireArea();
          io.emit('state_update', gameState);
          return;
        }
        
        if (gameState.playAreaCards) {
          cardIndex = gameState.playAreaCards.findIndex(c => c.id === cardId);
          if (cardIndex !== -1) {
            const card = gameState.playAreaCards.splice(cardIndex, 1)[0];
            gameState.discardPiles.action.push(card);
            io.emit('state_update', gameState);
            return;
          }
        }
        return;
      }

      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex !== -1 && gameState.phase === 'discard' && !player.discardFinished) {
        const card = player.hand.splice(cardIndex, 1)[0];
        gameState.discardPiles.action.push(card);
        // Save state for undo
        if (!player.discardHistory) player.discardHistory = [];
        player.discardHistory.push(card);
        io.emit('state_update', gameState);
      }
    },
    finish_discard: (socket: any) => {
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'discard' || player.discardFinished) return;

      if (player.hand.length > 5) {
        socket.emit('error_message', '手牌数量必须小于等于5张。');
        return;
      }

      player.discardFinished = true;
      player.discardHistory = []; // Clear history when finished
      
      const allFinished = gameState.seats.filter(id => id !== null).every(id => gameState.players[id!].discardFinished);
      if (allFinished) {
        gameState.phase = 'shop';
        gameState.activePlayerIndex = 1 - gameState.firstPlayerIndex;
        addLog(`进入商店阶段`, -1);
        broadcastState();
        checkBotTurn();
      } else {
        broadcastState();
        checkBotTurn(); // Trigger bots to finish their discard
      }
    },
    hire_hero: (socket: any, { cardId, goldAmount, targetCastleIndex }: { cardId: string, goldAmount: number, targetCastleIndex: number }) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const playerIndex = isPlayer1 ? 0 : 1;
      
      const result = HeroEngine.hireHero(gameState, playerIndex, cardId, goldAmount, targetCastleIndex, {
        addLog,
        alignHireArea,
        checkAllTokensUsed
      });

      if (!result.success) {
        socket.emit('error_message', result.reason);
        return;
      }

      broadcastState();
      checkBotTurn();
    },
  };

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

    socket.on('start_game', () => {
      if (gameState.gameStarted) return;
      
      const occupiedSeats = gameState.seats.filter(id => id !== null) as string[];
      if (occupiedSeats.length === 0) return;

      gameState.gameStarted = true;
      
      // AI Substitute for Player 2 if only one player is present and no bot added
      const botCount = Object.values(gameState.players).filter(p => p.isBot).length;
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
    });

    socket.on('add_bot', ({ seatIndex, difficulty }: { seatIndex: number, difficulty: number }) => {
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
    });

    socket.on('sit_down', ({ seatIndex, playerName }: { seatIndex: number, playerName: string }) => {
      if (!gameState.gameStarted && gameState.seats[seatIndex] === null) {
        const existingIndex = gameState.seats.indexOf(socket.id);
        if (existingIndex !== -1) {
          gameState.seats[existingIndex] = null;
        }
        gameState.seats[seatIndex] = socket.id;
        
        if (gameState.players[socket.id]) {
          gameState.players[socket.id].name = playerName;
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
          
          // Update active player index if needed
          if (gameState.seats[gameState.activePlayerIndex] === oldPlayerId) {
            // No need to change index, just the seat mapping is updated
          }
          
          io.emit('state_update', gameState);
        }
      }
    });

    socket.on('leave_seat', () => {
      if (!gameState.gameStarted) {
        const existingIndex = gameState.seats.indexOf(socket.id);
        if (existingIndex !== -1) {
          gameState.seats[existingIndex] = null;
          io.emit('state_update', gameState);
        }
      }
    });

    socket.on('remove_bot', ({ seatIndex }: { seatIndex: number }) => {
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
    });

    socket.on('update_image_config', (config: ImageConfig) => {
      gameState = createInitialState();
      io.emit('init', gameState);
    });

    socket.on('update_map', (mapConfig: MapConfig) => {
      if (!gameState.gameStarted) {
        const currentPlayers = { ...gameState.players };
        const currentSeats = [...gameState.seats];
        gameState = createInitialState(mapConfig);
        gameState.players = currentPlayers;
        gameState.seats = currentSeats;
        // Re-initialize player state for existing players
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
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      const existingIndex = gameState.seats.indexOf(socket.id);
      if (existingIndex !== -1) {
        gameState.seats[existingIndex] = null;
      }
      // Do not delete player data to allow reconnection by name
      io.emit('state_update', gameState);
    });

    socket.on('move_item', ({ type, id, x, y }) => {
      let item;
      if (type === 'token') item = gameState.tokens.find(t => t.id === id);
      if (type === 'card') {
        item = gameState.tableCards.find(c => c.id === id);
        if (!item) item = gameState.hireAreaCards.find(c => c.id === id);
        if (!item && gameState.playAreaCards) item = gameState.playAreaCards.find(c => c.id === id);
      }
      if (type === 'counter') item = gameState.counters.find(c => c.id === id);

      if (item) {
        // Exclusion Zone: x > 800, y > 400 (approx)
        if (x > 800 && y > 400) {
          if (type === 'token') gameState.tokens = gameState.tokens.filter(t => t.id !== id);
          if (type === 'card') {
            gameState.tableCards = gameState.tableCards.filter(c => c.id !== id);
            gameState.hireAreaCards = gameState.hireAreaCards.filter(c => c.id !== id);
            if (gameState.playAreaCards) gameState.playAreaCards = gameState.playAreaCards.filter(c => c.id !== id);
          }
          if (type === 'counter') gameState.counters = gameState.counters.filter(c => c.id !== id);
          io.emit('state_update', gameState);
          return;
        }

        // Hire Area Zone: x > 100, y < -300
        if (type === 'card' && x > 100 && y < -350) {
          const cardIndex = gameState.tableCards.findIndex(c => c.id === id);
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
          gameState.counters.filter(c => c.boundToCardId === id).forEach(c => {
            c.x += dx;
            c.y += dy;
            io.emit('item_moved', { type: 'counter', id: c.id, x: c.x, y: c.y });
          });
          gameState.tokens.filter(t => t.boundToCardId === id).forEach(t => {
            t.x += dx;
            t.y += dy;
            io.emit('item_moved', { type: 'token', id: t.id, x: t.x, y: t.y });
          });
        }
      }
    });

    socket.on('draw_card', (deckType: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero' | 'discard_action') => {
      let deck;
      if (deckType === 'discard_action') {
        deck = gameState.discardPiles.action;
      } else {
        deck = gameState.decks[deckType];
      }

      if (deck && deck.length > 0) {
        const card = deck.pop()!;
        const player = gameState.players[socket.id];
        if (player) {
          player.hand.push(card);
          io.emit('state_update', gameState);
        }
      } else if (deckType === 'action' && gameState.discardPiles.action.length > 0) {
        gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
        gameState.discardPiles.action = [];
        const card = gameState.decks.action.pop()!;
        const player = gameState.players[socket.id];
        if (player) {
          player.hand.push(card);
          io.emit('state_update', gameState);
        }
      }
    });

    socket.on('draw_card_to_table', (deckType: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero' | 'discard_action', x: number, y: number) => {
      handlers.draw_card_to_table(socket, deckType, x, y);
    });

    socket.on('shuffle_deck', (deckType: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero' | 'discard_action') => {
      let deck;
      if (deckType === 'discard_action') {
        deck = gameState.discardPiles.action;
      } else {
        deck = gameState.decks[deckType];
      }
      if (deck) {
        deck.sort(() => Math.random() - 0.5);
        io.emit('state_update', gameState);
      }
    });

    socket.on('take_card_to_hand', (cardId) => {
      const player = gameState.players[socket.id];
      if (!player) return;

      let cardIndex = gameState.tableCards.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        const card = gameState.tableCards.splice(cardIndex, 1)[0];
        player.hand.push(card);
        io.emit('state_update', gameState);
        return;
      }
      cardIndex = gameState.hireAreaCards.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        const card = gameState.hireAreaCards.splice(cardIndex, 1)[0];
        player.hand.push(card);
        alignHireArea();
        io.emit('state_update', gameState);
        return;
      }
      if (gameState.playAreaCards) {
        cardIndex = gameState.playAreaCards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.playAreaCards.splice(cardIndex, 1)[0];
          player.hand.push(card);
          io.emit('state_update', gameState);
          return;
        }
      }
    });

    socket.on('play_card', ({ cardId, x, y, targetCastleIndex }) => migratedHandlers.play_card(socket, { cardId, x, y, targetCastleIndex }));

    socket.on('undo_play', () => {
      const player = gameState.players[socket.id];
      if (!player) return;
      
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if ((gameState.phase === 'action_select_option' || gameState.phase === 'action_defend') && playerIndex === gameState.activePlayerIndex) {
        if (gameState.selectedTargetId) {
          gameState.selectedTargetId = null;
          broadcastState();
        } else if (gameState.movementHistory && gameState.movementHistory.length > 0 && (!gameState.selectedTokenId || gameState.movementHistory[gameState.movementHistory.length - 1].tokenId === gameState.selectedTokenId)) {
          // Granular movement undo for the CURRENTLY selected token, or the LAST moved token if none is selected
          const lastStep = gameState.movementHistory.pop()!;
          const token = gameState.tokens.find(t => t.id === lastStep.tokenId);
          
          if (token) {
            // If we are reverting a token that was finalized, re-select it
            if (!gameState.selectedTokenId) {
              gameState.selectedTokenId = token.id;
              // Remove it from globalMovementMovedTokens
              if (gameState.globalMovementMovedTokens) {
                gameState.globalMovementMovedTokens = gameState.globalMovementMovedTokens.filter(id => id !== token.id);
              }
              
              // Recalculate remainingMv for this token based on total movement history
              const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
              if (card) {
                const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
                const levelData = heroData?.levels?.[card.level || 1];
                let mv = levelData?.mv || 1;
                if (gameState.selectedOption === 'sprint') mv += 1;
                
                // Sum up remaining movement history for this token
                const totalMvCost = gameState.movementHistory.filter(step => step.tokenId === token.id).reduce((sum, step) => sum + step.mvCost, 0);
                gameState.remainingMv = mv - totalMvCost;
              }
            } else {
              gameState.remainingMv! += lastStep.mvCost;
            }
            
            token.x = lastStep.fromX;
            token.y = lastStep.fromY;
            
            // Decrement action count if this was the first move of the action
            const hasOtherMoves = gameState.movementHistory?.some(step => step.tokenId === token.id && step.mvCost > 0);
            if (!hasOtherMoves && lastStep.mvCost > 0) {
              if (gameState.roundActionCounts[token.id]) {
                gameState.roundActionCounts[token.id]--;
              }
            }
            
            // Restore chanting state if it was interrupted by this movement
            if (lastStep.wasChanting) {
              const hex = pixelToHex(token.x, token.y);
              const magicCircle = gameState.magicCircles?.find(mc => mc.q === hex.q && mc.r === hex.r);
              if (magicCircle) {
                magicCircle.state = 'chanting';
                magicCircle.chantingTokenId = token.id;
              }
            }
            
            // Re-calculate reachable cells from new (old) position
            const hex = pixelToHex(token.x, token.y);
            gameState.reachableCells = getReachableHexes(hex, gameState.remainingMv!, playerIndex, gameState);
          }
          broadcastState();
        } else if (gameState.selectedTokenId) {
          // Deselect token
          const deselectedTokenId = gameState.selectedTokenId;
          gameState.selectedTokenId = null;
          gameState.remainingMv = 0;
          gameState.reachableCells = [];
          
          // If there is a previous token in movement history, we might want to revert to it
          if (gameState.movementHistory && gameState.movementHistory.length > 0) {
             const prevTokenId = gameState.movementHistory[gameState.movementHistory.length - 1].tokenId;
             // Remove the deselected token from globalMovementMovedTokens if it was added
             if (gameState.globalMovementMovedTokens) {
               gameState.globalMovementMovedTokens = gameState.globalMovementMovedTokens.filter(id => id !== deselectedTokenId);
             }
             
             // We don't automatically select the previous token, the user can click it again.
             // But we need to make sure the previous token is no longer in globalMovementMovedTokens
             // so it can be selected again.
             if (gameState.globalMovementMovedTokens) {
               gameState.globalMovementMovedTokens = gameState.globalMovementMovedTokens.filter(id => id !== prevTokenId);
             }
          }
          
          broadcastState();
        } else if (gameState.selectedOption) {
          // Deselect option
          gameState.selectedOption = null;
          gameState.selectedTokenId = null;
          gameState.remainingMv = 0;
          gameState.reachableCells = [];
          gameState.globalMovementMovedTokens = [];
          gameState.movementHistory = undefined;
          broadcastState();
        } else if (gameState.lastPlayedCardId) {
          // Undo primary card play
          let cardIndex = gameState.playAreaCards.findIndex(c => c.id === gameState.lastPlayedCardId);
          let card;
          
          if (cardIndex !== -1) {
            card = gameState.playAreaCards.splice(cardIndex, 1)[0];
          } else {
            cardIndex = gameState.tableCards.findIndex(c => c.id === gameState.lastPlayedCardId);
            if (cardIndex !== -1) {
              card = gameState.tableCards.splice(cardIndex, 1)[0];
            }
          }

          if (card) {
            // Revert token positions if any moved
            if (gameState.movedTokens) {
              Object.entries(gameState.movedTokens).forEach(([tokenId, pos]) => {
                const token = gameState.tokens.find(t => t.id === tokenId);
                if (token) {
                  token.x = pos.x;
                  token.y = pos.y;
                }
              });
              gameState.movedTokens = undefined;
            }

            // If it was a hero, remove the token and counters too
            if (card.type === 'hero') {
              gameState.tokens = gameState.tokens.filter(t => t.boundToCardId !== card.id);
              gameState.counters = gameState.counters.filter(c => c.boundToCardId !== card.id);
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
    });

    socket.on('click_action_token', (tokenId: string) => handlers.click_action_token(socket, tokenId));
    socket.on('cancel_action_token', () => handlers.cancel_action_token(socket));
    socket.on('cancel_play_card', () => handlers.cancel_play_card(socket));

    socket.on('select_action_category', (category: any) => handlers.select_action_category(socket, category));

    socket.on('select_common_action', (action: any) => handlers.select_common_action(socket, action));

    socket.on('select_hero_for_action', (heroTokenId: string) => handlers.select_hero_for_action(socket, heroTokenId));

    socket.on('select_hero_action', (actionType: any) => handlers.select_hero_action(socket, actionType));

    socket.on('play_enhancement_card', (cardId: string) => handlers.play_enhancement_card(socket, cardId));

    socket.on('pass_enhancement', () => handlers.pass_enhancement(socket));

    socket.on('finish_action', () => handlers.finish_action(socket));

    socket.on('select_hire_cost', (cost: number) => handlers.select_hire_cost(socket, cost));

    socket.on('pass_shop', () => handlers.pass_shop(socket));

    socket.on('end_resolve_attack_counter', () => handlers.end_resolve_attack_counter(socket));

    socket.on('end_resolve_counter', () => handlers.end_resolve_counter(socket));

    socket.on('select_option', (option: string) => handlers.select_option(socket, option));

    socket.on('select_token', (tokenId: string) => handlers.select_token(socket, tokenId));

    socket.on('select_target', (targetId: string) => handlers.select_target(socket, targetId));

    socket.on('move_token_to_cell', ({ q, r }) => handlers.move_token_to_cell(socket, { q, r }));

    socket.on('steal_first_player', () => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (playerIndex !== -1 && playerIndex !== gameState.firstPlayerIndex) {
        gameState.firstPlayerIndex = playerIndex;
        io.emit('state_update', gameState);
      }
    });

    socket.on('pass_action', () => handlers.pass_action(socket));

    socket.on('finish_resolve', () => handlers.finish_resolve(socket));

    socket.on('clear_notification', () => {
      gameState.notification = null;
      broadcastState();
    });

    socket.on('declare_defend', () => handlers.declare_defend(socket));

    socket.on('declare_counter', () => handlers.declare_counter(socket));

    socket.on('cancel_defend_or_counter', () => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if ((gameState.phase === 'action_play_defense' || gameState.phase === 'action_play_counter') && playerIndex === gameState.activePlayerIndex) {
        gameState.phase = 'action_defend';
        gameState.notification = null;
        broadcastState();
        checkBotTurn();
      }
    });

    socket.on('pass_defend', () => handlers.pass_defend(socket));

    socket.on('end_resolve_attack', () => handlers.end_resolve_attack(socket));

    socket.on('end_resolve_attack_counter', () => handlers.end_resolve_attack_counter(socket));

    socket.on('end_resolve_counter', () => handlers.end_resolve_counter(socket));

    socket.on('next_shop', () => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'shop' && playerIndex === gameState.activePlayerIndex) {
        gameState.consecutivePasses = 0;
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    });

    socket.on('pass_shop', () => handlers.pass_shop(socket));

    socket.on('proceed_phase', () => handlers.proceed_phase(socket));

    socket.on('hire_hero', ({ cardId, goldAmount, targetCastleIndex }) => handlers.hire_hero(socket, { cardId, goldAmount, targetCastleIndex }));
    socket.on('revive_hero', ({ heroCardId, targetCastleIndex }) => handlers.revive_hero(socket, { heroCardId, targetCastleIndex }));
    socket.on('select_hire_cost', (cost) => handlers.select_hire_cost(socket, cost));

    socket.on('evolve_hero', (cardId) => {
      const card = gameState.tableCards.find(c => c.id === cardId);
      if (card && card.type === 'hero' && card.heroClass && card.level && card.level < 3) {
        const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === card.id);
        const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
        const levelData = heroData?.levels?.[card.level.toString()];
        const expNeeded = levelData?.xp;

        if (expCounter && typeof expNeeded === 'number' && expNeeded > 0 && expCounter.value >= expNeeded) {
          expCounter.value -= expNeeded;
          card.level += 1;
          card.frontImage = getHeroCardImage(card.heroClass, card.level);
          card.backImage = getHeroBackImage(card.level);
          
          // Also update the token level
          const token = gameState.tokens.find(t => t.boundToCardId === card.id);
          if (token) {
            token.lv = card.level;
            token.label = `${card.heroClass} Lv${card.level}`;
          }
          
          addLog(`玩家${gameState.activePlayerIndex + 1}进化了${card.heroClass}到Lv${card.level}`, gameState.activePlayerIndex);
          gameState.lastEvolvedId = card.id;
          broadcastState();
          
          // Clear effect after a short delay
          setTimeout(() => {
            if (gameState.lastEvolvedId === card.id) {
              gameState.lastEvolvedId = null;
              broadcastState();
            }
          }, 2000);
        }
      }
    });

    socket.on('discard_card', (cardId) => handlers.discard_card(socket, cardId));

    socket.on('undo_discard', () => {
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'discard' || player.discardFinished || !player.discardHistory || player.discardHistory.length === 0) return;

      const card = player.discardHistory.pop();
      if (card) {
        player.hand.push(card);
        const discardIndex = gameState.discardPiles.action.findIndex(c => c.id === card.id);
        if (discardIndex !== -1) gameState.discardPiles.action.splice(discardIndex, 1);
        io.emit('state_update', gameState);
      }
    });

    socket.on('finish_discard', () => handlers.finish_discard(socket));

    socket.on('flip_card', (cardId) => {
      let card = gameState.tableCards.find(c => c.id === cardId);
      if (!card) card = gameState.hireAreaCards.find(c => c.id === cardId);
      if (!card && gameState.playAreaCards) card = gameState.playAreaCards.find(c => c.id === cardId);
      
      if (card) {
        card.faceUp = !card.faceUp;
        io.emit('card_flipped', { id: cardId, faceUp: card.faceUp });
      }
    });

    socket.on('add_counter', ({ type, x, y, value }) => {
      const counter: Counter = { id: generateId(), type, x, y, value: value ?? 0 };
      gameState.counters.push(counter);
      io.emit('state_update', gameState);
    });

    socket.on('update_counter', ({ id, delta }) => {
      const counterIndex = gameState.counters.findIndex(c => c.id === id);
      if (counterIndex !== -1) {
        const counter = gameState.counters[counterIndex];
        counter.value += delta;
        
        // Sync damage counter to TableCard
        if (counter.type === 'damage' && counter.boundToCardId) {
          const card = gameState.tableCards.find(c => c.id === counter.boundToCardId);
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
    });

    socket.on('update_token_value', ({ id, field, delta }) => {
      const token = gameState.tokens.find(t => t.id === id);
      if (token && (field === 'lv' || field === 'time')) {
        token[field] += delta;
        io.emit('state_update', gameState);
      }
    });

    socket.on('spawn_hero', ({ heroClass, level, x, y }) => {
      if (level === 1) {
        const token: Token = {
          id: generateId(),
          x, y,
          image: getHeroTokenImage(heroClass),
          label: `${heroClass} Lv1`,
          lv: 1,
          time: 0
        };
        gameState.tokens.push(token);
      } else {
        const card: TableCard = {
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
    });
    
    socket.on('reset_game', () => {
      const currentPlayers = { ...gameState.players };
      const currentSeats = [...gameState.seats];
      
      gameState = createInitialState(gameState.map);
      gameState.players = currentPlayers;
      gameState.seats = currentSeats;
      // Re-initialize player state for existing players
      Object.keys(currentPlayers).forEach(id => {
        gameState.heroPlayed[id] = false;
        gameState.heroPlayedCount[id] = 0;
        if (gameState.players[id]) {
          gameState.players[id].discardFinished = false;
          gameState.players[id].hand = [];
        }
      });
      io.emit('init', gameState);
    });
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
