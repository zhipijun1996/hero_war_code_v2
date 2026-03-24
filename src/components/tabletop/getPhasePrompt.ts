import { GameState } from '../../shared/types';

interface GetPhasePromptParams {
  gameState: GameState;
  playerIndex: number;
  playerId: string;
  selectedHeroCardId: string | null;
}

export const getPhasePrompt = ({
  gameState,
  playerIndex,
  playerId,
  selectedHeroCardId,
}: GetPhasePromptParams): string => {
  const isActivePlayer = gameState.activePlayerIndex === playerIndex;

  if (gameState.phase === 'setup') {
    const playedCount = gameState.heroPlayedCount[playerId] || 0;
    if (playerIndex !== -1 && playedCount < 2) {
      if (selectedHeroCardId) {
        return "准备阶段：请点击地图上的王城🏰以部署英雄";
      }
      return `准备阶段：请从手牌选择第 ${playedCount + 1} 个初始英雄`;
    } else if (playerIndex !== -1 && playedCount >= 2) {
      return "准备阶段：等待对手选择初始英雄";
    }
    return "准备阶段：等待双方选择初始英雄";
  }

  const activePlayerStr = `玩家${gameState.activePlayerIndex + 1}`;
  const inactivePlayerStr = `玩家${1 - gameState.activePlayerIndex + 1}`;
  
  if (gameState.phase === 'action_play') {
    return `行动阶段：请${activePlayerStr}点击行动Token`;
  }
  if (gameState.phase === 'action_options') {
    return `请选择行动方式 (Select action type)`;
  }
  if (gameState.phase === 'action_common') {
    return `请选择通用动作 (Select common action)`;
  }
  //if (gameState.phase === 'action_select_card') {
  //  return `请选择一张手牌进行行动 (Select a card for action)`;
  //}
  if (gameState.phase === 'action_select_hero') {
    return `请选择一个英雄进行行动 (Select a hero for action)`;
  }
  if (gameState.phase === 'action_select_action') {
    return `请选择英雄的行动 (Select hero action)`;
  }
  if (gameState.phase === 'action_play_enhancement') {
    return `请打出一张强化卡或跳过 (Play an enhancement card or pass)`;
  }
  if (gameState.phase === 'action_select_substitute') {
    return `请选择替身英雄 (Select substitute hero)`;
  }
  if (gameState.phase === 'action_resolve') {
    if (gameState.activePlayerIndex !== playerIndex) return `等待对方结算行动 (Waiting for opponent to resolve action)`;
    if (gameState.activeActionType === 'move') {
      return `请选择移动目标格子 (Select target hex for movement)`;
    } else if (gameState.activeActionType === 'attack') {
      return `请选择攻击目标 (Select attack target)`;
    } else if (gameState.activeActionType === 'skill') {
      return `请结算技能 (Resolve skill)`;
    } else if (gameState.activeActionType === 'evolve') {
      return `请结算进化 (Resolve evolve)`;
    }
    return `请结算行动 (Resolve action)`;
  }
  if (gameState.phase === 'action_select_option') {
    if (gameState.activePlayerIndex !== playerIndex) return `等待对方选择行动 (Waiting for opponent to select action)`;
    if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
      if (!gameState.selectedTokenId) return "请选择一个英雄Token进行移动 (Select a hero token to move)";
      const token = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
      return `正在移动 ${token?.label || '英雄'} (剩余移动力: ${gameState.remainingMv}) | Moving ${token?.label || 'Hero'} (Remaining MV: ${gameState.remainingMv})`;
    }
    if (!gameState.selectedOption) {
      return `请选择行动选项 (Select Action Option)`;
    } else if (gameState.selectedOption === 'heal') {
      if (!gameState.selectedTargetId) {
        return `回复：请在桌面上选择一个要回复的英雄 (Heal: Select a hero on the table)`;
      } else {
        return `已选择回复目标，请点击完成结算 (Target selected, click Finish Resolve)`;
      }
    } else if (gameState.selectedOption === 'evolve') {
      if (!gameState.selectedTargetId) {
        return `进化：请在桌面上选择一个要进化的英雄 (Evolve: Select a hero on the table)`;
      } else {
        return `已选择进化目标，请点击完成结算 (Target selected, click Finish Resolve)`;
      }
    } else if (gameState.selectedOption === 'seize') {
      return `抢先手：点击完成结算以获得下回合先手 (Seize: Click Finish Resolve to get initiative)`;
    } else if (gameState.selectedOption === 'move') {
      if (gameState.selectedTokenId) {
        return `已选择英雄，请点击高亮的格子以移动 (Hero selected, click a highlighted cell to move)`;
      }
      return `移动：请选择一个己方英雄 (Move: Select a hero)`;
    } else if (gameState.selectedOption === 'attack') {
      if (gameState.selectedTokenId) {
        return `已选择英雄，请点击高亮的攻击目标 (Hero selected, click a highlighted target)`;
      }
      return `攻击：请选择一个己方英雄 (Attack: Select a hero)`;
    } else if (gameState.selectedOption === 'buy') {
      return `购买：请点击商店区的装备卡进行购买 (Buy: Click an equipment card in the shop area)`;
    } else if (gameState.selectedOption === 'hire') {
      if (gameState.selectedTargetId && gameState.selectedHireCost) {
        return "请点击地图上的王城🏰以部署雇佣的英雄";
      }
      return `雇佣：请选择一个英雄并支付金币 (Hire: Select a hero and pay gold)`;
    } else if (gameState.selectedOption === 'chant') {
      return `咏唱：请选择在魔法阵上的己方英雄 (Chant: Select a hero on a magic circle)`;
    } else if (gameState.selectedOption === 'fire') {
      return `开火：请选择正在咏唱的己方英雄 (Fire: Select a chanting hero)`;
    } else if (gameState.selectedOption === 'turret_attack') {
      if (gameState.selectedTokenId) {
        return `已选择英雄，请点击高亮的攻击目标 (Hero selected, click a highlighted target)`;
      }
      return `炮台攻击：请选择在炮台上的己方英雄 (Turret Attack: Select a hero on a turret)`;
    }
    return `结算阶段：请${activePlayerStr}结算场面`;
  }
  if (gameState.phase === 'action_defend') {
    const hasDefenseCard = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
    if (hasDefenseCard) {
      return `防御阶段：已打出防御卡，请选择确认防御或反击 (Defense card played, choose Confirm or Counter)`;
    }
    return `防御阶段：请${activePlayerStr}打出防御卡或Pass (Play a defense card or Pass)`;
  }
  if (gameState.phase === 'action_resolve_attack') {
    return `攻击结算：请${activePlayerStr}结算攻击`;
  }
  if (gameState.phase === 'action_resolve_attack_counter') {
    return `攻击结算：请${activePlayerStr}结算攻击 (Settle attack)`;
  }
  if (gameState.phase === 'action_resolve_counter') {
    return `反击结算：请${activePlayerStr}结算反击 (Settle counter-attack)`;
  }
  if (gameState.phase === 'shop') {
    if (gameState.selectedTargetId && gameState.selectedHireCost) {
      return "请点击地图上的王城🏰以部署雇佣的英雄";
    } else if (gameState.selectedTargetId) {
      return "请选择雇佣成本 (Select hire cost)";
    }
    return `商店阶段：请${activePlayerStr}购买装备或雇佣英雄`;
  }
  if (gameState.phase === 'revival') {
    const pending = gameState.pendingRevivals?.find(r => r.playerIndex === playerIndex);
    if (pending) {
      const hero = gameState.tableCards.find(c => c.id === pending.heroCardId);
      return `复活阶段：请点击地图上的王城🏰以复活 ${hero?.heroClass || '英雄'}`;
    }
    return `复活阶段：等待对方复活英雄...`;
  }
  if (gameState.phase === 'supply') {
    return `补给阶段：双方抽取卡牌（英雄数+1）`;
  }
  if (gameState.phase === 'discard') {
    return `弃牌阶段：请检查手牌并弃掉多余卡牌`;
  }
  if (gameState.phase === 'end') {
    return `结束阶段：时间计数+1`;
  }
  return "";
};
