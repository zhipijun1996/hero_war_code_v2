import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group, Rect, Line } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { Socket } from 'socket.io-client';
import { GameState, TableCard, Token, Counter, Card, GameLog } from '../shared/types';
import { RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { HexGridLayer } from './tabletop/HexGridLayer';
import { DeckNode } from './tabletop/DeckNode';
import { ActionTokenNode } from './tabletop/ActionTokenNode';
import { TokenNode } from './tabletop/TokenNode';
import { CardNode } from './tabletop/CardNode';
import { CounterNode } from './tabletop/CounterNode';
import { HistoryLogGroup } from './tabletop/HistoryLogGroup';

import ContextMenu from './tabletop/ContextMenu';
import ZoomControls from './tabletop/ZoomControls';
import ExplosionEffect from './tabletop/ExplosionEffect';

import { PhaseUI } from './tabletop/PhaseUI';
import { JoinOverlay } from './tabletop/JoinOverlay';
import { SpectatorJoinButton } from './tabletop/SpectatorJoinButton';
import { useBoardInteraction } from './tabletop/useBoardInteraction';
import { useStageInteraction } from './tabletop/useStageInteraction';

interface TabletopProps {
  socket: Socket;
  gameState: GameState;
  setZoomedCard: (card: Card | null) => void;
  playerId: string;
  isHistoryVisible: boolean;
  selectedHeroCardId: string | null;
  setSelectedHeroCardId: (id: string | null) => void;
}

const BASE_URL = 'https://raw.githubusercontent.com/zhipijun1996/heros_war/main/';

export default function Tabletop({ socket, gameState, setZoomedCard, playerId, isHistoryVisible, selectedHeroCardId, setSelectedHeroCardId }: TabletopProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    size,
    setSize,
    stagePos,
    setStagePos,
    stageScale,
    setStageScale,
    handleWheel,
    handleTouchMove,
    handleTouchEnd,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useStageInteraction(0, 0);

  const [menu, setMenu] = useState<{ x: number, y: number, type: 'deck' | 'card' | 'hex', targetId: string, targetX?: number, targetY?: number } | null>(null);
  const [showExplosion, setShowExplosion] = useState<{ x: number, y: number } | null>(null);
  const [historyPos, setHistoryPos] = useState({ x: -850, y: -450 });

  useEffect(() => {
    if (gameState.lastEvolvedId) {
      const card = gameState.tableCards.find(c => c.id === gameState.lastEvolvedId);
      if (card) {
        setShowExplosion({ x: card.x + 50, y: card.y + 75 });
        setTimeout(() => setShowExplosion(null), 1000);
      }
    }
  }, [gameState.lastEvolvedId, gameState.tableCards]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [showJoinOverlay, setShowJoinOverlay] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setSize({ width, height });
        }
      }
    });

    resizeObserver.observe(container);

    const handleErrorMessage = (msg: string) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 3000);
    };
    socket.on('error_message', handleErrorMessage);

    return () => {
      resizeObserver.disconnect();
      socket.off('error_message', handleErrorMessage);
    };
  }, [socket, setSize, setStagePos]);

  const handleDeckContextMenu = (e: any, type: string) => {
    e.cancelBubble = true;
    if (e.evt) e.evt.preventDefault();
    
    const pointerPos = e.target.getStage().getPointerPosition();
    
    setMenu({ x: pointerPos.x, y: pointerPos.y, type: 'deck', targetId: type });
  };

  const handleCardContextMenu = (e: any, id: string) => {
    e.cancelBubble = true;
    if (e.evt) e.evt.preventDefault();
    
    const pointerPos = e.target.getStage().getPointerPosition();
    
    setMenu({ x: pointerPos.x, y: pointerPos.y, type: 'card', targetId: id });
  };

  const handleHexContextMenu = (e: any, x: number, y: number, clientX?: number, clientY?: number) => {
    e.cancelBubble = true;
    try {
      if (e.evt && typeof e.evt.preventDefault === 'function') e.evt.preventDefault();
    } catch (err) {}
    
    let pointerPos = e.target.getStage().getPointerPosition();
    
    if (!pointerPos && clientX !== undefined && clientY !== undefined) {
      const container = e.target.getStage().container();
      if (container) {
        const rect = container.getBoundingClientRect();
        pointerPos = {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
      }
    }
    
    if (pointerPos) {
      setMenu({ x: pointerPos.x, y: pointerPos.y, type: 'hex', targetId: `${x},${y}`, targetX: x, targetY: y });
    }
  };

  const {
    playerIndex,
    isActivePlayer,
    handleHexClick,
    handleTokenClick,
    handleCardClick,
  } = useBoardInteraction({
    socket,
    gameState,
    playerId,
    selectedHeroCardId,
    setSelectedHeroCardId,
  });

  return (
    <div ref={containerRef} className="absolute inset-0 bg-[#1e1e24] touch-none" onContextMenu={(e) => e.preventDefault()}>
      {errorMsg && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl z-[300] font-bold animate-bounce pointer-events-none">
          {errorMsg}
        </div>
      )}

      <PhaseUI 
        socket={socket}
        gameState={gameState}
        playerIndex={playerIndex}
        playerId={playerId}
        selectedHeroCardId={selectedHeroCardId}
      />

      <SpectatorJoinButton 
        gameStarted={gameState.gameStarted}
        playerIndex={playerIndex}
        showJoinOverlay={showJoinOverlay}
        setShowJoinOverlay={setShowJoinOverlay}
      />

      <JoinOverlay 
        socket={socket}
        gameState={gameState}
        playerId={playerId}
        playerNameInput={playerNameInput}
        setPlayerNameInput={setPlayerNameInput}
        showJoinOverlay={showJoinOverlay}
        setShowJoinOverlay={setShowJoinOverlay}
        setErrorMsg={setErrorMsg}
      />

      <Stage 
        width={size.width} 
        height={size.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        draggable
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onClick={() => setMenu(null)}
        onTap={() => setMenu(null)}
      >
        <HexGridLayer 
          onHexContextMenu={handleHexContextMenu} 
          reachableCells={gameState.reachableCells}
          onHexClick={handleHexClick}
          selectedOption={gameState.selectedOption}
          selectedHeroCardId={selectedHeroCardId}
          playerIndex={playerIndex}
          phase={gameState.phase}
          pendingRevivals={gameState.pendingRevivals}
          mapConfig={gameState.map}
          magicCircles={gameState.magicCircles}
          emberZones={gameState.emberZones}
          icePillars={gameState.icePillars}
          activeActionType={gameState.activeActionType}
        />
        
        <Layer>
          {/* First Player Token */}
          {gameState.gameStarted && (
            <Group x={-200} y={gameState.firstPlayerIndex === 0 ? 550 : -700}>
              <Circle radius={20} fill="#f59e0b" stroke="#b45309" strokeWidth={4} />
              <Text text="1st" fill="white" fontSize={16} fontStyle="bold" x={-12} y={-8} />
            </Group>
          )}

          {/* Zones UI */}
          <Group x={120} y={-530}>
            <Rect width={700} height={200} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" strokeWidth={2} dash={[10, 5]} cornerRadius={10} />
            <Text text="雇佣区 (Hire Area)" fill="rgba(255,255,255,0.2)" width={700} align="center" y={10} fontSize={20} fontStyle="bold" />
          </Group>

          <Group x={800} y={400}>
            <Rect width={200} height={200} fill="rgba(239,68,68,0.05)" stroke="rgba(239,68,68,0.2)" strokeWidth={2} dash={[10, 5]} cornerRadius={10} />
            <Text text="除外区 (Exclusion)" fill="rgba(239,68,68,0.3)" width={200} align="center" y={90} fontSize={16} fontStyle="bold" />
          </Group>

          {/* Decks */}
          <DeckNode x={-500} y={-200} type="treasure1" count={gameState.decks.treasure1.length} socket={socket} label="t1" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_t1.png`} onContextMenu={handleDeckContextMenu} />
          <DeckNode x={-500} y={0} type="treasure2" count={gameState.decks.treasure2.length} socket={socket} label="t2" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8Ct2.png`} onContextMenu={handleDeckContextMenu} />
          <DeckNode x={-500} y={200} type="treasure3" count={gameState.decks.treasure3.length} socket={socket} label="t3" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_t3.png`} onContextMenu={handleDeckContextMenu} />
          
          <DeckNode x={450} y={-100} type="action" count={gameState.decks.action.length} socket={socket} label="公共牌堆" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_%E5%85%AC%E5%85%B1%E7%89%8C%E5%A0%86.png`} onContextMenu={handleDeckContextMenu} />
          {gameState.decks.hero.length > 0 && (
            <DeckNode x={450} y={300} type="hero" count={gameState.decks.hero.length} socket={socket} label="英雄牌堆" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv1.png`} onContextMenu={handleDeckContextMenu} />
          )}
          
          {/* Discard Pile */}
          <DeckNode x={450} y={100} type="discard_action" count={gameState.discardPiles.action.length} socket={socket} label="弃牌堆" onContextMenu={handleDeckContextMenu} />

          {/* Hand Size Display */}
          {gameState.seats[0] && gameState.players[gameState.seats[0]] && (
            <Group x={0} y={450}>
              <Rect width={250} height={40} fill="rgba(0,0,0,0.5)" cornerRadius={20} x={-125} />
              <Text 
                text={`玩家 1 手牌: ${gameState.players[gameState.seats[0]].hand.length} | 英雄: ${gameState.tableCards.filter(c => c.type === 'hero' && Math.abs(c.y - 550) < 100).length} | 王城血量: ${gameState.castleHP[0] || 0} | 声望: ${gameState.reputation[0] || 0}`} 
                fill="white" 
                width={300} 
                align="center" 
                y={12} 
                fontSize={16} 
                fontStyle="bold" 
                x={-150}
              />
            </Group>
          )}
          {gameState.seats[1] && gameState.players[gameState.seats[1]] && (
            <Group x={0} y={-450}>
              <Rect width={250} height={40} fill="rgba(0,0,0,0.5)" cornerRadius={20} x={-125} />
              <Text 
                text={`玩家 2 手牌: ${gameState.players[gameState.seats[1]].hand.length} | 英雄: ${gameState.tableCards.filter(c => c.type === 'hero' && Math.abs(c.y - -700) < 100).length} | 王城血量: ${gameState.castleHP[1] || 0} | 声望: ${gameState.reputation[1] || 0}`} 
                fill="white" 
                width={300} 
                align="center" 
                y={12} 
                fontSize={16} 
                fontStyle="bold" 
                x={-150}
              />
            </Group>
          )}

          {gameState.tableCards.map(card => card && (
            <CardNode 
              key={card.id} 
              card={card} 
              socket={socket} 
              onContextMenu={handleCardContextMenu} 
              onZoom={setZoomedCard} 
              onClick={(id) => handleCardClick(id, 'table')}
              isSelected={gameState.selectedTargetId === card.id}
              lastEvolvedId={gameState.lastEvolvedId}
            />
          ))}

          {gameState.hireAreaCards.map(card => card && (
            <CardNode 
              key={card.id} 
              card={card} 
              socket={socket} 
              onContextMenu={handleCardContextMenu} 
              onZoom={setZoomedCard} 
              onClick={(id) => handleCardClick(id, 'hire')}
              isSelected={gameState.selectedTargetId === card.id}
              lastEvolvedId={gameState.lastEvolvedId}
            />
          ))}
          
          {gameState.playAreaCards?.map(card => card && (
            <CardNode 
              key={card.id} 
              card={card} 
              socket={socket} 
              onContextMenu={handleCardContextMenu} 
              onZoom={setZoomedCard} 
              onClick={(id) => handleCardClick(id, 'play')}
              isSelected={gameState.selectedTargetId === card.id}
              lastEvolvedId={gameState.lastEvolvedId}
            />
          ))}
          
          {gameState.actionTokens?.map(token => (
            <ActionTokenNode
              key={token.id}
              token={token}
              onClick={(id) => socket.emit('click_action_token', id)}
              isMyTurn={isActivePlayer}
              isSelected={gameState.activeActionTokenId === token.id}
            />
          ))}

          {gameState.tokens.map(token => {
            if (!token) return null;
            const isSelected = gameState.selectedTokenId === token.id;
            const isMyToken = (() => {
              if (!token.boundToCardId) return false;
              const card = gameState.tableCards.find(c => c && c.id === token.boundToCardId);
              if (!card) return false;
              const isPlayer1 = gameState.seats[0] === playerId;
              const isPlayer2 = gameState.seats[1] === playerId;
              return (isPlayer1 && card.y > 0) || (isPlayer2 && card.y < 0);
            })();

            const hasShield = gameState.statuses?.some(s => s.tokenId === token.id && s.status === 'shield');

            return (
              <TokenNode 
                key={token.id} 
                token={token} 
                socket={socket} 
                onClick={handleTokenClick}
                onHexClick={handleHexClick}
                isMyToken={isMyToken}
                isSelected={isSelected}
                draggable={!gameState.gameStarted || (!gameState.selectedOption && !gameState.selectedTokenId && isMyToken)}
                lastEvolvedId={gameState.lastEvolvedId}
                hasShield={hasShield}
              />
            );
          })}
          
          {gameState.counters.map(counter => counter && (
            <CounterNode key={counter.id} counter={counter} socket={socket} />
          ))}

          <HistoryLogGroup logs={gameState.logs || []} isVisible={isHistoryVisible} position={historyPos} onDragEnd={setHistoryPos} />
        </Layer>
      </Stage>

      {/* Context Menu */}
      <ContextMenu 
        menu={menu} 
        gameState={gameState} 
        playerId={playerId} 
        socket={socket} 
        setMenu={setMenu} 
      />

      {/* Zoom Controls Overlay */}
      <ZoomControls 
        zoomIn={zoomIn} 
        zoomOut={zoomOut} 
        resetZoom={resetZoom} 
      />

      {/* Explosion Effect Overlay */}
      <ExplosionEffect 
        showExplosion={showExplosion} 
        stageScale={stageScale} 
        stagePos={stagePos} 
      />
    </div>
  );
}
