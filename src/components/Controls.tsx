import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { Coins, Star, Heart, RotateCcw, Shield, Swords, Clock, ArrowUpCircle, Menu, X } from 'lucide-react';

interface ControlsProps {
  socket: Socket;
  isHistoryVisible: boolean;
  setIsHistoryVisible: (visible: boolean) => void;
}

const HERO_CLASSES = [
  '重甲兵', '巨盾卫士', '战士', '狂战士', '决斗大师', '刺客', '盗贼', 
  '弓箭手', '冰法师', '火法师', '圣职者', '指挥官'
];

export default function Controls({ socket, isHistoryVisible, setIsHistoryVisible }: ControlsProps) {
  const [selectedClass, setSelectedClass] = useState(HERO_CLASSES[0]);
  const [isExpanded, setIsExpanded] = useState(false);

  const addCounter = (type: 'gold' | 'exp' | 'damage' | 'time' | 'level') => {
    socket.emit('add_counter', { type, x: 0, y: 0 });
    setIsExpanded(false);
  };

  const spawnHero = (level: number) => {
    socket.emit('spawn_hero', { heroClass: selectedClass, level, x: 0, y: 0 });
    setIsExpanded(false);
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 shadow-2xl backdrop-blur-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors pointer-events-auto"
        title="Open Controls"
      >
        <Menu size={24} />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 pointer-events-auto max-h-[90vh] overflow-y-auto pb-4 pr-2 custom-scrollbar">
      {/* Header with Close Button */}
      <div className="flex justify-end w-48 mb-[-8px]">
        <button 
          onClick={() => setIsExpanded(false)}
          className="bg-zinc-900/90 border border-zinc-800 rounded-full p-2 shadow-lg backdrop-blur-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Hero Spawner */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-2xl backdrop-blur-sm w-48">
        <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield size={14} />
          高级英雄
        </h3>
        <div className="flex flex-col gap-3">
          <select 
            value={selectedClass} 
            onChange={e => setSelectedClass(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            {HERO_CLASSES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          
          <div className="flex flex-col gap-2">
            <button
              onClick={() => spawnHero(1)}
              className="flex items-center justify-center gap-2 w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors border border-zinc-700"
            >
              <CircleIcon />
              Lv1 (Token)
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => spawnHero(2)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-lg text-xs font-medium transition-colors border border-indigo-500/30"
              >
                <CardIcon />
                Lv2
              </button>
              <button
                onClick={() => spawnHero(3)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 rounded-lg text-xs font-medium transition-colors border border-purple-500/30"
              >
                <CardIcon />
                Lv3
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Counters */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-2xl backdrop-blur-sm w-48">
        <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Add Counters</h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => addCounter('gold')}
            className="flex items-center gap-3 w-full p-2 hover:bg-zinc-800 rounded-lg text-sm text-zinc-300 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center text-zinc-900">
              <Coins size={14} />
            </div>
            Gold
          </button>
          
          <button
            onClick={() => addCounter('exp')}
            className="flex items-center gap-3 w-full p-2 hover:bg-zinc-800 rounded-lg text-sm text-zinc-300 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center text-zinc-900">
              <Star size={14} />
            </div>
            Experience
          </button>
          
          <button
            onClick={() => addCounter('damage')}
            className="flex items-center gap-3 w-full p-2 hover:bg-zinc-800 rounded-lg text-sm text-zinc-300 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-red-400 flex items-center justify-center text-zinc-900">
              <Heart size={14} />
            </div>
            Damage
          </button>

          <button
            onClick={() => addCounter('time')}
            className="flex items-center gap-3 w-full p-2 hover:bg-zinc-800 rounded-lg text-sm text-zinc-300 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-blue-400 flex items-center justify-center text-zinc-900">
              <Clock size={14} />
            </div>
            Time
          </button>

          <button
            onClick={() => addCounter('level')}
            className="flex items-center gap-3 w-full p-2 hover:bg-zinc-800 rounded-lg text-sm text-zinc-300 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-purple-400 flex items-center justify-center text-zinc-900">
              <ArrowUpCircle size={14} />
            </div>
            Level
          </button>
        </div>
      </div>

      {/* Game Controls */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-2 shadow-2xl backdrop-blur-sm w-48">
        <button
          onClick={() => setIsHistoryVisible(!isHistoryVisible)}
          className={`flex items-center justify-center gap-2 w-full py-2 ${isHistoryVisible ? 'text-emerald-400' : 'text-zinc-400'} hover:text-white hover:bg-zinc-800 rounded-lg text-sm font-medium transition-colors`}
        >
          <Clock size={16} />
          {isHistoryVisible ? 'Hide History' : 'Show History'}
        </button>
        <button
          onClick={() => { socket.emit('reset_game'); setIsExpanded(false); }}
          className="flex items-center justify-center gap-2 w-full py-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg text-sm font-medium transition-colors"
        >
          <RotateCcw size={16} />
          Reset Game
        </button>
      </div>
    </div>
  );
}

function CircleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
      <line x1="4" y1="7" x2="20" y2="7"></line>
    </svg>
  );
}
