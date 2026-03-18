import { GameState, GamePhase } from '../../shared/types';

/**
 * 阶段管理器
 */
export class PhaseManager {
  /**
   * 初始化进入某个阶段
   */
  static initPhase(gameState: GameState, phase: GamePhase): void {
    gameState.phase = phase;
    
    switch (phase) {
      case 'prepare':
        // 回合开始逻辑通常在 server.ts 的 next_turn 中
        break;
      case 'action_play':
        gameState.selectedTokenId = null;
        gameState.selectedTargetId = null;
        gameState.selectedOption = null;
        gameState.reachableCells = [];
        gameState.activeActionType = null;
        gameState.activeEnhancementCardId = null;
        break;
      case 'supply':
        // 补给阶段逻辑
        break;
      case 'end':
        // 回合结束逻辑
        break;
    }
  }

  /**
   * 获取下一个建议阶段
   */
  static getNextPhase(gameState: GameState): GamePhase {
    const current = gameState.phase;

    switch (current) {
      case 'prepare':
        return 'action_play';
      case 'action_resolve_attack':
        return 'action_play';
      case 'action_resolve_counter':
        return 'action_play';
      case 'supply':
        return 'discard';
      case 'discard':
        return 'shop';
      case 'shop':
        return 'end';
      case 'end':
        return 'prepare';
      default:
        return current;
    }
  }
}
