import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isGameMode } from '../../../shared/modes.js';

const safeName = /^[A-Za-z0-9_-]{1,16}$/;
const validEntry = entry => entry && typeof entry.player === 'string' && safeName.test(entry.player)
  && typeof entry.room === 'string' && safeName.test(entry.room) && isGameMode(entry.mode)
  && Number.isSafeInteger(entry.score) && entry.score >= 0
  && Number.isInteger(entry.lines) && entry.lines >= 0
  && Number.isInteger(entry.level) && entry.level >= 1
  && typeof entry.recordedAt === 'string' && Number.isFinite(Date.parse(entry.recordedAt));
const cleanEntry = entry => ({
  player: entry.player,
  room: entry.room,
  mode: entry.mode,
  score: entry.score,
  lines: entry.lines,
  level: entry.level,
  recordedAt: entry.recordedAt
});

export class ScoreStore {
  constructor(filePath) { this.filePath = path.resolve(filePath); this.pending = Promise.resolve(); }
  async read() {
    try {
      const entries = JSON.parse(await readFile(this.filePath, 'utf8'));
      return Array.isArray(entries) ? entries.filter(validEntry).map(cleanEntry) : [];
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async save(entry) {
    if (!entry || typeof entry.player !== 'string' || !safeName.test(entry.player) || typeof entry.room !== 'string' || !safeName.test(entry.room) || !isGameMode(entry.mode) || !Number.isSafeInteger(entry.score) || entry.score < 0 || !Number.isInteger(entry.lines) || entry.lines < 0 || !Number.isInteger(entry.level) || entry.level < 1) return false;
    const record = cleanEntry({ ...entry, recordedAt: new Date().toISOString() });
    this.pending = this.pending.catch(() => {}).then(async () => {
      const scores = await this.read();
      scores.push(record);
      scores.sort((a, b) => b.score - a.score || b.recordedAt.localeCompare(a.recordedAt));
      const directory = path.dirname(this.filePath);
      await mkdir(directory, { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(scores.slice(0, 5000), null, 2)}\n`, 'utf8');
      await rename(temporary, this.filePath);
    });
    await this.pending;
    return true;
  }
  async list({ mode, room } = {}) {
    const scores = await this.read();
    return scores.filter(entry => (!mode || entry.mode === mode) && (!room || entry.room.toLowerCase() === room.toLowerCase()))
      .sort((a, b) => b.score - a.score || b.recordedAt.localeCompare(a.recordedAt)).slice(0, 20);
  }
}
