import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, Card, MapConfig } from './shared/types';
import Tabletop from './components/Tabletop';
import Hand from './components/Hand';
import Controls from './components/Controls';
import MapEditor from './components/MapEditor';
import MapSelector from './components/MapSelector';

let socket: Socket;

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [zoomedCard, setZoomedCard] = useState<Card | null>(null);
  const [isHistoryVisible, setIsHistoryVisible] = useState(true);
  const [selectedHeroCardId, setSelectedHeroCardId] = useState<string | null>(null);
  const [showMapEditor, setShowMapEditor] = useState(false);

  useEffect(() => {
    // Connect to the same host that serves the page
    socket = io();

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
  }, []);

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
