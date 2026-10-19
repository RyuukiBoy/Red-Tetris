import { EVENTS } from '../../../shared/protocol.js';
import { isGameMode } from '../../../shared/modes.js';

const safeName = /^[A-Za-z0-9_-]{1,16}$/;
const colors = new Set(['cyan', 'blue', 'orange', 'yellow', 'green', 'purple', 'red', 'garbage']);
const reactions = new Set(['🔥', '👏', '👀', '💀', '🦤', '💯']);
const blockedWords = /\b(fuck|shit|bitch|asshole|cunt|bastard)\b/gi;
export const penaltyLines = cleared => cleared > 1 ? cleared - 1 : 0;
export const cleanChat = value => typeof value === 'string'
  ? value.replace(/[<>\u0000-\u001f\u007f]/g, '').replace(blockedWords, '••••').trim().slice(0, 160)
  : '';
const sendError = (socket, code, message) => socket.emit(EVENTS.ROOM_ERROR, { code, message });
const validBoard = board => Array.isArray(board) && board.length === 20 && board.every(row => Array.isArray(row) && row.length === 10 && row.every(cell => cell === null || colors.has(cell)));

export function registerHandlers(io, manager, { scoreStore } = {}) {
  io.on('connection', socket => {
    let joinedRoom = null;
    const chatTimes = [];
    const reactionTimes = [];
    socket.on(EVENTS.ROOM_JOIN, payload => {
      if (joinedRoom) return sendError(socket, 'ALREADY_JOINED', 'You are already in a room.');
      const { room, player } = payload ?? {};
      if (typeof room !== 'string' || typeof player !== 'string' || !safeName.test(room) || !safeName.test(player)) return sendError(socket, 'INVALID_NAME', 'Use 1-16 letters, numbers, underscores or hyphens.');
      try {
        const result = manager.join(room, player, socket.id);
        joinedRoom = room;
        socket.join(room);
        const snapshot = result.room.snapshot();
        socket.emit(EVENTS.ROOM_JOINED, { players: snapshot.players, spectators: snapshot.spectators, host: snapshot.host, you: player, state: result.room.game.state, mode: result.room.game.mode, spectator: result.spectator });
        io.to(room).emit(EVENTS.ROOM_UPDATE, snapshot);
        if (result.spectator) socket.emit(EVENTS.SPECTATOR_STATE, { mode: result.room.game.mode, boards: result.room.players.map(item => ({ player: item.name, board: item.board, score: item.score, lines: item.lines, level: item.level, spectrum: item.spectrum, alive: item.alive })) });
      } catch (error) {
        sendError(socket, error.message, error.message === 'NAME_TAKEN' ? 'That name is already in this room.' : error.message === 'ROOM_STARTED' ? 'This round has finished. Wait for the next lobby.' : 'This room cannot accept that player.');
      }
    });
    socket.on(EVENTS.GAME_START, payload => {
      const room = manager.get(joinedRoom);
      if (!room) return;
      const mode = payload?.mode ?? 'classic';
      if (!isGameMode(mode)) return sendError(socket, 'INVALID_MODE', 'Choose one of the available game modes.');
      try {
        room.start(socket.id, mode);
        io.to(joinedRoom).emit(EVENTS.GAME_STARTED, { seed: room.game.seed, mode, firstPieces: room.game.batch(0, 8), players: room.snapshot().players });
      } catch (error) { sendError(socket, error.message, 'Only the host can start a lobby game.'); }
    });
    socket.on(EVENTS.PIECE_REQUEST, payload => {
      const room = manager.get(joinedRoom), player = room?.getPlayer(socket.id);
      if (!room || room.game.state !== 'running' || !player || !Number.isInteger(payload?.from) || payload.from < 0) return;
      const index = Math.min(payload.from, room.game.sequence.length - 8);
      player.pieceIndex = Math.max(player.pieceIndex, index + 8);
      socket.emit(EVENTS.PIECE_BATCH, { index, pieces: room.game.batch(index, 8) });
    });
    socket.on(EVENTS.GAME_SPECTRUM, payload => {
      const room = manager.get(joinedRoom), player = room?.getPlayer(socket.id);
      if (!player || room.game.state !== 'running' || !Array.isArray(payload?.columns) || payload.columns.length !== 10 || payload.columns.some(n => !Number.isInteger(n) || n < 0 || n > 20)) return;
      player.spectrum = payload.columns;
      socket.to(joinedRoom).emit(EVENTS.OPPONENT_SPECTRUM, { player: player.name, columns: player.spectrum });
    });
    socket.on(EVENTS.GAME_SCORE, payload => {
      const room = manager.get(joinedRoom), player = room?.getPlayer(socket.id);
      if (!player || room.game.state !== 'running' || !Number.isSafeInteger(payload?.score) || payload.score < player.score || payload.score > 1_000_000_000 || !Number.isInteger(payload.lines) || payload.lines < player.lines || payload.lines > 10000 || !Number.isInteger(payload.level) || payload.level < 1 || payload.level > 1001) return;
      Object.assign(player, { score: payload.score, lines: payload.lines, level: payload.level });
      socket.to(joinedRoom).emit(EVENTS.PLAYER_SCORE, { player: player.name, score: player.score, lines: player.lines, level: player.level });
    });
    socket.on(EVENTS.GAME_BOARD, payload => {
      const room = manager.get(joinedRoom), player = room?.getPlayer(socket.id);
      if (!player || room.game.state !== 'running' || !validBoard(payload?.board)) return;
      player.board = payload.board;
      socket.to(joinedRoom).emit(EVENTS.PLAYER_BOARD, { player: player.name, board: player.board });
    });
    socket.on(EVENTS.GAME_LINES, payload => {
      const room = manager.get(joinedRoom);
      if (!room || room.game.state !== 'running' || !room.getPlayer(socket.id) || ![1, 2, 3, 4].includes(payload?.cleared)) return;
      const base = penaltyLines(payload.cleared);
      const lines = room.game.mode === 'hotSauce' ? base * 2 : base;
      if (lines > 0) for (const target of room.alive()) if (target.id !== socket.id) {
        const holes = room.game.mode === 'hotSauce' ? Array.from({ length: lines }, () => Math.floor(Math.random() * 10)) : undefined;
        io.to(target.id).emit(EVENTS.GAME_PENALTY, { lines, holes });
      }
    });
    socket.on(EVENTS.CHAT_SEND, payload => {
      const room = manager.get(joinedRoom), player = room && [...room.players, ...room.spectators].find(item => item.id === socket.id);
      const now = Date.now();
      while (chatTimes.length && now - chatTimes[0] > 5000) chatTimes.shift();
      if (!room || !player || chatTimes.length >= 5) return;
      const message = cleanChat(payload?.message);
      if (!message) return;
      chatTimes.push(now);
      io.to(joinedRoom).emit(EVENTS.CHAT_MESSAGE, { player: player.name, message, at: now });
    });
    socket.on(EVENTS.REACTION, payload => {
      const room = manager.get(joinedRoom), player = room && [...room.players, ...room.spectators].find(item => item.id === socket.id);
      const now = Date.now();
      while (reactionTimes.length && now - reactionTimes[0] > 5000) reactionTimes.shift();
      if (!room || !player || !reactions.has(payload?.emoji) || reactionTimes.length >= 5) return;
      reactionTimes.push(now);
      io.to(joinedRoom).emit(EVENTS.REACTION, { player: player.name, emoji: payload.emoji, at: now });
    });
    socket.on(EVENTS.GAME_OVER, () => {
      const room = manager.get(joinedRoom), player = room?.getPlayer(socket.id);
      if (!player || room.game.state !== 'running') return;
      player.lose();
      io.to(joinedRoom).emit(EVENTS.PLAYER_LOST, { player: player.name });
      maybeFinish(room, joinedRoom);
    });
    socket.on(EVENTS.ROOM_LEAVE, leave);
    socket.on('disconnect', leave);
    function leave() {
      if (!joinedRoom) return;
      const name = joinedRoom;
      const result = manager.leave(name, socket.id);
      joinedRoom = null;
      if (!result) return;
      if (result.deleted) { io.to(name).emit(EVENTS.ROOM_UPDATE, { room: name, players: [], spectators: [], state: 'deleted' }); return; }
      if (result.hostChanged) io.to(name).emit(EVENTS.HOST_CHANGED, { player: result.host.name });
      io.to(name).emit(EVENTS.ROOM_UPDATE, result.room.snapshot());
      if (result.room.game.state === 'running') maybeFinish(result.room, name);
    }
  });

  function maybeFinish(room, roomName) {
    const winner = room.maybeFinish();
    if (room.game.state !== 'finished') { io.to(roomName).emit(EVENTS.ROOM_UPDATE, room.snapshot()); return; }
    io.to(roomName).emit(EVENTS.ROOM_UPDATE, room.snapshot());
    io.to(roomName).emit(EVENTS.GAME_FINISHED, { winner: winner?.name ?? null });
    if (!room.game.scoreSaved) {
      room.game.scoreSaved = true;
      if (scoreStore && room.game.mode !== 'classic') for (const player of room.players) {
        scoreStore.save({ player: player.name, room: room.name, mode: room.game.mode, score: player.score, lines: player.lines, level: player.level }).catch(error => console.error('Score save failed:', error.message));
      }
    }
  }
}
