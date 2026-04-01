// ---------------- MATCH HANDLER ----------------

let matchInit = function (ctx, logger, nk, params) {
  return {
    state: {
      board: Array(9).fill(null),
      players: [],
      turn: 0,
      nextPlayer: "X",
      status: "playing",
      winner: null,
      mode: params.mode || "classic",
      gameCode: params.gameCode,
      lastMoveTick: 0
    },
    tickRate: 10,
    label: JSON.stringify({ 
      gameCode: params.gameCode, 
      mode: params.mode || "classic",
      status: "open" 
    })
  };
};

let matchJoinAttempt = function (ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  if (state.players.length >= 2) {
    return { state, accept: false, rejectMessage: "Game full" };
  }
  return { state, accept: true };
};

let matchJoin = function (ctx, logger, nk, dispatcher, tick, state, presences) {
  presences.forEach(p => {
    const userId = p.userId || p.user_id;

    // Check if player already exists in the match (deduplicate)
    const existing = state.players.find(it => (it.userId || it.user_id) === userId);
    if (existing) {
      logger.info(`User ${userId} rejoined match - ignoring duplicate add`);
      return;
    }

    const username = p.username || "Unknown";
    logger.info(`User ${username} (${userId}) joining match slot ${state.players.length + 1}`);

    if (state.players.length === 0) {
      state.players.push({ userId, username, symbol: "X" });
    } else if (state.players.length === 1) {
      state.players.push({ userId, username, symbol: "O" });
    }
  });

  // Send full state to all players
  dispatcher.broadcastMessage(2, JSON.stringify(state));

  // If match is now full, update label to "full" to isolate it
  if (state.players.length === 2) {
    dispatcher.matchLabelUpdate(JSON.stringify({ 
      gameCode: state.gameCode, 
      mode: state.mode, 
      status: "full" 
    }));
  }

  return { state };
};

let matchLoop = function (ctx, logger, nk, dispatcher, tick, state, messages) {
  if (state.status === "finished") return { state };

  // Set initial lastMoveTick if not set (first tick after both joined)
  if (state.players.length === 2 && state.lastMoveTick === 0) {
    state.lastMoveTick = tick;
  }

  // Server-side timeout for timed games
  if (state.mode === "timed" && state.status === "playing" && state.players.length === 2) {
    const elapsedTicks = tick - state.lastMoveTick;
    if (elapsedTicks >= 300) { // 30 seconds at 10 tickRate
       const timeoutPlayerSymbol = state.turn === 0 ? "X" : "O";
       const winnerPlayerSymbol = state.turn === 0 ? "O" : "X";

       logger.info(`TIMEOUT ERROR: Player ${timeoutPlayerSymbol} exceeded 30s limit. Assigning winner: ${winnerPlayerSymbol}`);
       
       state.status = "finished";
       state.winner = winnerPlayerSymbol;
       
       // Update label to reflect finished status
       dispatcher.matchLabelUpdate(JSON.stringify({ 
         gameCode: state.gameCode, 
         mode: state.mode, 
         status: "finished" 
       }));

       dispatcher.broadcastMessage(2, JSON.stringify(state));
       
       // Record results for both players
       recordMatchResults(nk, logger, state.players, winnerPlayerSymbol);

       return { state };
    }
  }

  let stateChanged = false;

  messages.forEach(msg => {
    const opCode = msg.opCode ?? msg.op_code;
    const sender = msg.sender || {};
    const senderId = sender.userId || sender.user_id;

    // Debug raw message if opCode 1
    if (opCode === 1) {
       logger.info(`Raw message data from ${senderId}: ${nk.binaryToString(msg.data)}`);
    }

    if (opCode === 1) {
      let data;
      try {
        data = JSON.parse(nk.binaryToString(msg.data));
      } catch (e) {
        logger.error(`Failed to parse move data: ${e.message}`);
        return;
      }

      const index = data.index;
      const player = state.players.find(p => (p.userId || p.user_id) === senderId);

      if (!player) {
         logger.warn(`Rejected move from ${senderId}: Player not in game players: ${JSON.stringify(state.players)}`);
         return;
      }

      const isXTurn = state.turn === 0;
      const isPlayerX = player.symbol === "X";

      if (isXTurn !== isPlayerX) {
        logger.warn(`Rejected move from ${player.symbol} (${senderId}). Turn: ${state.nextPlayer}.`);
        return;
      }

      if (index < 0 || index > 8 || state.board[index] !== null) {
        logger.warn(`Rejected move: cell ${index} already taken or invalid.`);
        return;
      }

      // Execute move
      state.board[index] = player.symbol;
      state.turn = 1 - state.turn;
      state.nextPlayer = state.turn === 0 ? "X" : "O";
      state.lastMoveTick = tick; // Reset timeout
      stateChanged = true;

      const winner = checkWinner(state.board);
      if (winner || state.board.every(c => c !== null)) {
        state.status = "finished";
        state.winner = winner || "draw";
        
        // Update label to reflect finished status
        dispatcher.matchLabelUpdate(JSON.stringify({ 
          gameCode: state.gameCode, 
          mode: state.mode, 
          status: "finished" 
        }));

        // Record results for both players
        recordMatchResults(nk, logger, state.players, winner || "draw");
      }

      logger.info(`Board updated: ${player.symbol} played ${index}.`);
    }
  });

  // Always broadcast state if something changed, 
  // or periodically to keep clients in sync.
  if (stateChanged || (tick % 50 === 0)) {
     dispatcher.broadcastMessage(2, JSON.stringify(state));
  }

  return { state };
};


let matchSignal = function (ctx, logger, nk, dispatcher, tick, state, data) {
  return { state, data };
};

function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
    [0, 4, 8], [2, 4, 6]             // Diagonals
  ];
  for (let line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

let matchLeave = function (ctx, logger, nk, dispatcher, tick, state, presences) {
  return { state };
};

let matchTerminate = function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  return { state };
};

// ---------------- RPC FUNCTIONS ----------------

function createMatch(ctx, logger, nk, payload) {
  let params = {};
  if (payload) {
    params = JSON.parse(payload);
  }

  const gameCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const matchId = nk.matchCreate("tic-tac-toe", { gameCode, mode: params.mode || "classic" });

  logger.info("Match created with code " + gameCode + ": " + matchId);

  return JSON.stringify({ matchId, gameCode });
}

function findMatchByCode(ctx, logger, nk, payload) {
  let data = JSON.parse(payload);
  if (!data.code) {
    throw new Error("code is required");
  }

  const targetCode = data.code.toUpperCase();
  const targetMode = data.mode || "classic";
  logger.info("Searching for match with code: " + targetCode + " mode: " + targetMode);

  // matchList(limit, authoritative, label, min_size, max_size, query)
  // min_size: 1, max_size: 1 ensures we only find games with a slot available
  const matches = nk.matchList(100, true, null, 1, 1, null);
  
  for (let match of matches) {
    if (match.label) {
      try {
        const label = JSON.parse(match.label);
        if (label && label.gameCode === targetCode && label.mode === targetMode) {
          logger.info("Match found: " + match.matchId);
          return JSON.stringify({ matchId: match.matchId });
        }
      } catch (e) {
        logger.debug("Skipping match with invalid label: " + match.matchId);
      }
    }
  }

  logger.info("Match not found for code: " + targetCode);
  throw new Error("Match not found");
}

function recordMatchResults(nk, logger, players, winnerSymbol) {
  players.forEach(player => {
    const userId = player.userId || player.user_id;
    const isWinner = player.symbol === winnerSymbol;
    const isDraw = winnerSymbol === "draw";

    try {
      // 1. Fetch current leaderboard record to get streak and losses
      const records = nk.leaderboardRecordsList("global_rankings", [userId], 1, null);
      let streak = 0;
      let losses = 0;

      if (records && records.records && records.records.length > 0) {
        const metadata = JSON.parse(records.records[0].metadata || "{}");
        streak = metadata.streak || 0;
        losses = metadata.losses || 0;
      }

      // 2. Update stats
      if (isWinner) {
        streak += 1;
      } else if (!isDraw) {
        streak = 0; // Reset streak on loss
        losses += 1;
      }

      // 3. Write updated record
      // score is total wins (cumulative)
      const scoreInc = isWinner ? 1 : 0;
      const metadata = { streak, losses };
      
      nk.leaderboardRecordWrite("global_rankings", userId, player.username, scoreInc, 0, metadata);
      logger.info(`Recorded match result for ${player.username} (${player.symbol}): Winner=${isWinner}, Streak=${streak}, Losses=${losses}`);
    } catch (e) {
      logger.error(`Failed to record leaderboard record for ${userId}: ${e.message}`);
    }
  });
}

// ---------------- INIT MODULE ----------------

function InitModule(ctx, logger, nk, initializer) {
  initializer.registerMatch("tic-tac-toe", {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLoop,
    matchLeave,
    matchTerminate,
    matchSignal
  });

  initializer.registerRpc("create_match", createMatch);
  initializer.registerRpc("find_match_by_code", findMatchByCode);

  // Initialize Leaderboard
  const id = "global_rankings";
  const authoritative = false;
  const sort = "desc";
  const operator = "incr"; // Increment score (wins)
  const reset = "0 0 * * *"; // Daily reset or null for never
  const metadata = { description: "Global Tic-Tac-Toe Rankings" };
  
  nk.leaderboardCreate(id, authoritative, sort, operator, reset, metadata);

  logger.info("Tick-Tac-Toe Match + RPCs + Leaderboard registered");
}