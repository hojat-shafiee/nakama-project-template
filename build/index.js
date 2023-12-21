'use strict';

var Mark;
(function (Mark) {
  Mark[Mark["UNDEFINED"] = 0] = "UNDEFINED";
  Mark[Mark["X"] = 1] = "X";
  Mark[Mark["O"] = 2] = "O";
})(Mark || (Mark = {}));
var OpCode;
(function (OpCode) {
  OpCode[OpCode["START"] = 1] = "START";
  OpCode[OpCode["UPDATE"] = 2] = "UPDATE";
  OpCode[OpCode["DONE"] = 3] = "DONE";
  OpCode[OpCode["MOVE"] = 4] = "MOVE";
  OpCode[OpCode["REJECTED"] = 5] = "REJECTED";
  OpCode[OpCode["OPPONENT_LEFT"] = 6] = "OPPONENT_LEFT";
})(OpCode || (OpCode = {}));

var moduleName = "tic-tac-toe_js";
var tickRate = 5;
var maxEmptySec = 30;
var delaybetweenGamesSec = 5;
var turnTimeFastSec = 10;
var turnTimeNormalSec = 20;
var winningPositions = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
var matchInit = function matchInit(ctx, logger, nk, params) {
  var fast = !!params['fast'];
  var label = {
    open: 1,
    fast: 0
  };
  if (fast) {
    label.fast = 1;
  }
  var state = {
    label: label,
    emptyTicks: 0,
    presences: {},
    joinsInProgress: 0,
    playing: false,
    board: [],
    marks: {},
    mark: Mark.UNDEFINED,
    deadlineRemainingTicks: 0,
    winner: null,
    winnerPositions: null,
    nextGameRemainingTicks: 0
  };
  return {
    state: state,
    tickRate: tickRate,
    label: JSON.stringify(label)
  };
};
var matchJoinAttempt = function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  if (presence.userId in state.presences) {
    if (state.presences[presence.userId] === null) {
      state.joinsInProgress++;
      return {
        state: state,
        accept: false
      };
    } else {
      return {
        state: state,
        accept: false,
        rejectMessage: 'already joined'
      };
    }
  }
  if (connectedPlayers(state) + state.joinsInProgress >= 2) {
    return {
      state: state,
      accept: false,
      rejectMessage: 'match full'
    };
  }
  state.joinsInProgress++;
  return {
    state: state,
    accept: true
  };
};
var matchJoin = function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
  var t = msecToSec(Date.now());
  for (var _i = 0, presences_1 = presences; _i < presences_1.length; _i++) {
    var presence = presences_1[_i];
    state.emptyTicks = 0;
    state.presences[presence.userId] = presence;
    state.joinsInProgress--;
    if (state.playing) {
      var update = {
        board: state.board,
        mark: state.mark,
        deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate)
      };
      dispatcher.broadcastMessage(OpCode.UPDATE, JSON.stringify(update));
    } else if (state.board.length !== 0 && Object.keys(state.marks).length !== 0 && state.marks[presence.userId]) {
      logger.debug('player %s rejoined game', presence.userId);
      var done = {
        board: state.board,
        winner: state.winner,
        winnerPositions: state.winnerPositions,
        nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate)
      };
      dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(done));
    }
  }
  if (Object.keys(state.presences).length >= 2 && state.label.open != 0) {
    state.label.open = 0;
    var labelJSON = JSON.stringify(state.label);
    dispatcher.matchLabelUpdate(labelJSON);
  }
  return {
    state: state
  };
};
var matchLeave = function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var _i = 0, presences_2 = presences; _i < presences_2.length; _i++) {
    var presence = presences_2[_i];
    logger.info("Player: %s left match: %s.", presence.userId, ctx.matchId);
    state.presences[presence.userId] = null;
  }
  var humanPlayersRemaining = [];
  Object.keys(state.presences).forEach(function (userId) {
    if (state.presences[userId] !== null) humanPlayersRemaining.push(state.presences[userId]);
  });
  if (humanPlayersRemaining.length === 1) {
    dispatcher.broadcastMessage(OpCode.OPPONENT_LEFT, null, humanPlayersRemaining, null, true);
  }
  return {
    state: state
  };
};
var matchLoop = function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
  var _a;
  var _b;
  logger.debug('Running match loop. Tick: %d', tick);
  if (connectedPlayers(state) + state.joinsInProgress === 0) {
    state.emptyTicks++;
    if (state.emptyTicks >= maxEmptySec * tickRate) {
      logger.info('closing idle match');
      return null;
    }
  }
  var t = msecToSec(Date.now());
  if (!state.playing) {
    for (var userID in state.presences) {
      if (state.presences[userID] === null) {
        delete state.presences[userID];
      }
    }
    if (Object.keys(state.presences).length < 2 && state.label.open != 1) {
      state.label.open = 1;
      var labelJSON = JSON.stringify(state.label);
      dispatcher.matchLabelUpdate(labelJSON);
    }
    if (Object.keys(state.presences).length < 2) {
      return {
        state: state
      };
    }
    if (state.nextGameRemainingTicks > 0) {
      state.nextGameRemainingTicks--;
      return {
        state: state
      };
    }
    state.playing = true;
    state.board = new Array(9);
    state.marks = {};
    var marks_1 = [Mark.X, Mark.O];
    Object.keys(state.presences).forEach(function (userId) {
      var _a;
      state.marks[userId] = (_a = marks_1.shift()) !== null && _a !== void 0 ? _a : null;
    });
    state.mark = Mark.X;
    state.winner = Mark.UNDEFINED;
    state.winnerPositions = null;
    state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
    state.nextGameRemainingTicks = 0;
    var msg = {
      board: state.board,
      marks: state.marks,
      mark: state.mark,
      deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate)
    };
    dispatcher.broadcastMessage(OpCode.START, JSON.stringify(msg));
    return {
      state: state
    };
  }
  for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
    var message = messages_1[_i];
    switch (message.opCode) {
      case OpCode.MOVE:
        logger.debug('Received move message from user: %v', state.marks);
        var mark = (_b = state.marks[message.sender.userId]) !== null && _b !== void 0 ? _b : null;
        var sender = [message.sender];
        if (mark === null || state.mark !== mark) {
          dispatcher.broadcastMessage(OpCode.REJECTED, null, sender);
          continue;
        }
        var msg = {};
        try {
          msg = JSON.parse(nk.binaryToString(message.data));
        } catch (error) {
          dispatcher.broadcastMessage(OpCode.REJECTED, null, sender);
          logger.debug('Bad data received: %v', error);
          continue;
        }
        if (state.board[msg.position]) {
          dispatcher.broadcastMessage(OpCode.REJECTED, null, sender);
          continue;
        }
        state.board[msg.position] = mark;
        state.mark = mark === Mark.O ? Mark.X : Mark.O;
        state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
        var winner = (_a = winCheck(state.board, mark), _a[0]),
          winningPos = _a[1];
        if (winner) {
          state.winner = mark;
          state.winnerPositions = winningPos;
          state.playing = false;
          state.deadlineRemainingTicks = 0;
          state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
        }
        var tie = state.board.every(function (v) {
          return v !== null;
        });
        if (tie) {
          state.playing = false;
          state.deadlineRemainingTicks = 0;
          state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
        }
        var opCode = void 0;
        var outgoingMsg = void 0;
        if (state.playing) {
          opCode = OpCode.UPDATE;
          var msg_1 = {
            board: state.board,
            mark: state.mark,
            deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate)
          };
          outgoingMsg = msg_1;
        } else {
          opCode = OpCode.DONE;
          var msg_2 = {
            board: state.board,
            winner: state.winner,
            winnerPositions: state.winnerPositions,
            nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate)
          };
          outgoingMsg = msg_2;
        }
        dispatcher.broadcastMessage(opCode, JSON.stringify(outgoingMsg));
        break;
      default:
        dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
        logger.error('Unexpected opcode received: %d', message.opCode);
    }
  }
  if (state.playing) {
    state.deadlineRemainingTicks--;
    if (state.deadlineRemainingTicks <= 0) {
      state.playing = false;
      state.winner = state.mark === Mark.O ? Mark.X : Mark.O;
      state.deadlineRemainingTicks = 0;
      state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
      var msg = {
        board: state.board,
        winner: state.winner,
        nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate),
        winnerPositions: null
      };
      dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(msg));
    }
  }
  return {
    state: state
  };
};
var matchTerminate = function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  return {
    state: state
  };
};
var matchSignal = function matchSignal(ctx, logger, nk, dispatcher, tick, state) {
  return {
    state: state
  };
};
function calculateDeadlineTicks(l) {
  if (l.fast === 1) {
    return turnTimeFastSec * tickRate;
  } else {
    return turnTimeNormalSec * tickRate;
  }
}
function winCheck(board, mark) {
  for (var _i = 0, winningPositions_1 = winningPositions; _i < winningPositions_1.length; _i++) {
    var wp = winningPositions_1[_i];
    if (board[wp[0]] === mark && board[wp[1]] === mark && board[wp[2]] === mark) {
      return [true, wp];
    }
  }
  return [false, null];
}
function connectedPlayers(s) {
  var count = 0;
  for (var _i = 0, _a = Object.keys(s.presences); _i < _a.length; _i++) {
    var p = _a[_i];
    if (s.presences[p] !== null) {
      count++;
    }
  }
  return count;
}
function msecToSec(n) {
  return Math.floor(n / 1000);
}

var rpcFindMatch = function rpcFindMatch(ctx, logger, nk, payload) {
  if (!ctx.userId) {
    throw Error('No user ID in context');
  }
  if (!payload) {
    throw Error('Expects payload.');
  }
  var request = {};
  try {
    request = JSON.parse(payload);
  } catch (error) {
    logger.error('Error parsing json message: %q', error);
    throw error;
  }
  var matches;
  try {
    var query = "+label.open:1 +label.fast:".concat(request.fast ? 1 : 0);
    matches = nk.matchList(10, true, null, null, 1, query);
  } catch (error) {
    logger.error('Error listing matches: %v', error);
    throw error;
  }
  var matchIds = [];
  if (matches.length > 0) {
    matchIds = matches.map(function (m) {
      return m.matchId;
    });
  } else {
    try {
      matchIds.push(nk.matchCreate(moduleName, {
        fast: request.fast
      }));
    } catch (error) {
      logger.error('Error creating match: %v', error);
      throw error;
    }
  }
  var res = {
    matchIds: matchIds
  };
  return JSON.stringify(res);
};

var rpcIdFindMatch = 'find_match_js';
function InitModule(ctx, logger, nk, initializer) {
  initializer.registerRpc(rpcIdFindMatch, rpcFindMatch);
  initializer.registerMatch(moduleName, {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal
  });
  logger.info('JavaScript logic loaded.');
}
!InitModule && InitModule.bind(null);
