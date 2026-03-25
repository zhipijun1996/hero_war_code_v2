import { vi } from 'vitest';
import { GameState, Card, TableCard, Token, Counter, ActionToken } from '../../shared/types';

export const createMockGameState = (): GameState => ({
  gameStarted: true,
  seats: ['player1', 'player2'],
  players: {
    'player1': { id: 'player1', name: 'Player 1', hand: [] },
    'player2': { id: 'player2', name: 'Player 2', hand: [] }
  },
  tokens: [],
  tableCards: [],
  hireAreaCards: [],
  playAreaCards: [],
  decks: {
    treasure1: [],
    treasure2: [],
    treasure3: [],
    action: [],
    hero: []
  },
  discardPiles: {
    action: []
  },
  counters: [],
  heroPlayed: { 'player1': false, 'player2': false },
  heroPlayedCount: { 'player1': 0, 'player2': 0 },
  round: 1,
  firstPlayerIndex: 0,
  activePlayerIndex: 0,
  phase: 'setup',
  consecutivePasses: 0,
  shopPasses: 0,
  castleHP: { 0: 3, 1: 3 },
  reputation: { 0: 0, 1: 0 },
  roundActionCounts: {},
  magicCircles: [],
  logs: [],
  actionTokens: [],
  map: {
    name: 'Test Map',
    crystal: { q: 0, r: 0 },
    castles: { 
      0: [{ q: -5, r: 0 }], 
      1: [{ q: 5, r: 0 }] 
    },
    chests: [],
    monsters: [],
    magicCircles: [],
    traps: [],
    turrets: [],
    watchtowers: [],
    obstacles: [],
    water: [],
    bushes: []
  }
});

export const createMockHeroCard = (id: string, heroClass: string): TableCard => ({
  id,
  frontImage: '',
  backImage: '',
  type: 'hero',
  heroClass,
  level: 1,
  x: 0,
  y: 0,
  faceUp: true
});

export const createMockActionHelpers = () => ({
  addLog: vi.fn(),
  broadcastState: vi.fn(),
  checkBotTurn: vi.fn(),
  setPhase: vi.fn(),
  checkAndResetChanting: vi.fn(),
  addReputation: vi.fn(),
  checkAllTokensUsed: vi.fn(),
  updateAvailableActions: vi.fn(),
  discardOpponentCard: vi.fn(),
});
