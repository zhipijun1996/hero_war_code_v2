import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BotStrategy, BotAction } from '../ai/botStrategy';
import { ActionEngine } from '../action/actionEngine';
import { HeroEngine } from '../hero/heroEngine';
import { createMockGameState, createMockActionHelpers } from './testState';
import { HEROES_DATABASE } from '../../shared/config/heroes';

describe('AI Simulation Test', () => {
  let gameState: any;
  let helpers: any;
  let socket: any;

  beforeEach(() => {
    gameState = createMockGameState();
    helpers = createMockActionHelpers();
    socket = {
      id: 'bot-socket',
      emit: vi.fn(),
      broadcast: { emit: vi.fn() }
    };

    // 初始化玩家为 AI
    gameState.players['player1'].isBot = true;
    gameState.players['player1'].difficulty = 1;
    gameState.players['player2'].isBot = true;
    gameState.players['player2'].difficulty = 1;
    
    // 给他们一些英雄卡用于 setup 阶段
    const heroClasses = ['战士', '弓箭手', '冰法师', '重甲兵'];
    gameState.players['player1'].hand = heroClasses.map((cls, i) => ({
      id: `h1_${i}`,
      type: 'hero',
      heroClass: cls,
      frontImage: '',
      backImage: ''
    }));
    gameState.players['player2'].hand = heroClasses.map((cls, i) => ({
      id: `h2_${i}`,
      type: 'hero',
      heroClass: cls,
      frontImage: '',
      backImage: ''
    }));

    gameState.gameStarted = true;
    gameState.phase = 'setup';
  });

  it('should not get stuck in a loop during 2-AI simulation', () => {
    const MAX_STEPS = 50;
    const STUCK_THRESHOLD = 10;
    
    let lastPhase = '';
    let lastActivePlayer = -1;
    let stuckCount = 0;
    let history: string[] = [];

    console.log('--- Starting AI Simulation ---');

    for (let i = 0; i < MAX_STEPS; i++) {
      const activePlayerIndex = gameState.activePlayerIndex;
      const action = BotStrategy.decideNextAction(gameState, activePlayerIndex, HEROES_DATABASE);
      
      const status = `Step ${i}: Player ${activePlayerIndex + 1}, Phase: ${gameState.phase}, Action: ${action.type}`;
      history.push(status);

      if (action.type === 'none' || action.type === undefined) {
        // 如果 AI 无法给出动作，且游戏未结束，可能卡住了
        if (gameState.phase !== 'end') {
          console.error('AI returned NONE action in phase: ' + gameState.phase);
          console.log('Current GameState:', JSON.stringify(gameState, null, 2));
          throw new Error(`AI stuck at step ${i}: returned NONE action in phase ${gameState.phase}`);
        }
        break;
      }

      // 检查是否卡住（Phase 和 ActivePlayer 长期不变）
      if (gameState.phase === lastPhase && activePlayerIndex === lastActivePlayer) {
        stuckCount++;
      } else {
        stuckCount = 0;
      }

      if (stuckCount >= STUCK_THRESHOLD) {
        console.error('Game flow stuck detected!');
        console.log('History:', history.slice(-10));
        console.log('Current GameState:', JSON.stringify(gameState, null, 2));
        throw new Error(`Game stuck at phase ${gameState.phase} for ${STUCK_THRESHOLD} steps`);
      }

      lastPhase = gameState.phase;
      lastActivePlayer = activePlayerIndex;

      // 模拟执行动作 (这里简化模拟，只调用核心 Engine)
      applyAction(gameState, activePlayerIndex, action, helpers, socket);
    }

    console.log('--- Simulation Finished Successfully ---');
  });

  // 辅助函数：将 BotAction 应用到 GameState
  function applyAction(gameState: any, playerIndex: number, action: BotAction, helpers: any, socket: any) {
    switch (action.type) {
      case 'play_card':
        // 模拟 play_card 逻辑
        const cardId = action.payload.cardId;
        const player = gameState.players[gameState.seats[playerIndex]];
        const cardIndex = player.hand.findIndex((c: any) => c.id === cardId);
        if (cardIndex !== -1) {
          const card = player.hand.splice(cardIndex, 1)[0];
          // 如果是英雄卡且在 setup 阶段
          if (card.type === 'hero' && gameState.phase === 'setup') {
            gameState.heroPlayedCount[gameState.seats[playerIndex]] = (gameState.heroPlayedCount[gameState.seats[playerIndex]] || 0) + 1;
            if (gameState.heroPlayedCount[gameState.seats[playerIndex]] === 2) {
              gameState.heroPlayed[gameState.seats[playerIndex]] = true;
            }
            // 检查是否所有人都放完了
            const allPlayed = gameState.seats.filter((id: any) => id !== null).every((id: any) => gameState.heroPlayed[id]);
            if (allPlayed) {
              gameState.phase = 'action_play';
              gameState.activePlayerIndex = 0;
            } else {
              // 轮到下一个玩家
              gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.seats.length;
            }
          }
        }
        break;
      case 'select_action_category':
        ActionEngine.selectActionCategory(gameState, playerIndex, action.payload.category as any, helpers, socket);
        break;
      case 'select_common_action':
        ActionEngine.selectCommonAction(gameState, playerIndex, action.payload.action as any, helpers, socket);
        break;
      case 'finish_action':
        ActionEngine.finishAction(gameState, playerIndex, helpers, socket);
        break;
      case 'pass_action':
        ActionEngine.passAction(gameState, playerIndex, helpers, socket);
        break;
      case 'hire_hero':
        HeroEngine.hireHero(gameState, playerIndex, action.payload.cardId, action.payload.goldAmount, action.payload.targetCastleIndex, helpers);
        break;
      case 'move_token_to_cell':
        ActionEngine.moveTokenToCell(gameState, playerIndex, action.payload.q, action.payload.r, helpers, socket);
        break;
      case 'click_action_token':
        ActionEngine.clickActionToken(gameState, playerIndex, action.payload.tokenId, helpers, socket);
        break;
      case 'select_hero_for_action':
        ActionEngine.selectHeroForAction(gameState, playerIndex, action.payload.tokenId, helpers, socket);
        break;
      case 'select_hero_action':
        ActionEngine.selectHeroAction(gameState, playerIndex, action.payload.action as any, helpers, socket);
        break;
      case 'select_target':
        ActionEngine.resolveTargetSelection(gameState, playerIndex, action.payload.targetId, helpers, socket);
        break;
      default:
        // 其他动作暂不模拟或按需添加
        break;
    }
  }
});
