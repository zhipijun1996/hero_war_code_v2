export type GameCommand =
  | { type: 'play_card'; payload: { cardId: string; targetCastleIndex?: number; targetId?: string } }
  | { type: 'revive_hero'; payload: { heroCardId: string; targetCastleIndex: number } }
  | { type: 'hire_hero'; payload: { cardId: string; goldAmount: number; targetCastleIndex?: number } }
  | { type: 'move_token_to_cell'; payload: { tokenId: string; q: number; r: number } }
  | { type: 'click_action_token'; payload: { tokenId: string } }
  | { type: 'select_action_category'; payload: { category: string } }
  | { type: 'select_common_action'; payload: { action: string } }
  | { type: 'select_hero_for_action'; payload: { tokenId: string } }
  | { type: 'select_hero_action'; payload: { action: string } }
  | { type: 'select_target'; payload: { targetId: string } }
  | { type: 'pass_action' }
  | { type: 'finish_action' }
  | { type: 'declare_defend' }
  | { type: 'declare_counter' }
  | { type: 'pass_defend' }
  | { type: 'discard_card'; payload: { cardId: string } }
  | { type: 'finish_discard' }
  | { type: 'pass_shop' }
  | { type: 'proceed_phase' };