# Red Tetris

Red Tetris is a real-time multiplayer Tetris game made for a 42 School project sponsored by Redpelicans. Players share a room, get the same sequence of pieces, clear rows to send pressure to rivals, and compete to be the last player standing.

![Screenshot placeholder: Red Tetris home screen and multiplayer board]

**Mandatory features:** seven tetrominoes, solo and room play, host start and migration, identical seeded pieces, live opponent spectrums, penalties, and a winner screen. **Bonus features:** scoring, stored leaderboards, alternate modes, spectators, chat, hold, and theme switching are not part of this mandatory build.

## Prerequisites

- Node.js **24.19.0** (also recorded in `.nvmrc`; supported engine range is Node 24).
- pnpm **11.25.0**. The exact package manager release is pinned in `package.json`.
- Docker and Docker Compose are optional.

## Quick start

Clone the repository from your own Git remote (replace `OWNER` with the GitHub or Git host account that contains it):

```sh
git clone https://github.com/OWNER/red-tetris.git
cd red-tetris
cp .env.example .env
pnpm install
```

The clone command becomes usable after the project is pushed to that remote. For a local checkout, run the commands from the project folder instead.

### Development

```sh
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). Vite serves the React page; the Node server listens on port 3001 for Socket.IO and health checks.

### Production

```sh
pnpm build
pnpm start
```

Open [http://localhost:3001](http://localhost:3001). Vite writes the client entry bundle to `dist/bundle.js`; the Node server serves it and falls back to `index.html` for application routes.

### Docker

```sh
docker compose up --build
```

Open [http://localhost:3001](http://localhost:3001). Docker was not available in the implementation environment, so this path still needs a Docker-enabled run before release.

### Makefile shortcuts

Use `make dev`, `make build`, `make start`, `make test`, `make coverage`, `make lint`, `make up`, `make down`, or `make clean`. A Make implementation and pnpm must be installed first.

## How to play

Enter a room and player name on the home page, or open a direct link in this form:

```text
http://<host>:<port>/<room>/<player_name>
```

For local multiplayer, open two browser tabs and join the same room with different names, for example `/sauce/alpha` and `/sauce/beta`. On another device on the same network, use the host computer's LAN IP in place of `localhost`; allow inbound TCP port 3001 in the host firewall.

The first player in a room is its host and can start or restart. Players cannot enter a running or finished round. If a host leaves, the earliest remaining player becomes host. Empty rooms are removed. Rooms run independently.

| Key | Action |
| --- | --- |
| Left / Right | Move the piece |
| Up | Rotate clockwise |
| Down | Soft drop one row |
| Space | Hard drop |

The board is 10 columns by 20 rows. Clearing one row sends no penalty. Clearing two, three, or four rows sends one, two, or three indestructible rows to each living rival. A player loses if a piece cannot spawn or a penalty pushes blocks above the field. The last living player wins; a solo room ends when its player loses.

## Environment variables

| Variable | Meaning | Default |
| --- | --- | --- |
| `PORT` | HTTP and Socket.IO port | `3001` |
| `MAX_ROOMS` | Maximum concurrent rooms | `100` |
| `MAX_PLAYERS_PER_ROOM` | Maximum players in one room | `8` |

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

The server creates a seed for each game and uses the same deterministic generator to build the piece list. Each player has an independent index into that list, so timing differences do not change the sequence. The client requests small batches as its queue gets low.

The client renders the board and applies pure movement, rotation, collision, locking, and line-clear functions locally for immediate feedback. It sends validated line counts and column heights to the server. The server sends `cleared - 1` penalty rows to each living opponent and relays each player's 10-column spectrum to the rest of the room. Penalty rows have a deterministic hole and cannot be cleared.

## Network protocol

The payload examples below describe the fields used by this build. The server ignores invalid payloads and events that do not fit the current round state.

| Direction | Event | Payload | When sent / errors |
| --- | --- | --- | --- |
| Client → server | `room:join` | `{ room, player }` | On connection. Invalid names, duplicate names, full rooms, and started rooms return `room:error`. |
| Client → server | `game:start` | none | Host starts or restarts a round. Non-host or invalid-state requests return `room:error`. |
| Client → server | `piece:request` | `{ from }` | Client asks for a batch beginning at a non-negative piece index. |
| Client → server | `game:lines` | `{ cleared }` | After clearing 1–4 rows. Server sends `game:penalty` to rivals for `cleared - 1`. |
| Client → server | `game:spectrum` | `{ columns: number[10] }` | Sends integer column heights from 0 to 20. Invalid arrays are ignored. |
| Client → server | `game:over` | none | Reports that the local player lost. Server announces elimination and a winner when applicable. |
| Client → server | `room:leave` | none | Leaves the room; disconnect also performs cleanup. |
| Server → client | `room:joined` | `{ players, host, you, state }` | Confirms a successful join. |
| Server → client | `room:update` | `{ room, host, state, players }` | Lobby/player state changes. |
| Server → client | `room:error` | `{ code, message }` | Friendly join or host-action error. |
| Server → client | `game:started` | `{ seed, firstPieces, players }` | Round starts. |
| Server → client | `piece:batch` | `{ index, pieces }` | Replies to a valid piece request. |
| Server → client | `game:penalty` | `{ lines }` | Opponent sends two or more rows. |
| Server → client | `opponent:spectrum` | `{ player, columns }` | Opponent spectrum changes. |
| Server → client | `player:lost` | `{ player }` | A player is eliminated. |
| Server → client | `game:finished` | `{ winner }` | Round ends; winner is a name or `null` for solo loss. |
| Server → client | `host:changed` | `{ player }` | Host leaves and another player takes over. |

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

The coverage report is written to `coverage/index.html`. The gate instruments the pure game rules and server classes; Socket.IO protocol behavior and React home/board/routing behavior are also tested. Latest run: **92.9% statements, 98.11% functions, 100% lines, and 84.28% branches**, with 23 tests passing. The tests cover movement, collision, rotation, locking, line clears, penalty rows, spectrum, host migration, duplicate names, room limits, seeded piece identity, room isolation, penalties, and winner selection.

## Bonus features

The mandatory build does not include scorekeeping, saved leaderboards, alternate modes, hold, spectators, chat, reactions, custom bindings, theme switching, or persisted scores. There are no flags or endpoints for these yet. They should be added as optional modules after the mandatory rules remain stable. Docker and CI configuration are included as development/deployment support, not gameplay bonuses.

## Troubleshooting / FAQ

- **Port already in use:** set `PORT` in `.env` to a free port. In development, Vite's socket proxy targets port 3001; update `vite.config.js` if you change that server port.
- **WebSocket blocked by a proxy:** allow WebSocket upgrades for `/socket.io`; the client also tries Socket.IO polling transport.
- **Room already started:** wait for the host to restart the next round, then join its new lobby.
- **Name already taken:** choose another name in that room. Names are limited to letters, digits, `_`, and `-`.
- **Blank page after refresh:** production routes use the server SPA fallback; run `pnpm build` before `pnpm start` and open the server URL.
- **Reset the leaderboard:** no leaderboard is implemented in this build, so there is no score file to reset.
- **Docker does not start:** confirm Docker Desktop is running, then retry `docker compose up --build`.

## Tech stack and credits

React 19.3 and Vite 8 render and bundle the client. Node.js 24 and Socket.IO 4 manage HTTP and multiplayer messages. Vitest 5 and React Testing Library check the rules and interface. This is a 42 School project sponsored by Redpelicans.

**License:** MIT. See `LICENSE`.
