import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { RoomManager } from '../src/classes/RoomManager.js';
import { cleanChat, registerHandlers } from '../src/sockets/handlers.js';
import { EVENTS } from '../../shared/protocol.js';

const clients = [];
afterEach(() => { for (const client of clients.splice(0)) client.disconnect(); });
const event = (socket, name, send) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), 2000);
  socket.once(name, value => { clearTimeout(timer); resolve(value); });
  send?.();
});

describe('bonus multiplayer features', () => {
  it('lets spectators join a live hot sauce game and relays boards and garbage', async () => {
    const server = createServer(), ioServer = new Server(server), manager = new RoomManager({ seedFactory: () => 9 });
    registerHandlers(ioServer, manager);
    await new Promise(resolve => server.listen(0, resolve));
    const url = `http://localhost:${server.address().port}`, host = connect(url), rival = connect(url), viewer = connect(url);
    clients.push(host, rival, viewer);
    await Promise.all([event(host, 'connect'), event(rival, 'connect'), event(viewer, 'connect')]);
    await event(host, EVENTS.ROOM_JOINED, () => host.emit(EVENTS.ROOM_JOIN, { room: 'sauce', player: 'chef' }));
    await event(rival, EVENTS.ROOM_JOINED, () => rival.emit(EVENTS.ROOM_JOIN, { room: 'sauce', player: 'pepper' }));
    const started = event(host, EVENTS.GAME_STARTED, () => host.emit(EVENTS.GAME_START, { mode: 'hotSauce' }));
    expect((await started).mode).toBe('hotSauce');
    const joined = event(viewer, EVENTS.ROOM_JOINED), state = event(viewer, EVENTS.SPECTATOR_STATE);
    viewer.emit(EVENTS.ROOM_JOIN, { room: 'sauce', player: 'watcher' });
    expect((await joined).spectator).toBe(true);
    expect((await state).mode).toBe('hotSauce');
    const board = Array.from({ length: 20 }, () => Array(10).fill(null));
    const relayed = event(viewer, EVENTS.PLAYER_BOARD, () => host.emit(EVENTS.GAME_BOARD, { board }));
    expect((await relayed).board).toHaveLength(20);
    const penalty = event(rival, EVENTS.GAME_PENALTY, () => host.emit(EVENTS.GAME_LINES, { cleared: 4 }));
    const attack = await penalty;
    expect(attack.lines).toBe(6);
    expect(attack.holes).toHaveLength(6);
    expect(attack.holes.every(hole => hole >= 0 && hole < 10)).toBe(true);
    const message = event(viewer, EVENTS.CHAT_MESSAGE, () => host.emit(EVENTS.CHAT_SEND, { message: 'hello you shit' }));
    expect((await message).message).toBe('hello you ••••');
    await new Promise(resolve => ioServer.close(resolve));
  });

  it('sanitizes chat text and removes common profanity', () => {
    expect(cleanChat('<img onerror=bad> you shit')).toBe('img onerror=bad you ••••');
    expect(cleanChat('   ')).toBe('');
    expect(cleanChat('x'.repeat(200))).toHaveLength(160);
  });
});
