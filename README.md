# Red Tetris

Red Tetris is a real-time multiplayer Tetris game made for a 42 School project sponsored by Redpelicans. Players share a room, get the same sequence of pieces, clear rows to send pressure to rivals, and compete to be the last player standing.

![Screenshot placeholder: Red Tetris home screen and multiplayer board]

**Mandatory features:** seven tetrominoes, solo and room play, host start and migration, identical seeded pieces, live opponent spectrums, penalties, and a winner screen. **Bonus features:** four selectable rulesets, score progression, a saved leaderboard, hold, shared 7-bag pieces, spectators, filtered chat, reactions, editable controls, and three themes.

## Prerequisites

- Node.js **24.19.0** (also recorded in `.nvmrc`; supported engine range is Node 24).
- pnpm **11.25.0**. The exact package manager release is pinned in `package.json`.
- Docker and Docker Compose are optional.

## Quick start

Clone the repository from your own Git remote (replace `OWNER` with the GitHub or Git host account that contains it):

```sh
git clone https://github.com/RyuukiBoy/Red-Tetris.git
cd Red-Tetris
cp .env.example .env
pnpm install
```

The clone command becomes usable after the project is pushed to that remote. For a local checkout, run the commands from the project folder instead.

### Development

```sh
pnpm dev
```

Open `http://localhost:5173`. Vite serves the React page and proxies Socket.IO, WebSocket upgrades, and API calls to the Node server. Both services bind to all network interfaces by default.

### Production

```sh
pnpm build
pnpm start
```

Open `http://localhost:3001`. The Node server serves `dist/bundle.js` and falls back to `index.html` for application routes. Set `HOST=0.0.0.0` and choose `PORT` in `.env` to control its network binding and port.

### Docker

```sh
docker compose up --build
```

Open `http://localhost:3001`. Compose publishes the configured `PORT` on all host interfaces and sets the container's `HOST` to `0.0.0.0`.

### Makefile shortcuts

Use `make dev`, `make build`, `make start`, `make test`, `make coverage`, `make lint`, `make up`, `make down`, or `make clean`. A Make implementation and pnpm must be installed first.

## How to play

Enter a room and player name on the home page, or open a direct link in this form:

```text
http://<host>:<port>/<room>/<player_name>
```

### Playing from another device

1. Start Red Tetris with `pnpm dev`, `pnpm start`, or Docker Compose. In development, Vite is the address other devices open (default port `5173`). In production and Docker, use the Node server port (default `3001`).
2. Find the host computer's local network IP. On Linux, run `ip a`, `ifconfig`, or `hostname -I`; on macOS use `ifconfig`; on Windows use `ipconfig`. Use the IPv4 address for the active Wi-Fi or Ethernet network.
3. Share a room URL using that IP and the port for your run, for example `http://192.168.1.42:5173/room1/bob` in development or `http://192.168.1.42:3001/room1/bob` in production. The room and player name are the last two parts of the URL.
4. Both devices must be connected to the same local network. If a custom hostname or a separate frontend origin is used, add its full origin to `CLIENT_ORIGIN` (comma-separated when there is more than one).
5. If the host firewall blocks incoming connections, open the port used in the shared URL. For example, run `sudo ufw allow 5173/tcp` for the default dev server or `sudo ufw allow 3001/tcp` for production/Docker.

For **same machine** multiplayer, open two browser tabs at `http://localhost:5173/room1/alice` and `http://localhost:5173/room1/bob` during development. With production or Docker, replace `5173` with the configured server port.

The first player in a room is its host and can start or restart. Players cannot enter a running or finished round. If a host leaves, the earliest remaining player becomes host. Empty rooms are removed. Rooms run independently.

| Key | Action |
| --- | --- |
| Left / Right | Move the piece |
| Up | Rotate clockwise |
| Down | Soft drop one row |
| Space | Hard drop |

The board is 10 columns by 20 rows. Clearing one row sends no penalty. Clearing two, three, or four rows sends one, two, or three indestructible rows to each living rival. A player loses if a piece cannot spawn or a penalty pushes blocks above the field. The last living player wins; a solo room ends when its player loses. In a bonus mode, press **C** to hold the active piece once per lock. The host can choose Classic, Gravity+, Ghost, or Hot Sauce before starting a round.

## Environment variables

| Variable | Meaning | Default |
| --- | --- | --- |
| `HOST` | Network interface for the Node HTTP and Socket.IO server | `0.0.0.0` |
| `PORT` | HTTP and Socket.IO port | `3001` |
| `VITE_PORT` | Vite dev server port | `5173` |
| `CLIENT_ORIGIN` | Additional allowed browser origin(s), comma-separated | `http://localhost:5173` |
| `MAX_ROOMS` | Maximum concurrent rooms | `100` |
| `MAX_PLAYERS_PER_ROOM` | Maximum players in one room | `8` |
| `SCORE_FILE` | JSON file used for saved scores | `./data/scores.json` |

`.env` is ignored by Git. `.env.example` contains only non-secret defaults; no secrets or tokens are committed.

## Project structure

```text
client/src/game/       Pure board and piece rules
client/src/             React routes, board, controls, and styles
client/src/*.test.*     Client component tests
server/src/classes/     Player, Piece, Game, Room, and RoomManager
server/src/sockets/     Validated Socket.IO event handlers
server/src/index.js     HTTP server, static files, health endpoint
server/tests/           Server and socket integration tests
shared/                 Piece definitions and protocol event names
scripts/                Development launcher and forbidden-pattern check
```

## Architecture

The server owns rooms, players, host state, round state, piece distribution, penalties, player elimination, and winner selection. Its state moves through `lobby`, `running`, and `finished`. Player and room state is in memory; restarting the server clears it.

The server creates a seed for each game and uses a seeded 7-bag randomizer to build the piece list. Each player has an independent index into that list, so timing differences do not change the sequence. The client requests small batches as its queue gets low. Spectators can join a running room and receive board, spectrum, score, chat, and reaction updates without affecting host or winner rules.

The client renders the board and applies pure movement, rotation, collision, locking, and line-clear functions locally for immediate feedback. It sends validated line counts and column heights to the server. The server sends `cleared - 1` penalty rows to each living opponent and relays each player's 10-column spectrum to the rest of the room. Penalty rows have a deterministic hole and cannot be cleared.

## Network protocol

The payload examples below describe the fields used by this build. The server ignores invalid payloads and events that do not fit the current round state.

| Direction | Event | Payload | When sent / errors |
| --- | --- | --- | --- |
| Client → server | `room:join` | `{ room, player }` | On connection. Invalid names, duplicate names, full rooms, and started rooms return `room:error`. |
| Client → server | `game:start` | `{ mode? }` | Host starts or restarts a round. Mode defaults to `classic`; non-host or invalid-mode requests return `room:error`. |
| Client → server | `piece:request` | `{ from }` | Client asks for a batch beginning at a non-negative piece index. |
| Client → server | `game:lines` | `{ cleared }` | After clearing 1–4 rows. Server sends `game:penalty` to rivals for `cleared - 1`. |
| Client → server | `game:spectrum` | `{ columns: number[10] }` | Sends integer column heights from 0 to 20. Invalid arrays are ignored. |
| Client → server | `game:over` | none | Reports that the local player lost. Server announces elimination and a winner when applicable. |
| Client → server | `room:leave` | none | Leaves the room; disconnect also performs cleanup. |
| Server → client | `room:joined` | `{ players, spectators, host, you, state, mode, spectator }` | Confirms a player or spectator join. |
| Server → client | `room:update` | `{ room, host, state, mode, players, spectators }` | Lobby/player state changes. |
| Server → client | `room:error` | `{ code, message }` | Friendly join or host-action error. |
| Server → client | `game:started` | `{ seed, mode, firstPieces, players }` | Round starts. |
| Server → client | `piece:batch` | `{ index, pieces }` | Replies to a valid piece request. |
| Server → client | `game:penalty` | `{ lines, holes? }` | Opponent sends two or more rows. Hot Sauce includes randomized hole columns. |
| Server → client | `opponent:spectrum` | `{ player, columns }` | Opponent spectrum changes. |
| Server → client | `player:lost` | `{ player }` | A player is eliminated. |
| Server → client | `game:finished` | `{ winner }` | Round ends; winner is a name or `null` for solo loss. |
| Server → client | `host:changed` | `{ player }` | Host leaves and another player takes over. |
| Client → server | `game:score` | `{ score, lines, level }` | Publishes bonus-mode stats for the room. Invalid or decreasing values are ignored. |
| Client → server | `game:board` | `{ board: string|null[20][10] }` | Sends a validated board snapshot for spectator viewing. |
| Client → server | `chat:send` | `{ message }` | Sends up to five sanitized messages per five seconds; maximum 160 characters. |
| Client → server | `player:reaction` | `{ emoji }` | Sends a whitelisted emoji reaction; rate-limited. |
| Server → client | `player:score` | `{ player, score, lines, level }` | Rival bonus-mode stats update. |
| Server → client | `player:board` | `{ player, board }` | A live board snapshot for room members and spectators. |
| Server → client | `spectator:state` | `{ mode, boards }` | Initial live-game data for a newly joined spectator. |
| Server → client | `chat:message` | `{ player, message, at }` | Sanitized room message. |
| Server → client | `player:reaction` | `{ player, emoji, at }` | Room reaction from a player or spectator. |

## Subject compliance checklist

| Requirement | Implementation |
| --- | --- |
| Modern JavaScript, React SPA | `client/src`, `index.html`, `vite.config.js` |
| Built client entry named `bundle.js` | Vite `build.rollupOptions.output.entryFileNames` |
| HTTP static serving and SPA fallback | `server/src/index.js` |
| No `this` in client code | Client functional components/hooks; `scripts/check-forbidden.js` and ESLint rule |
| No `<table>`, `<canvas>`, SVG, jQuery, or direct DOM library | Client uses grid/flexbox and React elements; forbidden-pattern check |
| Pure game rules without random/time side effects | `client/src/game/logic.js`; inputs carry board and piece state |
| OO server includes `Player`, `Piece`, and `Game` | `server/src/classes/` |
| Shared protocol and pieces | `shared/` |
| No join after start, host migration, per-room event isolation | `Room`, `RoomManager`, and Socket.IO room handlers |
| Identical piece sequence | `server/src/classes/Piece.js` seeded generator and server tests |
| Coverage gate | `vite.config.js`: 80% statements/functions/lines, 65% branches for pure game rules and server classes |
| No committed secrets | `.env.example` and `.gitignore` |

## Testing

Run the full tests and coverage gate with:

```sh
pnpm test
pnpm coverage
pnpm lint
pnpm build
```

The coverage report is written to `coverage/index.html`. The gate instruments the pure game rules and server classes; Socket.IO protocol behavior, LAN binding, allowed-origin checks, HTTP routes, score persistence, and React home/board/routing behavior are also tested. See the latest test and coverage output for current counts and percentages.

## Bonus features

Choose a ruleset in the host lobby. **Classic** is the default and keeps mandatory constant gravity, ordinary penalties, and no score display. Bonus modes enable scoring and saved records:

- **Gravity+:** gravity accelerates each time the player clears ten rows.
- **Ghost:** locked blocks fade after five seconds; the active and landing-preview pieces remain visible.
- **Hot Sauce:** line attacks send twice as many garbage rows with randomized holes.
- **Scoring:** line clears award 100/300/500/800 base points times level. Soft drops award one point per row; hard drops award two. Combos and back-to-back tetrises add bonuses. Level increases every ten cleared rows.
- **Hold and 7-bag:** press C (or customize the key) to swap the current piece once per lock. The server produces a seeded bag containing one of every piece and shares that sequence with all room players.
- **Spectators:** use the room invite while a round is running. Spectators see live boards, spectrums, scores, chat, and reactions; they do not count as players or affect the winner.
- **Chat and reactions:** chat is limited to 160 characters and five messages per five seconds; common profanity is masked and markup is rendered as plain text. Six preset emoji reactions are available.
- **Controls and themes:** edit keyboard bindings in Arcade Settings. Red Sauce, Night, and Mono themes are saved in local storage; Mono uses block patterns to help distinguish pieces.
- **Leaderboard:** open **High Scores** or `/leaderboard`. Filter the top 20 by mode and room. The read-only endpoint is `GET /api/scores?mode=gravity&room=sauce`; supported mode ids are `classic`, `gravity`, `ghost`, and `hotSauce`. Requests are limited to 30 per minute per client address. Score records are written atomically to `SCORE_FILE`; remove that JSON file to reset the board.

Scores are in-memory for the active round and saved to the JSON leaderboard when the round ends. The client reports score totals to the server, which checks their shape and monotonic progression before storing the result.

## Troubleshooting / FAQ

- **Cannot connect from another device:** confirm both devices are on the same network, share the host's current LAN IP (not `localhost`), and use the dev port (`VITE_PORT`, default `5173`) or server port (`PORT`, default `3001`) for the mode you started.
- **Works on localhost only:** confirm the Node server uses `HOST=0.0.0.0`, restart after changing `.env`, and check that the dev server is reachable at `http://<host-ip>:5173` or production at `http://<host-ip>:3001`. The Vite proxy reads `PORT` and `HOST` from `.env`.
- **Blocked by firewall:** allow inbound TCP on the port in the shared URL. For example, use `sudo ufw allow 5173/tcp` for development or `sudo ufw allow 3001/tcp` for production.
- **Port already in use:** set `PORT` or `VITE_PORT` in `.env` to a free port and restart both services.
- **WebSocket blocked by a proxy:** allow WebSocket upgrades for `/socket.io`; the client also tries Socket.IO polling transport.
- **Room already started:** wait for the host to restart the next round, then join its new lobby.
- **Name already taken:** choose another name in that room. Names are limited to letters, digits, `_`, and `-`.
- **Blank page after refresh:** production routes use the server SPA fallback; run `pnpm build` before `pnpm start` and open the server URL.
- **Reset the leaderboard:** stop the server and delete the file configured by `SCORE_FILE` (default `data/scores.json`). The server recreates it after the next completed bonus round.
- **Docker does not start:** confirm Docker Desktop is running, then retry `docker compose up --build`.

## Tech stack and credits

React 19.3 and Vite 8 render and bundle the client. Node.js 24 and Socket.IO 4 manage HTTP and multiplayer messages. Vitest 5 and React Testing Library check the rules and interface. This is a 42 School project sponsored by Redpelicans.

**License:** MIT. See `LICENSE`.
