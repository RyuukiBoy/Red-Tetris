import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ScoreStore } from '../src/classes/ScoreStore.js';
import { createHttpHandler } from '../src/http/handler.js';

const servers = [], directories = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function endpoint(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'red-tetris-api-')); directories.push(directory);
  const store = new ScoreStore(path.join(directory, 'scores.json'));
  await store.save({ player: 'alpha', room: 'sauce', mode: 'gravity', score: 123, lines: 12, level: 2 });
  const server = createServer(createHttpHandler({ dist: directory, scoreStore: store, ...options })); servers.push(server);
  await new Promise(resolve => server.listen(0, resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

describe('HTTP routes', () => {
  it('returns filtered leaderboard records and rejects invalid filters', async () => {
    const base = await endpoint();
    const response = await fetch(`${base}/api/scores?mode=gravity&room=sauce`);
    expect(response.status).toBe(200);
    expect((await response.json()).scores[0].player).toBe('alpha');
    expect((await fetch(`${base}/api/scores?mode=unknown`)).status).toBe(400);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });
  it('rate limits the leaderboard route by client address', async () => {
    const base = await endpoint({ scoreLimit: 2 });
    expect((await fetch(`${base}/api/scores`)).status).toBe(200);
    expect((await fetch(`${base}/api/scores`)).status).toBe(200);
    expect((await fetch(`${base}/api/scores`)).status).toBe(429);
  });
});
