export interface Card {
  id: string;
  frontImage: string;
  backImage: string;
  type: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero';
  heroClass?: string;
  level?: number;
  name?: string;
}

export interface TableCard extends Card {
  x: number;
  y: number;
  faceUp: boolean;
  damage?: number;
  xp?: number;
  level?: number;
  maxHP?: number;
}

export interface ActionCard extends Card {
  type: 'action';
}

export interface HeroCard extends Card {
  type: 'hero';
  heroClass: string;
}

export interface Token {
  id: string;
  x: number;
  y: number;
  image: string;
  label?: string;
  lv: number;
  time: number;
  boundToCardId?: string;
  heroClass?: string;
  type?: 'hero' | 'monster' | 'chest' | 'castle' | 'obstacle';
} 

export interface Counter {
  id: string;
  x: number;
  y: number;
  value: number;
  type: 'gold' | 'exp' | 'damage' | 'time' | 'level';
  boundToCardId?: string;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  isBot?: boolean;
  botDifficulty?: number;
  discardHistory?: Card[];
  discardFinished?: boolean;
}

export interface ImageConfig {
  heroTokens: string[];
  heroCards: string[];
  actionCards: string[];
  t1Cards: string[];
  t2Cards: string[];
  t3Cards: string[];
}

export interface PendingRevival {
  heroCardId: string;
  playerIndex: number;
}

export interface ActionToken {
  id: string;
  playerIndex: number;
  heroCardId: string | null; // null for universal token
  heroClass?: string;
  used: boolean;
  x: number;
  y: number;
}

export type GamePhase = 
  | 'setup' 
  | 'action_play' 
  | 'action_options' 
  | 'action_select_hero' 
  | 'action_select_action' 
  | 'action_play_enhancement' 
  | 'action_select_substitute' 
  | 'action_resolve' 
  | 'shop' 
  | 'supply' 
  | 'discard' 
  | 'end' 
  | 'revival' 
  | 'hire'   
  | 'buy'    
  | 'action_defend' 
  | 'action_resolve_attack' 
  | 'action_resolve_attack_counter' 
  | 'action_common' 
  | 'action_select_skill'
  | 'action_play_defense'
  ;

export interface MovementStep {
  tokenId: string;
  fromX: number;
  fromY: number;
  mvCost: number;
  wasChanting?: boolean;
}

export interface GameLog {
  id: string;
  round: number;
  playerIndex: number;
  message: string;
  timestamp: number;
}

export interface MagicCircle {
  q: number;
  r: number;
  state: 'idle' | 'chanting';
  chantingTokenId?: string;
}

export interface HexCoord {
  q: number;
  r: number;
}

export interface MapConfig {
  name: string;
  crystal: HexCoord[];
  castles: { 0: HexCoord[], 1: HexCoord[] };
  chests: { q: number, r: number, type: 'T1' | 'T2' }[];
  monsters: { q: number, r: number, level: number }[];
  magicCircles: HexCoord[];
  traps: HexCoord[];
  turrets: HexCoord[];
  watchtowers: HexCoord[];
  obstacles: HexCoord[];
  water: HexCoord[];
  bushes: HexCoord[];
  obstacles_v2?: HexCoord[];
}

export interface Skill {
  name: string;
  description: string;
  type?: 'active' | 'passive' | 'trigger';
  cost?: number;
}

export interface HeroLevelData {
  hp: number;
  ar: number;
  mv: number;
  xp: number;
  atk?: number;
  skills: Skill[];
}

export interface HeroData {
  id: string;
  name: string;
  levels: {
    [level: string]: HeroLevelData;
  };
}

export interface HeroesDatabase {
  heroes: HeroData[];
}

export interface GameState {
  map?: MapConfig;
  gameStarted: boolean;
  seats: (string | null)[];
  players: Record<string, Player>;
  tokens: Token[];
  tableCards: TableCard[];
  hireAreaCards: TableCard[];
  playAreaCards: TableCard[];
  decks: {
    treasure1: Card[];
    treasure2: Card[];
    treasure3: Card[];
    action: Card[];
    hero: Card[];
  };
  discardPiles: {
    action: Card[];
  };
  counters: Counter[];
  imageConfig?: ImageConfig;
  heroPlayed: Record<string, boolean>;
  heroPlayedCount: Record<string, number>;
  round: number;
  firstPlayerIndex: number;
  activePlayerIndex: number;
  phase: GamePhase;
  consecutivePasses: number;
  shopPasses: number;
  comboState?: 'spy_resolve' | null;
  comboCardId?: string | null;
  lastPlayedCardId?: string | null;
  pendingDefenseCardId?: string | null;
  hasDefenseCard?: boolean;
  canCounterAttack?: boolean;
  attackInitiatorIndex?: number | null;
  selectedOption?: string | null;
  selectedTargetId?: string | null;
  selectedHireCost?: number | null;
  selectedHireCastle?: number | null;
  hireSource?: 'shop' | 'action_common' | null;
  buySource?: 'shop' | 'action_common' | null;  
  hasSeizedInitiative?: boolean;
  canEvolve?: boolean;
  evolvableHeroIds?: string[];
  healableHeroIds?: string[];
  notification?: string | null;
  selectedTokenId?: string | null;
  remainingMv?: number;
  reachableCells?: { q: number, r: number, targetType?: 'hero' | 'castle' | 'empty' | 'monster' }[];
  movedTokens?: Record<string, { x: number, y: number }>;
  lastEvolvedId?: string | null;
  movementHistory?: MovementStep[];
  castleHP: Record<number, number>;
  reputation: Record<number, number>;
  roundActionCounts: Record<string, number>;
  globalMovementMovedTokens?: string[];
  magicCircles: MagicCircle[];
  pendingRevivals?: PendingRevival[];
  logs: GameLog[];
  actionTokens: ActionToken[];
  activeActionTokenId?: string | null;
  activeActionType?: 'move' | 'attack' | 'skill' | 'evolve' | 'chant' | 'fire' | null;
  activeEnhancementCardId?: string | null;
  activeHeroTokenId?: string | null;
  isCounterAttack?: boolean;
  isDefended?: boolean;
}
