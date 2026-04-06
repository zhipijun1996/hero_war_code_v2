import React from 'react';
import { Socket } from 'socket.io-client';
import { GameState } from '../../shared/types';
import { pixelToHex } from '../../shared/utils/hexUtils';
import { HEROES_DATABASE } from '../../shared/config/heroes';
import { SkillEngine } from '../../logic/skills/skillEngine';
import { SkillContext } from '../../logic/skills/types';
import { skillRegistry } from '../../logic/skills/skillRegistry';

interface ActionPanelProps {
  gameState: GameState;
  playerIndex: number;
  playerId: string;
  socket: Socket;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  gameState,
  playerIndex,
  playerId,
  socket,
}) => {
  const isActivePlayer = gameState.activePlayerIndex === playerIndex;
  const isPlayer1 = playerIndex === 0;

  if (!isActivePlayer && gameState.phase !== 'supply' && gameState.phase !== 'end' && gameState.phase !== 'discard') return null;

  const renderHireUI = () => {
    const goldY = isPlayer1 ? 550 : -700;
    const goldCounter = (gameState.counters || []).find(c => c && c.type === 'gold' && Math.abs(c.y - goldY) < 100);
    const maxGold = goldCounter ? goldCounter.value : 0;
    const costs = [2, 3, 4, 5, 6, 7, 8, 9].filter(c => c <= maxGold);
    const hireableHeroes = gameState.hireAreaCards;
    const hireCardId = gameState.selectedTargetId;
    const playerCastles = gameState.map?.castles?.[playerIndex as 0 | 1] || [];
    const freeCastleIdx = playerCastles.map((castle, index) => {
      const occupied = (gameState.tokens || []).some(token => {
        if (!token) return false;
        const tokenHex = pixelToHex(token.x, token.y);
        return tokenHex.q === castle.q && tokenHex.r === castle.r;
      });
      return occupied ? null : index;
    }).filter((v): v is number => v !== null)

    return (
      <div className="flex flex-col gap-4 items-center">
        <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择雇佣英雄和费用和王城 (Select hero and cost)</div>
        
        <div className="flex gap-2 flex-wrap justify-center">
          {hireableHeroes?.map(hero => hero && (
            <button 
              key={hero.id}
              onClick={() => socket.emit('select_target', hero.id)}
              className={`px-4 py-2 rounded-lg font-bold transition-all ${hireCardId === hero.id ? 'bg-blue-500 text-white scale-110 shadow-lg shadow-blue-500/50' : 'bg-blue-900/50 text-blue-200 hover:bg-blue-800'}`}
            >
              {hero.heroClass || hero.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap justify-center">
          {costs?.map(cost => (
            <button 
              key={cost}
              onClick={() => socket.emit('select_hire_cost', cost)}
              className={`px-4 py-2 rounded-lg font-bold transition-all ${!hireCardId ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : gameState.selectedHireCost === cost ? 'bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-500/50' : 'bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800'}`}
              disabled={!hireCardId}
            >
              {cost} 金币
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap justify-center">
          {freeCastleIdx.map(castle => castle != null && (
            <button 
              key={castle}
              onClick={() => socket.emit('select_hire_castle', castle)}
              className={`px-4 py-2 rounded-lg font-bold transition-all ${!hireCardId ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : gameState.selectedHireCastle === castle ? 'bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-500/50' : 'bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800'}`}
            >
              王城 {castle}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          <button 
            onClick={() => socket.emit('hire_hero', { cardId: hireCardId, goldAmount: gameState.selectedHireCost ,targetCastleIndex: gameState.selectedHireCastle})}
            className={`px-4 py-2 rounded-lg font-bold transition-all ${(!hireCardId || gameState.selectedHireCost == null || gameState.selectedHireCastle == null) ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-pink-600 hover:bg-pink-500 text-white'}`}
            disabled={!hireCardId || gameState.selectedHireCost == null || gameState.selectedHireCastle == null}
          >
            确认雇佣 (Confirm Hire)
          </button>
          <button onClick={() => socket.emit('cancel_hire_selection')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
            取消 (Cancel)
          </button>
        </div>
      </div>
    );
  };

  if (gameState.phase === 'skill_interrupt_prompt') {
    const prompt = gameState.pendingSkillPrompt;
    if (prompt && prompt.playerIndex === playerIndex) {
      return (
        <div className="flex flex-col gap-2 items-center">
          <div className="text-white font-bold">{prompt.context?.message || '是否使用技能？'}</div>
          <div className="flex gap-4">
            <button onClick={() => socket.emit('skill_interrupt_response', true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
              是 (Yes)
            </button>
            <button onClick={() => socket.emit('skill_interrupt_response', false)} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              否 (No)
            </button>
          </div>
        </div>
      );
    } else {
      return (
        <div className="text-zinc-400 font-bold">
          等待其他玩家响应技能...
        </div>
      );
    }
  }

  if (gameState.phase === 'action_play') {
    return (
      <button onClick={() => socket.emit('pass_action')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
        Pass
      </button>
    );
  }
  
  if (gameState.phase === 'action_play_enhancement') {
    return (
      <button onClick={() => socket.emit('pass_enhancement')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
        跳过强化 (Pass Enhancement)
      </button>
    );
  }

  if (gameState.phase === 'action_resolve') {
    if (gameState.activeActionType === 'move' || gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
      return (
        <div className="flex gap-4">
          <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
            {gameState.lastPlayedCardId ? '撤回 (Undo)' : '返回 (Back)'}
          </button>
          <button onClick={() => socket.emit('finish_action')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
            结束结算
          </button>
        </div>
      );
    }
    if (gameState.activeActionType === 'attack' || gameState.selectedOption === 'attack') {
      return (
        <div className="flex gap-4 flex-wrap justify-center">
          <button
            onClick={() => socket.emit('undo_play')}
            className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold"
          >
            {gameState.lastPlayedCardId ? '撤回 (Undo)' : '返回 (Back)'}
          </button>
        </div>
      );
    }
    if (gameState.activeActionType === 'evolve') {
      return (
        <div className="flex gap-4 flex-wrap justify-center">
          <button
            onClick={() => socket.emit('undo_play')}
            className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold"
          >
            {gameState.lastPlayedCardId ? '撤回 (Undo)' : '返回 (Back)'}
          </button>
          
          <button
            onClick={() => socket.emit('finish_action')}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold"
          >
            确认进化
          </button>
        </div>
      );
    }
    return (
      <div className="flex gap-4 flex-wrap justify-center">
        <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
          {gameState.lastPlayedCardId ? '撤回 (Undo)' : '返回 (Back)'}
        </button>
        <button onClick={() => socket.emit('finish_action')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
          完成结算 (Finish Resolve)
        </button>
      </div>
    );
  }

  if ((gameState.phase as string) === 'action_play_enhancement') {
    return (
      <div className="flex flex-col gap-4 items-center">
        <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择一张手牌增强行动 (Select a card to enhance action)</div>
        <div className="flex gap-4">
          <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
            返回 (Back)
          </button>
        </div>
      </div>
    );
  }
  if ((gameState.phase as string) === 'action_select_skill') {
    const context: SkillContext = {
      gameState,
      playerIndex,
      sourceTokenId: gameState.activeHeroTokenId!
    };
    const activeSkills = SkillEngine.getActiveSkillOptions(context);

    return (
      <div className="flex flex-col gap-4 items-center w-full max-w-md">
        <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-center">
          请选择要使用的技能 (Select a skill)
        </div>
        <div className="flex flex-col gap-2 w-full">
          {activeSkills.map(skill => (
            <button
              key={skill.skillId}
              onClick={() => {
                if (skill.targetType === 'none') {
                  socket.emit('use_skill', { skillId: skill.skillId });
                } else {
                  socket.emit('select_skill_target', { skillId: skill.skillId });
                }
              }}
              disabled={!skill.isAvailable}
              className={`px-4 py-3 rounded-lg font-bold text-sm text-left flex flex-col gap-1 ${
                skill.isAvailable 
                  ? 'bg-purple-600 hover:bg-purple-500 text-white' 
                  : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              }`}
            >
              <div className="flex justify-between items-center">
                <span>【{skill.name}】</span>
                {!skill.isAvailable && skill.reason && (
                  <span className="text-xs text-red-300 font-normal">{skill.reason}</span>
                )}
              </div>
              <span className="text-xs font-normal opacity-80">{skill.description}</span>
            </button>
          ))}
          {activeSkills.length === 0 && (
            <div className="text-zinc-400 text-sm text-center py-4">
              当前英雄没有可用的主动技能
            </div>
          )}
        </div>
        <button onClick={() => socket.emit('undo_play')} className="w-full py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold text-sm mt-2">
          返回上一级 (Undo)
        </button>
      </div>
    );
  }

  if ((gameState.phase as string) === 'action_select_skill_target') {
    const skillName = skillRegistry?.getSkill(gameState.activeSkillId || '')?.name || '技能';
    return (
      <div className="flex flex-col gap-4 items-center w-full max-w-md">
        <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-center">
          请在地图上选择【{skillName}】的目标
        </div>
        <button onClick={() => socket.emit('undo_play')} className="w-full py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold text-sm mt-2">
          返回上一级 (Undo)
        </button>
      </div>
    );
  }

  if ((gameState.phase as string) === 'action_options') {
    return (
      <div className="flex flex-col gap-4 items-center w-full max-w-md">
        <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-center">请选择行动方式 (Select action type)</div>
        <div className="grid grid-cols-2 gap-2 w-full">
          <button onClick={() => socket.emit('select_action_category', 'play_card')} className="px-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm">打出手牌增强</button>
          <button onClick={() => socket.emit('select_action_category', 'direct_action')} className="px-2 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm">直接行动</button>
          <button onClick={() => socket.emit('select_action_category', 'common_action')} className="px-2 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-sm">通用动作</button>
          <button onClick={() => socket.emit('select_action_category', 'pass')} className="px-2 py-3 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold text-sm">跳过 (Pass)</button>
        </div>
        <button onClick={() => socket.emit('cancel_action_token')} className="w-full py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg font-bold border border-red-500/30 text-sm">取消 (Cancel)</button>
      </div>
    );
  }

  if ((gameState.phase as string) === 'action_select_hero' || (gameState.phase as string) === 'action_select_substitute') {
    const substituteHeroes = (gameState.tokens || []).filter(t => {
      if (!t || !t.boundToCardId) return false;
      if (t.id === gameState.activeHeroTokenId) return false;
      const heroCard = (gameState.tableCards || []).find(c => c && c.id === t.boundToCardId);
      if (!heroCard) return false;
      const isMine =
        (playerIndex === 0 && heroCard.y > 0) ||
        (playerIndex === 1 && heroCard.y < 0);
      const isDead = (gameState.counters || []).some(counter =>
        counter &&
        counter.type === 'time' &&
        counter.boundToCardId === t.boundToCardId
      );
      return isMine && !isDead;
    });

    return (
      <div className="flex flex-col gap-4 items-center">
        <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择另一个英雄机型行动 (Select a hero)</div>
        <div className="flex gap-2 flex-wrap justify-center">
          {substituteHeroes.map(hero => {
            const heroCard = (gameState.tableCards || []).find(c => c && c.id === hero.boundToCardId);
            return (
              <button 
                key={hero.id}
                onClick={() => socket.emit('select_hero_for_action', hero.id)} 
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold"
              >
                {heroCard?.heroClass || '英雄'}
              </button>
            );
          })}
          <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg font-bold border border-red-500/30">取消 (Cancel)</button>
        </div>
      </div>
    );
  }
  if ((gameState.phase as string) === 'action_select_action') {
    const selectedToken = (gameState.tokens || []).find(t => t && t.id === gameState.activeHeroTokenId);
    const boundCard = selectedToken?.boundToCardId ? 
      Object.values(gameState.players || {}).flatMap((p: any) => p?.hand || []).find((c: any) => c && c.id === selectedToken.boundToCardId) ||
      (gameState.tableCards || []).find(c => c && c.id === selectedToken.boundToCardId)
      : null;
    const heroClass = boundCard?.heroClass || selectedToken?.label?.split(' ')[0];
    const level = boundCard?.level || selectedToken?.lv || 1;
    const heroData = heroClass ? HEROES_DATABASE.heroes.find(h => h.name === heroClass) : null;
    const levelData = heroData ? heroData.levels[level.toString()] : null;

    return (
      <div className="flex flex-col gap-4 items-center w-full max-w-md">
        <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-center">
          请选择 {heroClass} (Lv.{level}) 的行动类型
        </div>
        <div className="flex gap-2 flex-wrap justify-center w-full">
          <button onClick={() => socket.emit('select_hero_action', 'move')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm">移动 (Move)</button>
          <button onClick={() => socket.emit('select_hero_action', 'attack')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-sm">攻击 (Attack)</button>
          <button onClick={() => socket.emit('select_hero_action', 'skill')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm">技能 (Skill)</button>
          <button onClick={() => socket.emit('select_hero_action', 'evolve')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-sm">进化 (Evolve)</button>
          {(() => {
            if (!selectedToken) return false;
            const hex = pixelToHex(selectedToken.x, selectedToken.y);
            const mc = (gameState.magicCircles || []).find(m => m && m.q === hex.q && m.r === hex.r);
            return mc && mc.state === 'idle';
          })() && (
            <button onClick={() => socket.emit('select_hero_action', 'chant')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm">咏唱 (Chant)</button>
          )} 
          {(() => {
            if (!selectedToken) return false;
            const hex = pixelToHex(selectedToken.x, selectedToken.y);
            const mc = (gameState.magicCircles || []).find(m => m && m.q === hex.q && m.r === hex.r);
            return mc && mc.state === 'chanting' && mc.chantingTokenId === selectedToken?.id;
          })() && (
            <button onClick={() => socket.emit('select_hero_action', 'fire')} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold text-sm">开火 (Fire)</button>
          )}
          <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold text-sm">返回 (Back)</button>
        </div>
        {levelData && levelData?.skills?.length > 0 && (
          <div className="bg-black/60 p-3 rounded-lg border border-purple-500/30 w-full">
            <div className="text-purple-300 text-xs font-bold mb-2 uppercase tracking-wider">当前技能 (Current Skills)</div>
            <div className="flex flex-col gap-2">
              {levelData?.skills?.map((skill, idx) => (
                <div key={idx} className="text-white text-xs">
                  <span className="font-bold text-purple-400">【{skill.name}】</span>: {skill.description}
                </div> 
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  if ((gameState.phase as string) === 'action_common') {
    return (
      <div className="flex flex-col gap-4 items-center w-full max-w-md">
        <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-center">请选择通用动作 (Select common action)</div>
        <div className="flex gap-2 flex-wrap justify-center">
          <button onClick={() => socket.emit('select_common_action', 'open_chest')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-sm">开启宝箱</button>
          <button onClick={() => socket.emit('select_common_action', 'early_buy')} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold text-sm">提前购买</button>
          <button onClick={() => socket.emit('select_common_action', 'seize_initiative')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm">抢占先手</button>
          <button onClick={() => socket.emit('select_common_action', 'hire')} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-bold text-sm">招募英雄</button>
          <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold text-sm">返回 (Back)</button>
        </div>
      </div>
    );
  }
  if (gameState.phase === 'action_defend') {
    const hasDefenseCard = !!gameState.hasDefenseCard;
    const canCounterAttack = !!gameState.canCounterAttack;
    if (hasDefenseCard) {
      return (
        <div className="flex gap-4">
          <button onClick={() => socket.emit('declare_defend')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
            确认防御
          </button>
          <button onClick={() => socket.emit('declare_counter')} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold">
            确认反击
          </button>
          <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
            {gameState.lastPlayedCardId ? '撤回 (Undo)' : '返回 (Back)'}
          </button>
        </div>
      );
    }
    return (
      <div className="flex gap-4">
        <button onClick={() => socket.emit('pass_defend')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
          放弃防御 (Pass)
        </button>
      </div>
    );
  }
  if (gameState.phase === 'shop') {
    return (
      <div className="flex gap-4">
        <button onClick={() => socket.emit('start_buy')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold">
          购买
        </button>
        <button onClick={() => socket.emit('start_hire')} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-bold">
          雇佣
        </button>
        <button onClick={() => socket.emit('pass_shop')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
          Pass
        </button>
      </div>
    );
  }
  if (gameState.phase === 'hire') {
    return renderHireUI();
  }
  if (gameState.phase === 'buy') {
    return (
      <div className="flex gap-4">
        <button onClick={() => socket.emit('pass_shop')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold">
          Pass
        </button>
      </div>
    );
  }
  if (gameState.phase === 'discard') {
    const myPlayer = (gameState.players || {})[playerId];
    if (myPlayer) {
      return (
        <div className="flex flex-col gap-4 items-center">
          {(myPlayer?.hand?.length || 0) > 5 ? (
            <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请弃牌至5张以下 (Discard down to 5 cards)</div>
          ) : (
            <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">手牌已就绪，请点击结束弃牌</div>
          )}
          <div className="flex gap-4">
            <button 
              onClick={() => socket.emit('undo_discard')} 
              disabled={myPlayer.discardFinished}
              className={`px-4 py-2 rounded-lg font-bold ${myPlayer.discardFinished ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-zinc-600 hover:bg-zinc-500 text-white'}`}
            >
              撤回弃牌
            </button>
            <button 
              onClick={() => socket.emit('finish_discard')} 
              disabled={(myPlayer?.hand?.length || 0) > 5 || myPlayer.discardFinished}
              className={`px-4 py-2 rounded-lg font-bold ${(myPlayer?.hand?.length || 0) > 5 || myPlayer.discardFinished ? 'bg-zinc-500 text-zinc-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
            >
              结束弃牌
            </button>
          </div>
        </div>
      );
    } else {
      return (
        <div className="text-white font-bold bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">等待对方弃牌... (Waiting for opponent...)</div>
      );
    }
  }

  return null;
};
