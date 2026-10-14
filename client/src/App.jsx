import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/protocol.js';
import { makeBoard, makePiece, PIECES } from '../../shared/pieces.js';
import { addPenalty, cellsFor, collides, ghostPiece, hardDrop, lockPiece, move, rotate, spectrum } from './game/logic.js';

const validName = /^[A-Za-z0-9_-]{1,16}$/;
const newPlayerName = () => ['Pelican', 'Flame', 'Comet', 'Pepper', 'Rocket'][Math.floor(Math.random() * 5)] + Math.floor(10 + Math.random() * 90);

export default function App() {
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/:room/:name" element={<RoomRoute />} /><Route path="*" element={<HomePage />} /></Routes>;
}
function RoomRoute() {
  const { room, name } = useParams();
  return <RoomPage key={`${room}/${name}`} room={room} name={name} />;
}

function HomePage() {
  const navigate = useNavigate();
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const join = (event) => {
    event.preventDefault();
    if (!validName.test(room) || !validName.test(name)) {
      setError('Use 1-16 letters, numbers, underscores or hyphens.');
      return;
    }
    navigate(`/${room}/${name}`);
  };
  const makeInvite = () => {
    const code = validName.test(room) ? room : `room-${Math.floor(Math.random() * 999)}`;
    navigator.clipboard?.writeText(`${window.location.origin}/${code}/Guest`);
    if (!room) setRoom(code);
  };
  return <main className="home">
    <div className="falling" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
    <header className="topbar"><span className="brandmark">RP</span><span className="eyebrow">REDPELICANS ARCADE / 42 SCHOOL</span><span className="live"><b /> MULTIPLAYER LIVE</span></header>
    <section className="hero"><div className="hero-copy">
      <span className="kicker">THE SAUCE IS ON</span><h1>RED<br /><em>TETRIS</em></h1>
      <p className="intro">Stack sharp. Clear lines. Send the heat.<br />Last pelican standing takes the crown.</p>
      <form onSubmit={join} className="join-card"><div className="field-row">
        <label>ROOM CODE<input value={room} onChange={event => setRoom(event.target.value)} maxLength={16} placeholder="e.g. after-hours" aria-label="Room code" /></label>
        <label>PLAYER NAME<input value={name} onChange={event => setName(event.target.value)} maxLength={16} placeholder="e.g. HotWings" aria-label="Player name" /></label>
      </div><div className="form-actions"><div>
        <button type="button" className="quiet" onClick={() => { setRoom(`room-${Math.floor(Math.random() * 999)}`); setName(newPlayerName()); }}>RANDOM ROOM + NAME</button>
        <button type="button" className="quiet invite-home" onClick={makeInvite}>COPY INVITE -&gt;</button>
      </div><button className="primary">ENTER THE ARENA <span>-&gt;</span></button></div>
      {error && <p className="error" role="alert">{error}</p>}</form>
      <div className="feature-strip"><span>01 <b>CLASSIC RULES</b></span><span>02 <b>REAL-TIME RIVALS</b></span><span>03 <b>PURE RED SAUCE</b></span></div>
    </div><div className="mascot-wrap"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="pelican" aria-label="Red pixel pelican mascot"><div className="pelican-eye" /><div className="pelican-beak" /></div><div className="mascot-label">THE SAUCE BOSS<br /><b>EST. 42</b></div><div className="floating-block block-a" /><div className="floating-block block-b" /><div className="floating-block block-c" /></div></section>
    <footer><span>BUILT FOR THE HEAT / BUILT BY REDPELICANS</span><span>10 X 20 GRID / NO MERCY</span></footer>
  </main>;
}

function RoomPage({ room, name }) {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState([]);
  const [host, setHost] = useState('');
  const [phase, setPhase] = useState('connecting');
  const [error, setError] = useState('');
  const [seed, setSeed] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [winner, setWinner] = useState(null);
  const [opponents, setOpponents] = useState({});
  const [status, setStatus] = useState('CONNECTING');
  const [game, setGame] = useState(null);
  const [muted, setMuted] = useState(localStorage.getItem('rt-muted') === 'true');
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const playSound = useSound(mutedRef);

  useEffect(() => {
    if (!validName.test(room) || !validName.test(name)) {
      setError('That room link is invalid.');
      setPhase('error');
      return undefined;
    }
    const client = io({ reconnection: true, tryAllTransports: true });
    setSocket(client);
    client.on('connect', () => { setStatus('CONNECTED'); client.emit(EVENTS.ROOM_JOIN, { room, player: name }); });
    client.on('disconnect', () => setStatus('RECONNECTING'));
    client.on('connect_error', () => setStatus('RECONNECTING'));
    client.on(EVENTS.ROOM_JOINED, data => { setPlayers(data.players); setHost(data.host); setPhase(data.state === 'running' ? 'running' : 'lobby'); });
    client.on(EVENTS.ROOM_UPDATE, data => {
      setPlayers(data.players || []);
      setHost(data.host || '');
      if (data.state === 'finished') setPhase('finished');
      if (data.state === 'deleted') { setPhase('error'); setError('This room is empty now.'); }
    });
    client.on(EVENTS.ROOM_ERROR, data => { setError(data.message); setPhase('error'); });
    client.on(EVENTS.GAME_STARTED, data => {
      setSeed(data.seed);
      setPlayers(data.players || []);
      setWinner(null);
      setGame({ board: makeBoard(), piece: data.firstPieces?.[0] || makePiece('T'), queue: (data.firstPieces || []).slice(1), queueIndex: 8, requestPending: false, lock: 0, lost: false, events: [] });
      setCountdown(3);
      setPhase('running');
    });
    client.on(EVENTS.PIECE_BATCH, data => setGame(current => current ? { ...current, queue: [...current.queue, ...data.pieces], requestPending: false } : current));
    client.on(EVENTS.GAME_PENALTY, data => {
      playSound('penalty');
      setGame(current => {
        if (!current) return current;
        const result = addPenalty(current.board, data.lines);
        return { ...current, board: result.board, lost: result.lost || current.lost, flash: 'penalty' };
      });
    });
    client.on(EVENTS.OPPONENT_SPECTRUM, data => setOpponents(current => ({ ...current, [data.player]: data.columns })));
    client.on(EVENTS.PLAYER_LOST, data => setPlayers(current => current.map(player => player.name === data.player ? { ...player, alive: false } : player)));
    client.on(EVENTS.GAME_FINISHED, data => { playSound(data.winner === name ? 'win' : 'lose'); setWinner(data.winner); setPhase('finished'); });
    client.on(EVENTS.HOST_CHANGED, data => setHost(data.player));
    return () => { client.emit(EVENTS.ROOM_LEAVE); client.disconnect(); };
  }, [room, name]);

  useEffect(() => {
    if (!game?.events?.length) return;
    for (const event of game.events) socket?.emit(event.type, event.payload);
    setGame(current => current ? { ...current, events: [] } : current);
  }, [game?.events, socket]);
  useEffect(() => { if (game?.lost) socket?.emit(EVENTS.GAME_OVER); }, [game?.lost, socket]);
  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown === 0) { setCountdown(null); return undefined; }
    const timer = window.setTimeout(() => setCountdown(value => value - 1), 650);
    return () => window.clearTimeout(timer);
  }, [countdown]);
  useEffect(() => {
    if (!game?.flash) return undefined;
    playSound(game.flash);
    const timer = window.setTimeout(() => setGame(current => current ? { ...current, flash: '' } : current), 350);
    return () => window.clearTimeout(timer);
  }, [game?.flash, playSound]);
  useEffect(() => {
    if (!game?.flash) return undefined;
    const timeout = window.setTimeout(() => setGame(current => current ? { ...current, flash: '' } : current), 350);
    return () => window.clearTimeout(timeout);
  }, [game?.flash]);
  useEffect(() => {
    if (phase !== 'running' || countdown !== null || !game || game.lost) return undefined;
    const interval = window.setInterval(() => setGame(current => current ? advance(current) : current), 700);
    return () => window.clearInterval(interval);
  }, [phase, countdown, game?.lost]);

  const act = useCallback(key => {
    playSound(key === 'Space' ? 'drop' : key === 'ArrowUp' ? 'rotate' : key === 'ArrowDown' ? 'soft' : 'move');
    setGame(current => current ? applyInput(current, key) : current);
  }, [playSound]);
  useKeyboard(phase === 'running' && countdown === null, act);
  const copyInvite = () => navigator.clipboard?.writeText(window.location.href);
  const start = () => socket?.emit(EVENTS.GAME_START);
  const isHost = name === host;

  if (phase === 'connecting') return <div className="center-screen"><div className="loader" />Connecting to the arena...</div>;
  if (phase === 'error') return <div className="center-screen"><div className="error-panel"><span className="kicker">ENTRY DENIED</span><h1>NO ROOM<br />FOR THAT.</h1><p>{error}</p><Link className="primary link-button" to="/">BACK TO BASE -&gt;</Link></div></div>;
  return <main className="arena">
    <header className="arena-head"><Link to="/" className="wordmark">RED<span>TETRIS</span></Link><div className="room-pill"><span className="live"><b />{status}</span><span>ROOM / <strong>{room}</strong></span></div><div className="head-actions"><button className="icon-button" onClick={() => { const next = !muted; setMuted(next); localStorage.setItem('rt-muted', String(next)); }} aria-label={muted ? 'Unmute sound' : 'Mute sound'}>{muted ? 'M' : 'S'}</button><button className="quiet" onClick={copyInvite}>COPY INVITE -&gt;</button></div></header>
    <div className="arena-layout"><aside className="side-panel"><div className="panel-title"><span>THE LINEUP</span><b>{players.length.toString().padStart(2, '0')}</b></div>
      <div className="player-list">{players.map((player, index) => <div className={`player-card ${player.name === name ? 'self' : ''}`} key={player.id}><span className="avatar" style={{ '--hue': index * 46 + 4 }}>{player.name.slice(0, 2).toUpperCase()}</span><span className="player-meta"><b>{player.name}{player.host ? ' [HOST]' : ''}</b><small>{player.alive ? 'IN THE FIGHT' : 'KNOCKED OUT'}</small></span><span className={`status-dot ${player.alive ? '' : 'dead'}`} /></div>)}</div>
      <div className="panel-bottom"><span className="kicker">ROOM LINK</span><code>{window.location.href}</code><button className="quiet" onClick={copyInvite}>COPY LINK -&gt;</button></div>
    </aside><section className="game-stage">
      {countdown !== null && <div className="countdown" aria-live="assertive">{countdown === 0 ? 'GO' : countdown}</div>}
      {phase === 'lobby' ? <div className="lobby-card"><span className="kicker">ROOM {room.toUpperCase()} / {players.length}/8 PLAYERS</span><h1>THE ARENA<br /><em>IS YOURS.</em></h1><p>{isHost ? 'You are the host. Rally the room, then light the fuse.' : 'Waiting for the host to start the game.'}</p>{isHost ? <button className="primary start-button" onClick={start}>START GAME <span>-&gt;</span></button> : <div className="waiting"><span className="pulse-dot" /> WAITING FOR {host.toUpperCase()}</div>}<div className="controls-note">LEFT/RIGHT MOVE - UP ROTATE - DOWN SOFT DROP - SPACE HARD DROP</div></div>
        : phase === 'finished' ? <div className="lobby-card results"><span className="kicker">ROUND COMPLETE</span><h1>{winner ? winner.toUpperCase() : 'GAME'}<br /><em>{winner ? 'WINS' : 'OVER'}</em></h1><p>{winner === name ? 'The sauce is yours.' : winner ? `${winner} takes the crown.` : 'You were the last one standing.'}</p>{isHost && <button className="primary start-button" onClick={start}>PLAY AGAIN -&gt;</button>}</div>
        : <div className="play-layout"><div className="board-shell"><div className="board-top"><span>YOU / {name.toUpperCase()}</span><span className="level-tag">CLASSIC MODE</span></div><Board board={game?.board || makeBoard()} piece={game?.piece} lost={game?.lost} flash={game?.flash} /><div className="board-bottom"><span>ARROWS MOVE</span><span>UP ROTATE</span><span>SPACE DROP</span></div></div>
          <div className="touch-controls" aria-label="Touch game controls"><button aria-label="Move left" onClick={() => act('ArrowLeft')}>LEFT</button><button aria-label="Rotate" onClick={() => act('ArrowUp')}>SPIN</button><button aria-label="Move right" onClick={() => act('ArrowRight')}>RIGHT</button><button aria-label="Soft drop" onClick={() => act('ArrowDown')}>DOWN</button><button aria-label="Hard drop" onClick={() => act('Space')}>DROP</button></div>
          <aside className="next-panel"><span className="kicker">UP NEXT</span>{(game?.queue || []).slice(0, 3).map((piece, index) => <PiecePreview key={`${piece.type}-${index}`} piece={piece} />)}<span className="kicker spectrum-title">RIVAL SIGNALS</span>{players.filter(player => player.name !== name).map(player => <div className="opponent" key={player.id}><div><b>{player.name}</b><small>{player.alive ? 'LIVE' : 'OUT'}</small></div><Spectrum values={opponents[player.name] || player.spectrum || Array(10).fill(0)} /></div>)}</aside>
        </div>}
    </section></div><footer className="arena-foot"><span>REDPELICANS SAUCE / 42 SCHOOL</span><span>SEQUENCE <b>{seed === null ? '--' : seed.toString(16).toUpperCase()}</b></span></footer>
  </main>;
}

function advance(game) {
  if (game.lost) return game;
  const down = move(game.board, game.piece, 0, 1);
  if (down.y !== game.piece.y) return { ...game, piece: down, lock: 0 };
  if (game.lock === 0) return { ...game, lock: 1 };
  const result = lockPiece(game.board, game.piece);
  if (result.lost) return { ...game, board: result.board, lost: true };
  return nextTurn(game, result.board, result.cleared);
}

function applyInput(game, key) {
  if (game.lost) return game;
  let piece = game.piece;
  if (key === 'ArrowLeft') piece = move(game.board, piece, -1, 0);
  if (key === 'ArrowRight') piece = move(game.board, piece, 1, 0);
  if (key === 'ArrowUp') piece = rotate(game.board, piece);
  if (key === 'ArrowDown') piece = move(game.board, piece, 0, 1);
  if (key === 'Space') {
    const result = lockPiece(game.board, hardDrop(game.board, piece));
    if (result.lost) return { ...game, board: result.board, lost: true };
    return nextTurn(game, result.board, result.cleared);
  }
  return { ...game, piece, lock: 0 };
}

function nextTurn(game, board, cleared) {
  const piece = game.queue[0] || makePiece('T');
  const events = [];
  if (collides(board, piece)) return { ...game, board, lost: true };
  if (cleared) events.push({ type: EVENTS.GAME_LINES, payload: { cleared } });
  events.push({ type: EVENTS.GAME_SPECTRUM, payload: { columns: spectrum(board) } });
  const queue = game.queue.slice(1);
  let queueIndex = game.queueIndex;
  let requestPending = game.requestPending;
  if (queue.length < 4 && !requestPending) {
    events.push({ type: EVENTS.PIECE_REQUEST, payload: { from: queueIndex } });
    queueIndex += 8;
    requestPending = true;
  }
  return { ...game, board, piece, queue, queueIndex, requestPending, lock: 0, events, flash: cleared ? 'clear' : '' };
}

export function Board({ board, piece, lost, flash }) {
  const ghost = piece ? ghostPiece(board, piece) : null;
  const cells = useMemo(() => {
    const active = new Map();
    if (ghost) for (const cell of cellsFor(ghost)) active.set(`${cell.x}:${cell.y}`, 'ghost');
    if (piece) for (const cell of cellsFor(piece)) active.set(`${cell.x}:${cell.y}`, `active ${piece.type.toLowerCase()}`);
    return board.flatMap((row, y) => row.map((color, x) => ({ x, y, color, active: active.get(`${x}:${y}`) })));
  }, [board, piece]);
  return <div className={`board ${lost ? 'lost' : ''} ${flash || ''}`} role="grid" aria-label="Tetris board">{cells.map(cell => <BoardCell key={`${cell.x}-${cell.y}`} color={cell.color} active={cell.active} />)}</div>;
}
export const BoardCell = React.memo(function BoardCell({ color, active }) {
  return <div role="gridcell" aria-label={color ? 'filled cell' : 'empty cell'} className={`cell ${color ? `filled ${String(color).toLowerCase()}` : ''} ${active || ''}`} />;
});
function PiecePreview({ piece }) {
  const coords = PIECES[piece.type].rotations[0];
  return <div className="preview" aria-label={`${piece.type} next piece`}>{coords.map(([x, y], index) => <i key={index} className={`mini ${piece.type.toLowerCase()}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} />)}</div>;
}
function Spectrum({ values }) { return <div className="spectrum" aria-label="Opponent column heights">{values.map((value, index) => <i key={index} style={{ '--height': `${Math.max(4, value * 4)}px` }} />)}</div>; }
function useSound(mutedRef) {
  return useCallback(kind => {
    if (mutedRef.current) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const context = new Audio();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const notes = { move: 220, rotate: 330, soft: 180, drop: 95, clear: 540, penalty: 80, win: 660, lose: 120 };
    oscillator.type = 'sine';
    oscillator.frequency.value = notes[kind] || 240;
    gain.gain.setValueAtTime(0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.13);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => context.close();
    oscillator.start();
    oscillator.stop(context.currentTime + 0.13);
  }, [mutedRef]);
}
function useKeyboard(enabled, act) {
  useEffect(() => {
    if (!enabled) return undefined;
    const keydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) return;
      event.preventDefault();
      if (!event.repeat) act(event.key === ' ' ? 'Space' : event.key);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [enabled, act]);
}
