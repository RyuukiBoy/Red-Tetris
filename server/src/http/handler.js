import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { GAME_MODES, isGameMode } from '../../../shared/modes.js';

export function createHttpHandler({ dist, scoreStore, now = () => Date.now(), scoreLimit = 30, scoreWindowMs = 60_000 }) {
  const requests = new Map();
  return async (req, res) => {
    try {
      if (req.method !== 'GET') { res.writeHead(405); return res.end('Method not allowed'); }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
      if (url.pathname === '/api/scores') {
        const timestamp = now(), ip = req.socket.remoteAddress || 'unknown';
        const hits = (requests.get(ip) || []).filter(time => timestamp - time < scoreWindowMs);
        if (hits.length >= scoreLimit) { res.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(Math.ceil(scoreWindowMs / 1000)) }); return res.end('{"error":"Rate limit exceeded"}'); }
        hits.push(timestamp); requests.set(ip, hits);
        const mode = url.searchParams.get('mode') || undefined, room = url.searchParams.get('room') || undefined;
        if ((mode && !isGameMode(mode)) || (room && !/^[A-Za-z0-9_-]{1,16}$/.test(room))) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":"Invalid mode or room filter"}'); }
        const scores = await scoreStore.list({ mode, room });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(JSON.stringify({ scores, modes: Object.values(GAME_MODES) }));
      }
      let file = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${dist}${path.sep}`) && file !== dist) throw new Error('bad path');
      try { if (!(await stat(file)).isFile()) throw new Error('directory'); } catch { file = path.join(dist, 'index.html'); }
      const body = await readFile(file), ext = path.extname(file);
      res.writeHead(200, { 'content-type': ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : ext === '.json' ? 'application/json' : 'text/html' });
      res.end(body);
    } catch { res.writeHead(500); res.end('Server error'); }
  };
}
