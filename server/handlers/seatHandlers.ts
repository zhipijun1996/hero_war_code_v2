export const createSeatHandlers = (deps: any) => {
  const {
    gameState,
    io,
    addLog,
    checkBotTurn,
    broadcastState,
    getPlayerIndex,
    generateId
  } = deps;

  return {
    add_bot: (socket: any, { seatIndex, difficulty }: { seatIndex: number, difficulty: number }) => {
      if (gameState.seats[seatIndex] !== null) return;
      
      const botId = `bot_${generateId()}`;
      gameState.seats[seatIndex] = botId;
      gameState.players[botId] = {
        id: botId,
        name: `AI ${difficulty === 0 ? 'Easy' : difficulty === 1 ? 'Normal' : 'Hard'}`,
        hand: [],
        gold: 0,
        discardFinished: false,
        isBot: true,
        difficulty
      };
      gameState.heroPlayed[botId] = false;
      gameState.heroPlayedCount[botId] = 0;
      
      addLog(`AI加入了座位 ${seatIndex + 1} (AI joined seat ${seatIndex + 1})`, -1);
      broadcastState();
    },
    remove_bot: (socket: any, { seatIndex }: { seatIndex: number }) => {
      const occupantId = gameState.seats[seatIndex];
      if (occupantId && occupantId.startsWith('bot_')) {
        delete gameState.players[occupantId];
        gameState.seats[seatIndex] = null;
        addLog(`AI离开了座位 ${seatIndex + 1} (AI left seat ${seatIndex + 1})`, -1);
        broadcastState();
      }
    },
    sit_down: (socket: any, { seatIndex, playerName }: { seatIndex: number, playerName: string }) => {
      if (gameState.seats[seatIndex] !== null) {
        socket.emit('error_message', '座位已被占用 (Seat is already occupied)');
        return;
      }
      
      const existingSeat = gameState.seats.findIndex((id: string | null) => id === socket.id);
      if (existingSeat !== -1) {
        gameState.seats[existingSeat] = null;
      }

      gameState.seats[seatIndex] = socket.id;
      if (!gameState.players[socket.id]) {
        gameState.players[socket.id] = {
          id: socket.id,
          name: playerName || `Player ${socket.id.substring(0, 4)}`,
          hand: [],
          gold: 0,
          discardFinished: false
        };
      } else {
        gameState.players[socket.id].name = playerName || gameState.players[socket.id].name;
      }
      gameState.heroPlayed[socket.id] = false;
      gameState.heroPlayedCount[socket.id] = 0;
      
      addLog(`${gameState.players[socket.id].name} 坐下了 (sat down)`, seatIndex);
      broadcastState();
    },
    leave_seat: (socket: any) => {
      const seatIndex = gameState.seats.findIndex((id: string | null) => id === socket.id);
      if (seatIndex !== -1) {
        gameState.seats[seatIndex] = null;
        addLog(`玩家离开了座位 ${seatIndex + 1} (Player left seat ${seatIndex + 1})`, -1);
        broadcastState();
      }
    },
    join_seat: (socket: any, { seatIndex, name, isBot }: any) => {
      if (gameState.seats[seatIndex] !== null) return;
      
      if (isBot) {
        const botId = `bot_${generateId()}`;
        gameState.seats[seatIndex] = botId;
        gameState.players[botId] = {
          id: botId,
          name: name || 'AI',
          hand: [],
          gold: 0,
          discardFinished: false,
          isBot: true,
          difficulty: 1
        };
        gameState.heroPlayed[botId] = false;
        gameState.heroPlayedCount[botId] = 0;
      } else {
        gameState.seats[seatIndex] = socket.id;
        if (!gameState.players[socket.id]) {
          gameState.players[socket.id] = {
            id: socket.id,
            name: name || `Player ${socket.id.substring(0, 4)}`,
            hand: [],
            gold: 0,
            discardFinished: false
          };
        }
        gameState.heroPlayed[socket.id] = false;
        gameState.heroPlayedCount[socket.id] = 0;
      }
      broadcastState();
    },
    disconnect: (socket: any) => {
      console.log('User disconnected:', socket.id);
      const seatIndex = gameState.seats.findIndex((id: string | null) => id === socket.id);
      if (seatIndex !== -1) {
        gameState.seats[seatIndex] = null;
        addLog(`玩家断开连接 (Player disconnected)`, -1);
        broadcastState();
      }
    }
  };
};
