import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ScoreStore } from '../src/classes/ScoreStore.js';

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('persistent score store', () => {
  it('atomically saves validated records and filters the top twenty', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'red-tetris-scores-')); directories.push(directory);
    const file = path.join(directory, 'nested', 'scores.json'), store = new ScoreStore(file);
    expect(await store.save({ player: '<script>', room: 'room', mode: 'gravity', score: 50, lines: 2, level: 1 })).toBe(false);
    for (let score = 1; score <= 43; score++) await store.save({ player: 'alpha', room: score % 2 ? 'one' : 'two', mode: 'gravity', score, lines: 4, level: 1 });
    expect(await store.save({ player: 'beta', room: 'one', mode: 'ghost', score: 1000, lines: 40, level: 5 })).toBe(true);
    const top = await store.list({ mode: 'gravity', room: 'one' });
    expect(top).toHaveLength(20);
    expect(top[0].score).toBe(43);
    expect(JSON.parse(await readFile(file, 'utf8'))).toHaveLength(44);
  });
});
