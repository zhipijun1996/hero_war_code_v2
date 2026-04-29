import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, Card, MapConfig } from './shared/types';
import Tabletop from './components/Tabletop';
import Hand from './components/Hand';
import Controls from './components/Controls';
import MapEditor from './components/MapEditor';
import MapSelector from './components/MapSelector';

let socket: Socket;

export interface RoomInfo {
  roomId: string;
  playerCount: number;
  phase: string;
  round: number;
  lastActivity: number;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [zoomedCard, setZoomedCard] = useState<Card | null>(null);
  const [isHistoryVisible, setIsHistoryVisible] = useState(true);
  const [selectedHeroCardId, setSelectedHeroCardId] = useState<string | null>(null);
  const [showMapEditor, setShowMapEditor] = useState(false);
  const [roomId, setRoomId] = useState<string>('');
  const [rooms, setRooms] = useState<RoomInfo[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      setRoomId(roomFromUrl);
      // Connect to the same host that serves the page
      socket = io({ query: { room: roomFromUrl } });

      socket.on('connect', () => {
        setPlayerId(socket.id!);
      });

      socket.on('init', (state: GameState) => {
        setGameState(state);
      });

      socket.on('state_update', (state: GameState) => {
        setGameState(state);
      });

      socket.on('item_moved', ({ type, id, x, y }) => {
        setGameState((prev) => {
          if (!prev) return prev;
          const newState = { ...prev };
          if (type === 'token') {
            newState.tokens = newState.tokens.map(t => t.id === id ? { ...t, x, y } : t);
          } else if (type === 'card') {
            newState.tableCards = newState.tableCards.map(c => c.id === id ? { ...c, x, y } : c);
          } else if (type === 'counter') {
            newState.counters = newState.counters.map(c => c.id === id ? { ...c, x, y } : c);
          }
          return newState;
        });
      });

      socket.on('card_flipped', ({ id, faceUp }) => {
        setGameState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tableCards: prev.tableCards.map(c => c.id === id ? { ...c, faceUp } : c)
          };
        });
      });

      socket.on('counter_updated', ({ id, value }) => {
        setGameState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            counters: prev.counters.map(c => c.id === id ? { ...c, value } : c)
          };
        });
      });

      return () => {
        socket.disconnect();
      };
    } else {
      const fetchRooms = () => {
        fetch('/api/rooms', { headers: { 'Accept': 'application/json' } })
          .then(async res => {
            if (!res.ok) return null;
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              return res.json();
            }
            return null;
          })
          .then(data => {
            if (data) setRooms(data);
          })
          .catch(err => {
            console.log("Could not fetch rooms (server might be restarting):", err.message);
          });
      };
      fetchRooms();
      const interval = setInterval(fetchRooms, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  const handleJoinRoom = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const room = formData.get('room') as string;
    if (room && room.trim()) {
      window.location.search = `?room=${encodeURIComponent(room.trim())}`;
    }
  };

  if (!roomId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-900 text-white flex-col gap-6 font-sans py-10 px-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">勇者之争 - 线上测试版</h1>
        
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          
          <div className="bg-zinc-800 p-6 sm:p-8 rounded-xl shadow-lg border border-zinc-700 order-2 md:order-1">
            <h2 className="text-xl font-semibold mb-4 border-b border-zinc-700 pb-2">现有房间 ({rooms.length})</h2>
            
            {rooms.length === 0 ? (
              <p className="text-zinc-500 italic py-8 text-center text-sm">暂无活跃房间，创建一个新的吧！</p>
            ) : (
              <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {rooms.map(r => (
                  <button
                    key={r.roomId}
                    onClick={() => { window.location.search = `?room=${encodeURIComponent(r.roomId)}` }}
                    className="flex flex-col text-left w-full p-4 hover:bg-zinc-700/50 rounded-lg border border-zinc-700 bg-zinc-800/80 transition-colors group cursor-pointer"
                  >
                    <div className="flex justify-between items-center w-full mb-2">
                      <span className="font-semibold text-green-300 group-hover:text-green-400 text-lg">{r.roomId}</span>
                      <span className="text-xs bg-zinc-900 border border-zinc-700 px-2 py-1 rounded-full text-zinc-400">
                        {r.playerCount} 玩家
                      </span>
                    </div>
                    <div className="flex justify-between items-center w-full text-sm text-zinc-400">
                      <span className="capitalize">
                        {r.phase === 'setup' ? '准备中' : r.phase.startsWith('action') ? '行动阶段' : r.phase === 'discard' ? '弃牌阶段' : r.phase === 'shop' ? '商店阶段' : r.phase}
                      </span>
                      <span>第 {r.round} 回合</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-zinc-800 p-6 sm:p-8 rounded-xl shadow-lg border border-zinc-700 order-1 md:order-2 sticky top-10">
            <h2 className="text-xl font-semibold mb-4 border-b border-zinc-700 pb-2">加入或创建房间</h2>
            <form onSubmit={handleJoinRoom} className="flex flex-col gap-4">
              <div>
                <label htmlFor="room" className="block text-sm font-medium text-zinc-400 mb-2">
                  输入房间号:
                </label>
                <input
                  type="text"
                  id="room"
                  name="room"
                  autoComplete="off"
                  placeholder="例如: test_room_1"
                  required
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-3 text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all text-lg tracking-wider font-mono placeholder:font-sans"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 px-4 rounded-md transition-colors mt-2 shadow-[0_0_15px_rgba(22,163,74,0.3)] hover:shadow-[0_0_20px_rgba(22,163,74,0.5)]"
              >
                加入 / 创建
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return <div className="flex items-center justify-center h-screen bg-zinc-900 text-white">Connecting to tabletop...</div>;
  }

  const myPlayer = gameState.players[playerId];

  return (
    <div className="flex flex-col h-[100dvh] bg-zinc-900 overflow-hidden font-sans">
      {/* Top Bar */}
      <div className="h-14 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-6 text-zinc-300 shrink-0 relative z-[5000]">
        <div className="font-semibold text-white tracking-tight flex items-center gap-2 sm:gap-4">
          <span className="text-sm sm:text-base">HexTable</span>
          {gameState && !gameState.gameStarted && (
            <>
              <MapSelector onSelect={(mapConfig) => socket.emit('update_map', mapConfig)} />
              <button 
                onClick={() => setShowMapEditor(true)}
                className="px-2 sm:px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] sm:text-xs rounded-md border border-zinc-700 transition-colors whitespace-nowrap"
              >
                🛠️ <span className="hidden sm:inline">地图编辑器</span><span className="sm:hidden">编辑器</span>
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-sm">
          {gameState?.gameStarted && (
            <span className="font-bold text-amber-400">回合: {gameState.round}</span>
          )}
          <span className="hidden sm:inline">Players: {gameState ? Object.keys(gameState.players).length : 0}</span>
          <span className="px-2 py-1 bg-zinc-800 rounded-md text-zinc-400 max-w-[80px] sm:max-w-none truncate">
            {myPlayer?.name || (playerId ? `ID: ${playerId.slice(0, 4)}` : 'Connecting...')}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-[300px] relative z-0 overflow-hidden">
        {showMapEditor && (
          <MapEditor 
            onClose={() => setShowMapEditor(false)} 
            onSave={(mapConfig) => {
              socket.emit('update_map', mapConfig);
              setShowMapEditor(false);
            }} 
          />
        )}
        {gameState ? (
          <>
            <Tabletop 
              socket={socket} 
              gameState={gameState} 
              setZoomedCard={setZoomedCard} 
              playerId={playerId} 
              isHistoryVisible={isHistoryVisible} 
              selectedHeroCardId={selectedHeroCardId}
              setSelectedHeroCardId={setSelectedHeroCardId}
            />
            
            {/* UI Overlay */}
            <div className="absolute top-4 left-4 pointer-events-none">
              <Controls socket={socket} isHistoryVisible={isHistoryVisible} setIsHistoryVisible={setIsHistoryVisible} />
            </div>

            {/* Hand */}
            {myPlayer && (
              <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
                <Hand 
                  socket={socket} 
                  hand={myPlayer.hand} 
                  setZoomedCard={setZoomedCard} 
                  gameState={gameState} 
                  selectedHeroCardId={selectedHeroCardId}
                  setSelectedHeroCardId={setSelectedHeroCardId}
                  myPlayerIndex={gameState.seats.indexOf(playerId)}
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <p>正在连接服务器 (Connecting to server...)</p>
            </div>
          </div>
        )}

        {/* Zoom Overlay */}
        {zoomedCard && (
          <div 
            className="absolute inset-0 bg-black/80 flex items-center justify-center z-[300] cursor-pointer pointer-events-auto"
            onClick={() => setZoomedCard(null)}
          >
            <div className="relative group">
              <img 
                src={zoomedCard.frontImage} 
                alt="Zoomed Card" 
                className="max-h-[80vh] rounded-2xl shadow-2xl border-4 border-white/10"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-12 left-0 right-0 text-center text-white/60 text-sm font-medium">
                Click anywhere to close
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
