import React from 'react';
import { Socket } from 'socket.io-client';
import { GameState } from '../../shared/types';
import { pixelToHex } from '../../shared/utils/hexUtils';
import { HEROES_DATABASE } from '../../shared/config/heroes';

interface ActionPanelProps {
  gameState: GameState;
  playerIndex: number;
  playerId: string;
  socket: Socket;
  selectedHireCardId: string | null;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  gameState,
  playerIndex,
  playerId,
  socket,
  selectedHireCardId
}) => {
  const isActivePlayer = gameState.activePlayerIndex === playerIndex;
  const isPlayer1 = playerIndex === 0;

  if (!isActivePlayer && gameState.phase !== 'supply' && gameState.phase !== 'end' && gameState.phase !== 'discard') return null;

  if (gameState.phase === 'action_play') {
    return (
      <button onClick={() => socket.emit('pass_action')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
        Pass
      </button>
    );
  }
  
  if (gameState.phase === 'action_select_action') {
    return (
      <div className="flex gap-4 flex-wrap justify-center">
        <button onClick={() => socket.emit('select_hero_action', 'move')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
          移动 (Move)
        </button>
        <button onClick={() => socket.emit('select_hero_action', 'attack')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">
          攻击 (Attack)
        </button>
        <button onClick={() => socket.emit('select_hero_action', 'skill')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold">
          技能 (Skill)
        </button>
        <button onClick={() => socket.emit('select_hero_action', 'evolve')} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold">
          进化 (Evolve)
        </button>
      </div>
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
    return (
      <div className="flex gap-4 flex-wrap justify-center">
        <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
          撤回 (Undo)
        </button>
        <button onClick={() => socket.emit('finish_action')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
          完成结算 (Finish Resolve)
        </button>
      </div>
    );
  }

  if (gameState.phase === 'action_select_option') {
    let playedCard = null;
    if (gameState.lastPlayedCardId) {
      playedCard = gameState.playAreaCards.find(c => c.id === gameState.lastPlayedCardId) || 
                   gameState.tableCards.find(c => c.id === gameState.lastPlayedCardId);
    }

    if (!gameState.selectedOption) {
      const isFirstPlayer = gameState.seats[gameState.firstPlayerIndex] === playerId;
      const canSeize = !isFirstPlayer && !gameState.hasSeizedInitiative;

      return (
        <div className="flex gap-4 flex-wrap justify-center">
          <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
            撤回
          </button>
          {canSeize && (
            <button onClick={() => socket.emit('select_option', 'seize')} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold">
              抢先手
            </button>
          )}
          {gameState.canEvolve && (
            <button onClick={() => socket.emit('select_option', 'evolve')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
              进化
            </button>
          )}
          {gameState.canHire && (
            <button onClick={() => socket.emit('select_option', 'hire')} className="px-4 py-2 bg-pink-600 hover:bg-pink-600 text-white rounded-lg font-bold">
              雇佣
            </button>
          )}
          <button onClick={() => socket.emit('select_option', 'buy')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold">
            购买
          </button>
          {gameState.tokens.some(t => t && (() => {
            const c = gameState.tableCards.find(tc => tc && tc.id === t.boundToCardId);
            const isMine = c && ((gameState.seats[0] === playerId && c.y > 0) || (gameState.seats[1] === playerId && c.y < 0));
            if (!isMine) return false;
            const isAlive = !gameState.counters.some(counter => counter && counter.type === 'time' && counter.boundToCardId === t.boundToCardId);
            if (!isAlive) return false;
            const hex = pixelToHex(t.x, t.y);
            const mc = gameState.magicCircles?.find(m => m.q === hex.q && m.r === hex.r);
            return mc && mc.state === 'idle';
          })()) && (
            <button onClick={() => socket.emit('select_option', 'chant')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
              咏唱
            </button>
          )}
          
          {playedCard && playedCard.type === 'action' && playedCard.name !== '防御' && (
            <>
              {playedCard.name === '间谍' ? (
                <button onClick={() => socket.emit('select_option', 'spy')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold">
                  间谍
                </button>
              ) : playedCard.name === '冲刺' ? (
                <button onClick={() => socket.emit('select_option', 'sprint')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
                  冲刺
                </button>
              ) : playedCard.name === '回复' ? (
                <button onClick={() => socket.emit('select_option', 'heal')} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold">
                  回复
                </button>
              ) : (
                <>
                  <button onClick={() => socket.emit('select_option', 'move')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold">
                    移动
                  </button>
                  <button onClick={() => socket.emit('select_option', 'attack')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">
                    攻击
                  </button>
                  <button onClick={() => socket.emit('select_option', 'skill')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold">
                    技能
                  </button>
                  {gameState.tokens.some(t => t && (() => {
                    const c = gameState.tableCards.find(tc => tc && tc.id === t.boundToCardId);
                    const isMine = c && ((gameState.seats[0] === playerId && c.y > 0) || (gameState.seats[1] === playerId && c.y < 0));
                    if (!isMine) return false;
                    const isAlive = !gameState.counters.some(counter => counter && counter.type === 'time' && counter.boundToCardId === t.boundToCardId);
                    if (!isAlive) return false;
                    const hex = pixelToHex(t.x, t.y);
                    const mc = gameState.magicCircles?.find(m => m.q === hex.q && m.r === hex.r);
                    return mc && mc.state === 'chanting' && mc.chantingTokenId === t.id;
                  })()) && (
                    <button onClick={() => socket.emit('select_option', 'fire')} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold">
                      开火
                    </button>
                  )}
                  {gameState.tokens.some(t => t && (() => {
                    const c = gameState.tableCards.find(tc => tc && tc.id === t.boundToCardId);
                    const isMine = c && ((gameState.seats[0] === playerId && c.y > 0) || (gameState.seats[1] === playerId && c.y < 0));
                    if (!isMine) return false;
                    const isAlive = !gameState.counters.some(counter => counter && counter.type === 'time' && counter.boundToCardId === t.boundToCardId);
                    if (!isAlive) return false;
                    const hex = pixelToHex(t.x, t.y);
                    return gameState.map?.turrets?.some(tu => tu.q === hex.q && tu.r === hex.r);
                  })()) && (
                    <button onClick={() => socket.emit('select_option', 'turret_attack')} className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg font-bold">
                      炮台攻击
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      );
    } else if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
      return (
        <div className="flex gap-4">
          <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
            撤回
          </button>
          <button onClick={() => socket.emit('finish_action')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
            结束结算
          </button>
        </div>
      );
    } else if (gameState.selectedOption === 'evolve') {
      const evolvableHeroes = gameState.tableCards.filter(c => c && gameState.evolvableHeroIds?.includes(c.id));
      
      return (
        <div className="flex flex-col gap-4 items-center">
          <div className="flex gap-2 flex-wrap justify-center">
            {evolvableHeroes.map(hero => (
              <button 
                key={hero.id}
                onClick={() => socket.emit('select_target', hero.id)}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${gameState.selectedTargetId === hero.id ? 'bg-blue-500 text-white ring-2 ring-white' : 'bg-blue-900/50 text-blue-200 hover:bg-blue-800'}`}
              >
                {hero.heroClass} (Lv{hero.level} {'->'} Lv{hero.level! + 1})
              </button>
            ))}
          </div>
          <div className="flex gap-4 flex-wrap justify-center">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
          </div>
        </div>
      );
    } else if (gameState.selectedOption === 'hire') {
      return (
        <div className="flex flex-col gap-4 items-center">
          <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择雇佣费用 (Select hire cost)</div>
          <div className="flex gap-2 flex-wrap justify-center">
            {[2, 3, 4, 5, 6, 7, 8, 9].map(cost => (
              <button 
                key={cost}
                onClick={() => socket.emit('select_hire_cost', cost)}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${!gameState.selectedTargetId ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : gameState.selectedHireCost === cost ? 'bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-500/50' : 'bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800'}`}
                disabled={!gameState.selectedTargetId}
              >
                {cost} 金币
              </button>
            ))}
          </div>
          <div className="flex gap-4">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
          </div>
        </div>
      );
    } else if (gameState.selectedOption === 'heal') {
      const healableHeroes = gameState.tableCards.filter(c => c && gameState.healableHeroIds?.includes(c.id));
      
      return (
        <div className="flex flex-col gap-4 items-center">
          <div className="flex gap-2 flex-wrap justify-center">
            {healableHeroes.map(hero => (
              <button 
                key={hero.id}
                onClick={() => socket.emit('select_target', hero.id)}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${gameState.selectedTargetId === hero.id ? 'bg-green-500 text-white ring-2 ring-white' : 'bg-green-900/50 text-green-200 hover:bg-green-800'}`}
              >
                {hero.heroClass} (HP: {hero.damage && hero.damage > 0 ? `-${hero.damage}` : 'Full'})
              </button>
            ))}
          </div>
          <div className="flex gap-4 flex-wrap justify-center">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
          </div>
        </div>
      );
    } else if (gameState.selectedOption === 'chant' || gameState.selectedOption === 'fire') {
      return (
        <div className="flex flex-col gap-4 items-center">
          <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">
            {gameState.selectedOption === 'chant' ? '请选择在魔法阵上的己方英雄 (Select your hero on a magic circle)' : '请选择正在咏唱的己方英雄 (Select your chanting hero)'}
          </div>
          <div className="flex gap-4">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
          </div>
        </div>
      );
    } else if (gameState.selectedOption === 'attack' || gameState.selectedOption === 'turret_attack') {
      return (
        <div className="flex flex-col gap-4 items-center">
          <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">
            {gameState.selectedTokenId ? '请点击高亮的攻击目标 (Click a highlighted target)' : '请选择己方英雄 (Select your hero)'}
          </div>
          <div className="flex gap-4">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
          </div>
        </div>
      );
    } else {
      return (
        <div className="flex gap-4">
          <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
            撤回
          </button>
          <button onClick={() => socket.emit('finish_action')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
            完成结算
          </button>
        </div>
      );
    }
  }
  if ((gameState.phase as string) === 'action_select_card') {
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
  if ((gameState.phase as string) === 'action_select_hero') {
    return (
      <div className="flex flex-col gap-4 items-center">
        <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择一个英雄进行行动 (Select a hero)</div>
        <div className="flex gap-2 flex-wrap justify-center">
          {gameState.tokens
            .filter(t => t.boundToCardId && ((playerIndex === 0 && t.y > 0) || (playerIndex === 1 && t.y < 0)))
            .map(hero => {
              const heroCard = gameState.tableCards.find(c => c.id === hero.boundToCardId);
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
  if ((gameState.phase as string) === 'action_select_substitute') {
    return (
      <div className="flex flex-col gap-4 items-center">
        <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择另一个英雄替代行动 (Select substitute hero)</div>
        <div className="flex gap-2 flex-wrap justify-center">
          {gameState.tokens
            .filter(t => t.boundToCardId && ((playerIndex === 0 && t.y > 0) || (playerIndex === 1 && t.y < 0)) && t.id !== gameState.activeHeroTokenId)
            .map(hero => {
              const heroCard = gameState.tableCards.find(c => c.id === hero.boundToCardId);
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
    const selectedToken = gameState.tokens.find(t => t.id === gameState.activeHeroTokenId);
    const boundCard = selectedToken?.boundToCardId ? 
      Object.values(gameState.players).flatMap((p: any) => p.hand).find((c: any) => c.id === selectedToken.boundToCardId) ||
      gameState.tableCards.find(c => c.id === selectedToken.boundToCardId)
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
        <div className="flex gap-2 flex-wrap justify-center">
          <button onClick={() => socket.emit('select_hero_action', 'move')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm">移动 (Move)</button>
          <button onClick={() => socket.emit('select_hero_action', 'attack')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-sm">攻击 (Attack)</button>
          <button onClick={() => socket.emit('select_hero_action', 'skill')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm">技能 (Skill)</button>
          <button onClick={() => socket.emit('select_hero_action', 'evolve')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-sm">进化 (Evolve)</button>
          <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold text-sm">返回 (Back)</button>
        </div>
        {levelData && levelData.skills.length > 0 && (
          <div className="bg-black/60 p-3 rounded-lg border border-purple-500/30 w-full">
            <div className="text-purple-300 text-xs font-bold mb-2 uppercase tracking-wider">当前技能 (Current Skills)</div>
            <div className="flex flex-col gap-2">
              {levelData.skills.map((skill, idx) => (
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
          <button onClick={() => socket.emit('select_common_action', 'recruit')} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-bold text-sm">招募英雄</button>
          <button onClick={() => socket.emit('cancel_action_token')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold text-sm">返回 (Back)</button>
        </div>
      </div>
    );
  }
  if (gameState.phase === 'action_defend') {
    const hasDefenseCard = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
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
            撤回
          </button>
        </div>
      );
    }
    return (
      <div className="flex gap-4">
        <button onClick={() => socket.emit('declare_defend')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
          防御
        </button>
        <button onClick={() => socket.emit('pass_defend')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
          Pass
        </button>
      </div>
    );
  }
  if (gameState.phase === 'action_play_defense' || gameState.phase === 'action_play_counter') {
    return (
      <button onClick={() => socket.emit('cancel_defend_or_counter')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
        撤回 (Cancel)
      </button>
    );
  }
  if (gameState.phase === 'action_resolve_attack') {
    return (
      <button onClick={() => socket.emit('end_resolve_attack')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
        结束结算
      </button>
    );
  }
  if (gameState.phase === 'action_resolve_attack_counter') {
    return (
      <button onClick={() => socket.emit('end_resolve_attack_counter')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
        结束结算
      </button>
    );
  }
  if (gameState.phase === 'action_resolve_counter') {
    return (
      <button onClick={() => socket.emit('end_resolve_counter')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
        结束结算
      </button>
    );
  }
  if (gameState.phase === 'shop') {
    if (gameState.selectedOption === 'hire') {
      const goldY = isPlayer1 ? 550 : -700;
      const goldCounter = gameState.counters.find(c => c.type === 'gold' && Math.abs(c.y - goldY) < 100);
      const maxGold = goldCounter ? goldCounter.value : 0;
      const costs = [2, 3, 4, 5].filter(c => c <= maxGold);

      return (
        <div className="flex flex-col gap-4 items-center">
          <div className="text-white font-bold">请选择雇佣成本 (Select hire cost)</div>
          <div className="flex gap-2">
            {costs.map(cost => (
              <button 
                key={cost} 
                onClick={() => socket.emit('select_hire_cost', cost)}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${gameState.selectedHireCost === cost ? 'bg-pink-500 text-white scale-110 shadow-lg shadow-pink-500/50' : 'bg-pink-900/50 text-pink-200 hover:bg-pink-800'}`}
              >
                {cost} 金币
              </button>
            ))}
          </div>
          <button onClick={() => socket.emit('select_option', null)} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
            取消 (Cancel)
          </button>
        </div>
      );
    }
    return (
      <div className="flex gap-4">
        <button onClick={() => socket.emit('select_option', 'buy')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold">
          购买
        </button>
        <button onClick={() => socket.emit('select_option', 'hire')} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-bold">
          雇佣
        </button>
        <button onClick={() => socket.emit('pass_shop')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
          Pass
        </button>
      </div>
    );
  }
  if (gameState.phase === 'discard') {
    const myPlayer = gameState.players[playerId];
    if (myPlayer) {
      return (
        <div className="flex flex-col gap-4 items-center">
          {myPlayer.hand.length > 5 ? (
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
              disabled={myPlayer.hand.length > 5 || myPlayer.discardFinished}
              className={`px-4 py-2 rounded-lg font-bold ${myPlayer.hand.length > 5 || myPlayer.discardFinished ? 'bg-zinc-500 text-zinc-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
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
