import { GameState } from '../../shared/types/index.ts';

export type SkillKind = 'active' | 'passive' | 'semi_passive' | 'static';

export type SkillTargetType = 'none' | 'hex' | 'token';
export type SkillTarget = { q: number; r: number } | string;

export type SkillTrigger = 
  | 'onTurnStart' 
  | 'onTurnEnd' 
  | 'onAttackStart' 
  | 'onDamageTaken' 
  | 'onHeroDeath' 
  | 'onMoveEnd'
  | 'onDefended'
  | 'onCounterAttackStart'
  | 'onDamageDealt'
  | 'onKill'
  | 'onHeal'
  | 'onHeroRevive'
  | 'onKnockbackSuccess';

export interface SkillContext {
  gameState: GameState;
  playerIndex: number;
  sourceTokenId: string;
  targetTokenId?: string;
  targetHex?: { q: number; r: number };
  [key: string]: any; // For extra contextual data
}

export interface SkillHelpers {
  addLog: (message: string, playerIndex?: number) => void;
  broadcastState: () => void;
  promptPlayer?: (playerIndex: number, promptType: string, context: any) => Promise<boolean>;
  // Add more helpers as needed later
}

export interface SkillResult {
  success: boolean;
  reason?: string;
  data?: any;
}

export interface SkillUseOption {
  skillId: string;
  name: string;
  description: string;
  cost?: number; // e.g., Action points or specific resources
  isAvailable: boolean;
  reason?: string;
  targetType?: SkillTargetType;
}

export type StatType = 'hp' | 'ar' | 'mv' | 'atk' | 'xp';

export interface StatModifier {
  stat: StatType;
  value: number;
  type: 'add' | 'multiply';
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  kind: SkillKind;
  trigger?: SkillTrigger; // Used for passive/semi_passive
  
  // Target selection for active skills
  targetType?: SkillTargetType;
  getValidTargets?: (context: SkillContext) => SkillTarget[];
  
  // Condition to check if the skill can be used/triggered
  canUse?: (context: SkillContext) => boolean | { canUse: boolean; reason?: string };
  
  // Execution logic for active/semi_passive/passive
  execute?: (context: SkillContext, helpers: SkillHelpers) => SkillResult | Promise<SkillResult>;
  
  // Post-combat hook for skills that initiate combat
  afterCombat?: (context: SkillContext, combatDetails: any, helpers: SkillHelpers) => Promise<void>;
  
  // Static modifier logic
  modifiers?: StatModifier[];
  applyStaticModifier?: (baseValue: number, context: SkillContext) => number;
}
