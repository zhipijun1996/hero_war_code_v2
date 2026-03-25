import type { BotAction } from '../src/logic/ai/botStrategy.ts';

type DispatchDeps = {
  migratedHandlers: any;
  gameState: any;
};

export function dispatchGameCommand(
  socketLike: any,
  action: BotAction,
  deps: DispatchDeps
) {
  const { migratedHandlers, gameState } = deps;

  switch (action.type) {
    case 'play_card':
      migratedHandlers.play_card(socketLike, action.payload);
      break;

    case 'revive_hero':
      migratedHandlers.revive_hero(socketLike, action.payload);
      break;

    case 'hire_hero':
      migratedHandlers.hire_hero(socketLike, action.payload);
      break;

    case 'move_token_to_cell':
      migratedHandlers.move_token_to_cell(socketLike, action.payload);
      break;

    case 'click_action_token':
      migratedHandlers.click_action_token(socketLike, action.payload.tokenId);
      break;

    case 'select_action_category':
      migratedHandlers.select_action_category(socketLike, action.payload.category as any);
      break;

    case 'select_common_action':
      migratedHandlers.select_common_action(socketLike, action.payload.action as any);
      break;

    case 'select_hero_for_action':
      migratedHandlers.select_hero_for_action(socketLike, action.payload.tokenId);
      break;

    case 'select_hero_action':
      migratedHandlers.select_hero_action(socketLike, action.payload.action as any);
      break;

    case 'select_option':
      migratedHandlers.select_option(socketLike, action.payload.option);
      break;

    case 'select_target':
      migratedHandlers.select_target(socketLike, action.payload.targetId);
      break;

    case 'pass_action':
      if (gameState.phase === 'action_play_enhancement') {
        migratedHandlers.pass_enhancement(socketLike);
      } else {
        migratedHandlers.pass_action(socketLike);
      }
      break;

    case 'finish_action':
      migratedHandlers.finish_action(socketLike);
      break;

    case 'declare_defend':
      migratedHandlers.declare_defend(socketLike);
      break;

    case 'declare_counter':
      migratedHandlers.declare_counter(socketLike);
      break;

    case 'pass_defend':
      migratedHandlers.pass_defend(socketLike);
      break;

    case 'discard_card':
      migratedHandlers.discard_card(socketLike, action.payload.cardId);
      break;

    case 'finish_discard':
      migratedHandlers.finish_discard(socketLike);
      break;

    case 'select_hire_cost':
      migratedHandlers.select_hire_cost(socketLike, action.payload.cost);
      break;

    case 'next_shop':
      migratedHandlers.next_shop(socketLike);
      break;

    case 'pass_shop':
      migratedHandlers.pass_shop(socketLike);
      break;

    case 'none':
      if (gameState.phase === 'action_play') {
        migratedHandlers.pass_action(socketLike);
      } else if (gameState.phase === 'shop') {
        migratedHandlers.pass_shop(socketLike);
      } else if (gameState.phase === 'supply' || gameState.phase === 'end') {
        migratedHandlers.proceed_phase(socketLike);
      }
      break;

    default:
      console.warn('[dispatchGameCommand] Unhandled action:', action);
      break;
  }
}