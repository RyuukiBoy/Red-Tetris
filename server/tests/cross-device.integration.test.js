import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { EVENTS } from '../../shared/protocol.js';
import { RoomManager } from '../src/classes/RoomManager.js';
import { createSocketOptions } from '../src/network.js';
import { registerHandlers } from '../src/sockets/handlers.js';

const clients = [];
const servers = [];
const event = (socket, name, send) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), 3000);
  socket.once(name, value => { clearTimeout(timer); resolve(value); });
  send?.();
});

function machineAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(item => item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.'))
    .map(item => item.address);
}

function connectAt(url, transport, origin) {
  return new Promise((resolve, reject) => {
    const socket = connect(url, { transports: [transport], reconnection: false, timeout: 1600, extraHeaders: origin ? { origin } : undefined });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', error => { socket.disconnect(); reject(error); });
  });
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});

describe('cross-device Socket.IO networking', () => {
  it('allows configured origins and lets two LAN clients share room state and pieces over both transports', async () => {
    const httpServer = createServer();
    const ioServer = new Server(httpServer, createSocketOptions({ clientOrigin: 'http://arcade.example', vitePort: '5173' }));
    servers.push(ioServer);
    registerHandlers(ioServer, new RoomManager({ seedFactory: () => 420 }));
    await new Promise(resolve => httpServer.listen(0, '0.0.0.0', resolve));
    const port = httpServer.address().port;
    let host;
    let address;
    for (const candidate of [...machineAddresses(), '127.0.0.1']) {
      try {
        host = await connectAt(`http://${candidate}:${port}`, 'polling');
        address = candidate;
        break;
      } catch { /* Try another interface before using loopback. */ }
    }
    expect(host).toBeTruthy();
    clients.push(host);
    const guest = await connectAt(`http://${address}:${port}`, 'websocket', 'http://arcade.example');
    clients.push(guest);

    const joinedHost = event(host, EVENTS.ROOM_JOINED, () => host.emit(EVENTS.ROOM_JOIN, { room: 'lan', player: 'alpha' }));
    const initialRoster = event(host, EVENTS.ROOM_UPDATE);
    await joinedHost;
    await initialRoster;
    const hostRoster = event(host, EVENTS.ROOM_UPDATE);
    const joinedGuest = event(guest, EVENTS.ROOM_JOINED, () => guest.emit(EVENTS.ROOM_JOIN, { room: 'lan', player: 'beta' }));
    expect((await joinedGuest).players.map(player => player.name)).toEqual(['alpha', 'beta']);
    expect((await hostRoster).players.map(player => player.name)).toEqual(['alpha', 'beta']);

    const gameForHost = event(host, EVENTS.GAME_STARTED);
    const gameForGuest = event(guest, EVENTS.GAME_STARTED);
    host.emit(EVENTS.GAME_START);
    const [hostGame, guestGame] = await Promise.all([gameForHost, gameForGuest]);
    expect(hostGame.firstPieces).toEqual(guestGame.firstPieces);
    expect(hostGame.seed).toBe(guestGame.seed);

    const columns = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const spectrum = event(guest, EVENTS.OPPONENT_SPECTRUM, () => host.emit(EVENTS.GAME_SPECTRUM, { columns }));
    expect((await spectrum).columns).toEqual(columns);
  });

  it('reflects only an explicitly allowed origin with credentials and rejects a different origin', async () => {
    const httpServer = createServer();
    const ioServer = new Server(httpServer, createSocketOptions({ clientOrigin: 'http://arcade.example' }));
    servers.push(ioServer);
    await new Promise(resolve => httpServer.listen(0, '0.0.0.0', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}/socket.io/?EIO=4&transport=polling`;
    const allowed = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://arcade.example', 'Access-Control-Request-Method': 'GET' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://arcade.example');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    const rejected = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://untrusted.example', 'Access-Control-Request-Method': 'GET' } });
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  });
});
