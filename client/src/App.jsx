import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/protocol.js';
import { GAME_MODES } from '../../shared/modes.js';
import { levelForLines, pointsForDrop, scoreClear } from '../../shared/scoring.js';
import { makeBoard, makePiece, PIECES } from '../../shared/pieces.js';
import { addPenalty, cellsFor, collides, ghostPiece, hardDrop, lockPiece, move, rotate, spectrum } from './game/logic.js';

const validName = /^[A-Za-z0-9_-]{1,16}$/;
const DEFAULT_BINDINGS = Object.freeze({ left: 'ArrowLeft', right: 'ArrowRight', rotate: 'ArrowUp', soft: 'ArrowDown', drop: 'Space', hold: 'c' });
const BINDING_OPTIONS = [['ArrowLeft', 'Left'], ['ArrowRight', 'Right'], ['ArrowUp', 'Up'], ['ArrowDown', 'Down'], ['Space', 'Space'], ['c', 'C'], ['Shift', 'Shift'], ['x', 'X']];
const REACTIONS = ['🔥', '👏', '👀', '💀', '🦤', '💯'];
const newPlayerName = () => ['Pelican', 'Flame', 'Comet', 'Pepper', 'Rocket'][Math.floor(Math.random() * 5)] + Math.floor(10 + Math.random() * 90);

export default function App() {
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/leaderboard" element={<LeaderboardPage />} /><Route path="/:room/:name" element={<RoomRoute />} /><Route path="*" element={<HomePage />} /></Routes>;
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
  const join = event => {
    event.preventDefault();
    if (!validName.test(room) || !validName.test(name)) { setError('Use 1-16 letters, numbers, underscores or hyphens.'); return; }
    navigate(`/${room}/${name}`);
  };
  const makeInvite = async () => {
    const code = validName.test(room) ? room : `room-${Math.floor(Math.random() * 999)}`;
    if (!room) setRoom(code);
    try { await navigator.clipboard?.writeText(`${window.location.origin}/${code}/Guest`); } catch { setError('Copy failed. Share the room link from the address bar.'); }
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
      <div className="feature-strip"><span>01 <b>CLASSIC RULES</b></span><span>02 <b>REAL-TIME RIVALS</b></span><span>03 <b>FOUR GAME MODES</b></span></div>
      <Link className="leaderboard-link" to="/leaderboard">VIEW THE HIGH SCORES -&gt;</Link>
    </div><div className="mascot-wrap"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="pelican" aria-label="Red pixel pelican mascot"><div className="pelican-eye" /><div className="pelican-beak" /></div><div className="mascot-label">THE SAUCE BOSS<br /><b>EST. 42</b></div><div className="floating-block block-a" /><div className="floating-block block-b" /><div className="floating-block block-c" /></div></section>
    <footer><span>BUILT FOR THE HEAT / BUILT BY REDPELICANS</span><span>10 X 20 GRID / NO MERCY</span></footer>
  </main>;
}

function RoomPage({ room, name }) {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState([]);
  const [spectators, setSpectators] = useState([]);
  const [host, setHost] = useState('');
  const [phase, setPhase] = useState('connecting');
  const [error, setError] = useState('');
  const [seed, setSeed] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [winner, setWinner] = useState(null);
  const [opponents, setOpponents] = useState({});
  const [boards, setBoards] = useState({});
  const [status, setStatus] = useState('CONNECTING');
  const [game, setGame] = useState(null);
  const spectatorRef = useRef(false);
  const [mode, setMode] = useState('classic');
  const [selectedMode, setSelectedMode] = useState('classic');
  const [theme, setTheme] = useState(localStorage.getItem('rt-theme') || 'sauce');
  const [bindings, setBindings] = useState(readBindings);
  const [blocksFaded, setBlocksFaded] = useState(false);
  const [chat, setChat] = useState([]);
  const [chatText, setChatText] = useState('');
  const [reaction, setReaction] = useState(null);
  const [muted, setMuted] = useState(localStorage.getItem('rt-muted') === 'true');
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const playSound = useSound(mutedRef);

  useEffect(() => {
    if (!validName.test(room) || !validName.test(name)) { setError('That room link is invalid.'); setPhase('error'); return undefined; }
    const client = io({ reconnection: true, tryAllTransports: true });
    setSocket(client);
    client.on('connect', () => { setStatus('CONNECTED'); client.emit(EVENTS.ROOM_JOIN, { room, player: name }); });
    client.on('disconnect', () => setStatus('RECONNECTING'));
    client.on('connect_error', () => setStatus('RECONNECTING'));
    client.on(EVENTS.ROOM_JOINED, data => {
      spectatorRef.current = Boolean(data.spectator);
      setPlayers(data.players || []); setSpectators(data.spectators || []); setHost(data.host); setMode(data.mode || 'classic');
      setPhase(data.spectator ? 'spectating' : data.state === 'running' ? 'running' : 'lobby');
    });
    client.on(EVENTS.ROOM_UPDATE, data => {
      setPlayers(data.players || []); setSpectators(data.spectators || []); setHost(data.host || ''); setMode(data.mode || 'classic');
      if (data.state === 'finished') setPhase('finished');
      if (data.state === 'deleted') { setPhase('error'); setError('Room has no players now.'); }
    });
    client.on(EVENTS.ROOM_ERROR, data => { setError(data.message); setPhase('error'); });
    client.on(EVENTS.GAME_STARTED, data => {
      setSeed(data.seed); setMode(data.mode || 'classic'); setSelectedMode(data.mode || 'classic'); setPlayers(data.players || []); setWinner(null);
      if (spectatorRef.current) { setPhase('spectating'); return; }
      setGame(createGame(data)); setCountdown(3); setPhase('running');
    });
    client.on(EVENTS.SPECTATOR_STATE, data => {
      setMode(data.mode || 'classic');
      setBoards(Object.fromEntries((data.boards || []).filter(item => item.board).map(item => [item.player, item.board])));
      setOpponents(Object.fromEntries((data.boards || []).map(item => [item.player, item.spectrum || Array(10).fill(0)])));
      setPlayers(current => current.map(player => ({ ...player, ...(data.boards || []).find(item => item.player === player.name) })));
    });
    client.on(EVENTS.PIECE_BATCH, data => setGame(current => current ? { ...current, queue: [...current.queue, ...data.pieces], requestPending: false } : current));
    client.on(EVENTS.GAME_PENALTY, data => {
      playSound('penalty');
      setGame(current => { if (!current) return current; const result = addPenalty(current.board, data.lines, data.holes || []); return { ...current, board: result.board, lost: result.lost || current.lost, flash: 'penalty' }; });
    });
    client.on(EVENTS.OPPONENT_SPECTRUM, data => setOpponents(current => ({ ...current, [data.player]: data.columns })));
    client.on(EVENTS.PLAYER_BOARD, data => setBoards(current => ({ ...current, [data.player]: data.board })));
    client.on(EVENTS.PLAYER_SCORE, data => setPlayers(current => current.map(player => player.name === data.player ? { ...player, ...data } : player)));
    client.on(EVENTS.PLAYER_LOST, data => setPlayers(current => current.map(player => player.name === data.player ? { ...player, alive: false } : player)));
    client.on(EVENTS.GAME_FINISHED, data => { playSound(data.winner === name ? 'win' : 'lose'); setWinner(data.winner); setPhase('finished'); });
    client.on(EVENTS.HOST_CHANGED, data => setHost(data.player));
    client.on(EVENTS.CHAT_MESSAGE, data => setChat(current => [...current.slice(-79), data]));
    client.on(EVENTS.REACTION, data => { setReaction(data); window.setTimeout(() => setReaction(current => current === data ? null : current), 1800); });
    return () => { client.emit(EVENTS.ROOM_LEAVE); client.disconnect(); };
  }, [room, name]);

  useEffect(() => {
    if (!game?.events?.length) return;
    for (const event of game.events) socket?.emit(event.type, event.payload);
    setGame(current => current ? { ...current, events: [] } : current);
  }, [game?.events, socket]);
  useEffect(() => { if (game?.lost) socket?.emit(EVENTS.GAME_OVER); }, [game?.lost, socket]);
  useEffect(() => {
    if (!game || !socket || phase !== 'running' || mode === 'classic') return;
    socket.emit(EVENTS.GAME_SCORE, { score: game.score, lines: game.lines, level: game.level });
  }, [game?.score, game?.lines, game?.level, mode, phase, socket]);
  useEffect(() => {
    if (!game?.board || !socket || phase !== 'running') return;
    socket.emit(EVENTS.GAME_SPECTRUM, { columns: spectrum(game.board) });
    socket.emit(EVENTS.GAME_BOARD, { board: game.board });
  }, [game?.board, phase, socket]);
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
    if (phase !== 'running' || countdown !== null || !game || game.lost) return undefined;
    const delay = mode === 'gravity' ? Math.max(110, 700 - (game.level - 1) * 48) : 700;
    const interval = window.setInterval(() => setGame(current => current ? advance(current) : current), delay);
    return () => window.clearInterval(interval);
  }, [phase, countdown, game?.lost, game?.level, mode]);
  useEffect(() => {
    if (mode !== 'ghost' || !game?.board) { setBlocksFaded(false); return undefined; }
    setBlocksFaded(false);
    const timer = window.setTimeout(() => setBlocksFaded(true), 5000);
    return () => window.clearTimeout(timer);
  }, [mode, game?.board]);
  useEffect(() => { localStorage.setItem('rt-theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('rt-bindings', JSON.stringify(bindings)); }, [bindings]);

  const act = useCallback(action => {
    if (['drop', 'hold'].includes(action)) playSound(action === 'drop' ? 'drop' : 'move');
    else playSound(action === 'rotate' ? 'rotate' : action === 'soft' ? 'soft' : 'move');
    setGame(current => current ? applyInput(current, action) : current);
  }, [playSound]);
  useKeyboard(phase === 'running' && countdown === null, bindings, act);
  const copyInvite = async (spectator = false) => { try { const link = spectator ? `${window.location.origin}/${room}/${newPlayerName()}` : window.location.href; await navigator.clipboard?.writeText(link); } catch { setError('Copy failed. Use the address bar to share the invite.'); } };
  const start = () => socket?.emit(EVENTS.GAME_START, { mode: selectedMode });
  const sendChat = event => { event.preventDefault(); if (!chatText.trim()) return; socket?.emit(EVENTS.CHAT_SEND, { message: chatText }); setChatText(''); };
  const isHost = name === host;
  const displayPlayers = players.filter(player => player.name !== name);

  if (phase === 'connecting') return <div className="center-screen"><div className="loader" />Connecting to the arena...</div>;
  if (phase === 'error') return <div className="center-screen"><div className="error-panel"><span className="kicker">ENTRY DENIED</span><h1>NO ROOM<br />FOR THAT.</h1><p>{error}</p><Link className="primary link-button" to="/">BACK TO BASE -&gt;</Link></div></div>;
  return <main className={`arena theme-${theme}`}>
    <header className="arena-head"><Link to="/" className="wordmark">RED<span>TETRIS</span></Link><div className="room-pill"><span className="live"><b />{status}</span><span>ROOM / <strong>{room}</strong></span></div><div className="head-actions"><Link className="quiet" to="/leaderboard">SCORES</Link><button className="icon-button" onClick={() => { const next = !muted; setMuted(next); localStorage.setItem('rt-muted', String(next)); }} aria-label={muted ? 'Unmute sound' : 'Mute sound'}>{muted ? 'M' : 'S'}</button>{phase === 'running' && <button className="quiet" onClick={() => copyInvite(true)}>SPECTATOR LINK -&gt;</button>}<button className="quiet" onClick={copyInvite}>COPY INVITE -&gt;</button></div></header>
    <div className="arena-layout"><aside className="side-panel"><div className="panel-title"><span>THE LINEUP</span><b>{players.length.toString().padStart(2, '0')}</b></div>
      <div className="player-list">{players.map((player, index) => <div className={`player-card ${player.name === name ? 'self' : ''}`} key={player.id}><span className="avatar" style={{ '--hue': index * 46 + 4 }}>{player.name.slice(0, 2).toUpperCase()}</span><span className="player-meta"><b>{player.name}{player.host ? ' [HOST]' : ''}{player.spectator ? ' [VIEWER]' : ''}</b><small>{player.spectator ? 'WATCHING' : player.alive ? 'IN THE FIGHT' : 'KNOCKED OUT'}{player.score > 0 ? ` · ${player.score.toLocaleString()}` : ''}</small></span><span className={`status-dot ${player.alive ? '' : 'dead'}`} /></div>)}</div>
      <div className="spectator-count">{spectators.length} spectator{spectators.length === 1 ? '' : 's'}</div>
      <div className="panel-bottom"><span className="kicker">ROOM LINK</span><code>{window.location.href}</code><button className="quiet" onClick={copyInvite}>COPY LINK -&gt;</button></div>
    </aside><section className="game-stage">
      {countdown !== null && <div className="countdown" aria-live="assertive">{countdown === 0 ? 'GO' : countdown}</div>}
      {phase === 'lobby' ? <div className="lobby-card"><span className="kicker">ROOM {room.toUpperCase()} / {players.length}/8 PLAYERS</span><h1>THE ARENA<br /><em>IS YOURS.</em></h1><p>{isHost ? 'You are the host. Rally the room, then light the fuse.' : 'Waiting for the host to start the game.'}</p>{isHost ? <div className="mode-picker"><label htmlFor="mode-select">CHOOSE YOUR RULESET</label><select id="mode-select" value={selectedMode} onChange={event => setSelectedMode(event.target.value)}>{Object.values(GAME_MODES).map(item => <option key={item.id} value={item.id}>{item.label} — {item.description}</option>)}</select><button className="primary start-button" onClick={start}>START GAME <span>-&gt;</span></button></div> : <div className="waiting"><span className="pulse-dot" /> WAITING FOR {host.toUpperCase()}</div>}<div className="lobby-links"><Link to="/leaderboard">LEADERBOARD -&gt;</Link><button type="button" onClick={copyInvite}>INVITE A PLAYER -&gt;</button></div></div>
        : phase === 'spectating' ? <SpectatorView room={room} mode={mode} players={displayPlayers} boards={boards} opponents={opponents} />
        : phase === 'finished' ? <div className="lobby-card results"><span className="kicker">ROUND COMPLETE / {GAME_MODES[mode]?.label}</span><h1>{winner ? winner.toUpperCase() : 'GAME'}<br /><em>{winner ? 'WINS' : 'OVER'}</em></h1><p>{winner === name ? 'The sauce is yours.' : winner ? `${winner} takes the crown.` : 'You were the last one standing.'}</p>{game && mode !== 'classic' && <p className="final-score">YOUR SCORE / {game.score.toLocaleString()} · {game.lines} LINES · LEVEL {game.level}</p>}{isHost && <button className="primary start-button" onClick={start}>PLAY AGAIN -&gt;</button>}</div>
        : <div className="play-layout"><div className="board-shell"><div className="board-top"><span>YOU / {name.toUpperCase()}</span><span className="level-tag">{GAME_MODES[mode]?.label.toUpperCase()}</span></div>{mode !== 'classic' && <div className="score-strip"><b>{(game?.score || 0).toLocaleString()}</b><span>{game?.lines || 0} LINES</span><span>LEVEL {game?.level || 1}</span><span>COMBO {Math.max(0, game?.combo || 0)}</span></div>}<Board board={game?.board || makeBoard()} piece={game?.piece} lost={game?.lost} flash={game?.flash} faded={blocksFaded} mode={mode} /><div className="board-bottom"><span>ARROWS MOVE</span><span>UP ROTATE</span><span>SPACE DROP</span></div></div>
          <div className="touch-controls" aria-label="Touch game controls"><button aria-label="Move left" onClick={() => act('left')}>←</button><button aria-label="Hold piece" onClick={() => act('hold')}>HOLD</button><button aria-label="Rotate" onClick={() => act('rotate')}>↻</button><button aria-label="Move right" onClick={() => act('right')}>→</button><button aria-label="Soft drop" onClick={() => act('soft')}>↓</button><button aria-label="Hard drop" onClick={() => act('drop')}>DROP</button></div>
          <aside className="next-panel"><span className="kicker">HOLD</span><PiecePreview piece={game?.hold ? makePiece(game.hold) : null} emptyLabel="EMPTY" /><span className="kicker">UP NEXT</span>{(game?.queue || []).slice(0, 3).map((piece, index) => <PiecePreview key={`${piece.type}-${index}`} piece={piece} />)}<span className="kicker spectrum-title">RIVAL SIGNALS</span>{displayPlayers.map(player => <div className="opponent" key={player.id}><div><b>{player.name}</b><small>{player.alive ? 'LIVE' : 'OUT'}{player.score > 0 ? ` · ${player.score.toLocaleString()}` : ''}</small></div><Spectrum values={opponents[player.name] || player.spectrum || Array(10).fill(0)} /></div>)}</aside>
        </div>}
      {reaction && <div className="reaction-float" aria-live="polite">{reaction.emoji} <small>{reaction.player}</small></div>}
    </section><aside className="social-panel"><RoomChat chat={chat} chatText={chatText} setChatText={setChatText} sendChat={sendChat} /><section className="settings-card"><span className="kicker">ARCADE SETTINGS</span><label>THEME<select value={theme} onChange={event => setTheme(event.target.value)}><option value="sauce">Red Sauce</option><option value="night">Night</option><option value="mono">Mono</option></select></label><details><summary>KEY BINDINGS</summary>{Object.entries(bindings).map(([action, key]) => <label className="binding-row" key={action}>{action.toUpperCase()}<select value={key} onChange={event => setBindings(current => ({ ...current, [action]: event.target.value }))}>{BINDING_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}<button type="button" className="quiet" onClick={() => setBindings({ ...DEFAULT_BINDINGS })}>RESET CONTROLS</button></details><div className="reaction-row" aria-label="Send reaction">{REACTIONS.map(emoji => <button key={emoji} aria-label={`Send ${emoji} reaction`} onClick={() => socket?.emit(EVENTS.REACTION, { emoji })}>{emoji}</button>)}</div></section></aside></div>
    <footer className="arena-foot"><span>REDPELICANS SAUCE / 42 SCHOOL</span><span>{phase === 'spectating' ? 'SPECTATOR MODE' : mode !== 'classic' ? `SCORE ${(game?.score || 0).toLocaleString()}` : 'CLASSIC / SCORE OFF'} · SEED <b>{seed === null ? '--' : seed.toString(16).toUpperCase()}</b></span></footer>
  </main>;
}

function createGame(data) {
  return { board: makeBoard(), piece: data.firstPieces?.[0] || makePiece('T'), queue: (data.firstPieces || []).slice(1), queueIndex: 8, requestPending: false, lock: 0, lost: false, events: [], mode: data.mode || 'classic', score: 0, lines: 0, level: 1, combo: -1, backToBack: false, hold: null, holdUsed: false };
}

function appendScoreEvents(events, score, lines, level, board) {
  if (board) events.push({ type: EVENTS.GAME_BOARD, payload: { board } }, { type: EVENTS.GAME_SPECTRUM, payload: { columns: spectrum(board) } });
  events.push({ type: EVENTS.GAME_SCORE, payload: { score, lines, level } });
}

function refillQueue(queue, queueIndex, requestPending, events) {
  if (queue.length >= 4 || requestPending) return { queueIndex, requestPending };
  events.push({ type: EVENTS.PIECE_REQUEST, payload: { from: queueIndex } });
  return { queueIndex: queueIndex + 8, requestPending: true };
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

function applyInput(game, action) {
  if (game.lost) return game;
  if (action === 'hold') return holdPiece(game);
  if (action === 'left' || action === 'right' || action === 'rotate') {
    const piece = action === 'left' ? move(game.board, game.piece, -1, 0) : action === 'right' ? move(game.board, game.piece, 1, 0) : rotate(game.board, game.piece);
    return { ...game, piece, lock: 0 };
  }
  if (action === 'soft') {
    const piece = move(game.board, game.piece, 0, 1);
    const earned = game.mode === 'classic' || piece.y === game.piece.y ? 0 : pointsForDrop(piece.y - game.piece.y, 'soft');
    return { ...game, piece, lock: 0, score: game.score + earned };
  }
  if (action === 'drop') {
    const landing = hardDrop(game.board, game.piece), result = lockPiece(game.board, landing);
    if (result.lost) return { ...game, board: result.board, lost: true };
    const distance = landing.y - game.piece.y;
    return nextTurn(game, result.board, result.cleared, game.mode === 'classic' ? 0 : pointsForDrop(distance, 'hard'));
  }
  return game;
}

function holdPiece(game) {
  if (game.holdUsed) return game;
  const queued = game.hold ? game.queue : game.queue.slice(1);
  const replacement = makePiece(game.hold || game.queue[0]?.type || game.piece.type);
  if (collides(game.board, replacement)) return { ...game, lost: true };
  const events = [];
  const refill = refillQueue(queued, game.queueIndex, game.requestPending, events);
  return { ...game, piece: replacement, hold: game.piece.type, holdUsed: true, queue: queued, ...refill, lock: 0, events };
}

function nextTurn(game, board, cleared, dropPoints = 0) {
  const comboResult = game.mode === 'classic' ? { points: 0, combo: -1, backToBack: false } : scoreClear({ cleared, level: game.level, combo: game.combo, backToBack: game.backToBack });
  const lines = game.lines + cleared, level = levelForLines(lines);
  const score = game.score + comboResult.points + dropPoints;
  const events = [];
  if (cleared) events.push({ type: EVENTS.GAME_LINES, payload: { cleared } });
  appendScoreEvents(events, score, lines, level, board);
  const piece = game.queue[0] || makePiece('T');
  if (collides(board, piece)) return { ...game, board, lost: true, score, lines, level, events };
  const queue = game.queue.slice(1);
  const refill = refillQueue(queue, game.queueIndex, game.requestPending, events);
  return { ...game, board, piece, queue, ...refill, lock: 0, events, flash: cleared ? 'clear' : dropPoints ? 'drop' : '', score, lines, level, combo: comboResult.combo, backToBack: comboResult.backToBack, holdUsed: false };
}

export function Board({ board, piece, lost, flash, faded = false, mode = 'classic' }) {
  const ghost = piece ? ghostPiece(board, piece) : null;
  const cells = useMemo(() => {
    const active = new Map();
    if (ghost) for (const cell of cellsFor(ghost)) active.set(`${cell.x}:${cell.y}`, 'ghost');
    if (piece) for (const cell of cellsFor(piece)) active.set(`${cell.x}:${cell.y}`, `active ${piece.type.toLowerCase()}`);
    return board.flatMap((row, y) => row.map((color, x) => ({ x, y, color, active: active.get(`${x}:${y}`) })));
  }, [board, piece]);
  return <div className={`board ${lost ? 'lost' : ''} ${flash || ''} ${mode === 'ghost' && faded ? 'blocks-faded' : ''}`} role="grid" aria-label="Tetris board">{cells.map(cell => <BoardCell key={`${cell.x}-${cell.y}`} color={cell.color} active={cell.active} />)}</div>;
}
export const BoardCell = React.memo(function BoardCell({ color, active }) {
  return <div role="gridcell" aria-label={color ? 'filled cell' : 'empty cell'} className={`cell ${color ? `filled ${String(color).toLowerCase()}` : ''} ${active || ''}`} />;
});

function PiecePreview({ piece, emptyLabel }) {
  if (!piece) return <div className="preview empty-preview">{emptyLabel || '—'}</div>;
  const coords = PIECES[piece.type].rotations[0];
  return <div className="preview" aria-label={`${piece.type} piece`}>{coords.map(([x, y], index) => <i key={index} className={`mini ${piece.type.toLowerCase()}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} />)}</div>;
}
function Spectrum({ values }) { return <div className="spectrum" aria-label="Opponent column heights">{values.map((value, index) => <i key={index} style={{ '--height': `${Math.max(4, value * 4)}px` }} />)}</div>; }

function SpectatorView({ room, mode, players, boards, opponents }) {
  return <div className="spectator-view"><span className="kicker">LIVE SPECTATOR FEED / {room.toUpperCase()}</span><h2>THE ARENA<br /><em>IN PLAY.</em></h2><p>Watching {GAME_MODES[mode]?.label} mode. Join again after the round ends.</p><div className="spectator-boards">{players.map(player => <article className="spectator-board" key={player.id}><div><b>{player.name}</b><span>{player.alive ? 'LIVE' : 'OUT'} · {(player.score || 0).toLocaleString()}</span></div>{boards[player.name] ? <Board board={boards[player.name]} /> : <div className="board-waiting">Waiting for the next board update…</div>}<Spectrum values={opponents[player.name] || player.spectrum || Array(10).fill(0)} /></article>)}</div></div>;
}

function RoomChat({ chat, chatText, setChatText, sendChat }) {
  return <section className="chat-card"><div className="panel-title"><span>ROOM CHAT</span><b>LIVE</b></div><div className="chat-log" aria-live="polite">{chat.map((item, index) => <p key={`${item.at}-${index}`}><b>{item.player}</b> {item.message}</p>)}</div><form className="chat-form" onSubmit={sendChat}><label className="visually-hidden" htmlFor="chat-input">Message</label><input id="chat-input" maxLength={160} value={chatText} onChange={event => setChatText(event.target.value)} placeholder="Send a clean message…" /><button aria-label="Send message">↗</button></form><div className="chat-hint">5 messages per 5 seconds · 160 characters</div></section>;
}

function LeaderboardPage() {
  const [mode, setMode] = useState('');
  const [room, setRoom] = useState('');
  const [scores, setScores] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(); if (mode) query.set('mode', mode); if (room) query.set('room', room);
    fetch(`/api/scores?${query}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error('Could not load scores.'); return response.json(); }).then(data => { setScores(data.scores || []); setError(''); }).catch(cause => { if (cause.name !== 'AbortError') setError(cause.message); });
    return () => controller.abort();
  }, [mode, room]);
  return <main className="leaderboard-page"><header className="arena-head"><Link to="/" className="wordmark">RED<span>TETRIS</span></Link><Link className="quiet" to="/">BACK TO BASE -&gt;</Link></header><section className="leaderboard-content"><span className="kicker">THE SAUCE HALL OF FAME</span><h1>HIGH<br /><em>SCORES.</em></h1><div className="leaderboard-filters"><label>MODE<select value={mode} onChange={event => setMode(event.target.value)}><option value="">All modes</option>{Object.values(GAME_MODES).map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label>ROOM<input value={room} onChange={event => setRoom(event.target.value)} maxLength={16} placeholder="Any room" /></label></div>{error && <p role="alert" className="error">{error}</p>}<div className="score-table" role="table" aria-label="Top scores"><div className="score-row score-heading" role="row"><b>RANK</b><b>PLAYER</b><b>SCORE</b><b>MODE / ROOM</b></div>{scores.length ? scores.map((score, index) => <div className="score-row" role="row" key={`${score.player}-${score.recordedAt}-${index}`}><span>#{String(index + 1).padStart(2, '0')}</span><b>{score.player}</b><strong>{score.score.toLocaleString()}</strong><span>{GAME_MODES[score.mode]?.label} / {score.room}</span></div>) : <p className="empty-scores">{error ? 'Scores are unavailable right now.' : 'No scores yet. Choose a bonus mode and set the first record.'}</p>}</div><Link className="primary link-button" to="/">BACK TO PLAY -&gt;</Link></section></main>;
}

function readBindings() {
  try { const value = JSON.parse(localStorage.getItem('rt-bindings') || '{}'); return { ...DEFAULT_BINDINGS, ...Object.fromEntries(Object.entries(value).filter(([key, val]) => key in DEFAULT_BINDINGS && BINDING_OPTIONS.some(([option]) => option === val))) }; }
  catch { return { ...DEFAULT_BINDINGS }; }
}

function useSound(mutedRef) {
  const contextRef = useRef(null);
  return useCallback(kind => {
    if (mutedRef.current) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const context = contextRef.current || new Audio(); contextRef.current = context;
    if (context.state === 'suspended') context.resume();
    const oscillator = context.createOscillator(), gain = context.createGain();
    const notes = { move: 220, rotate: 330, soft: 180, drop: 95, clear: 540, penalty: 80, win: 660, lose: 120 };
    oscillator.type = 'sine'; oscillator.frequency.value = notes[kind] || 240;
    gain.gain.setValueAtTime(0.045, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.13);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(); oscillator.stop(context.currentTime + 0.13);
  }, [mutedRef]);
}

function useKeyboard(enabled, bindings, act) {
  const lastRepeat = useRef(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const keydown = event => {
      const pressed = event.key === ' ' ? 'Space' : event.key;
      const action = Object.entries(bindings).find(([, key]) => key === pressed || (key.length === 1 && key.toLowerCase() === pressed.toLowerCase()))?.[0];
      if (!action) return;
      event.preventDefault();
      if (!event.repeat) { act(action); lastRepeat.current = Date.now(); return; }
      if (['left', 'right', 'soft'].includes(action) && Date.now() - lastRepeat.current >= 55) { lastRepeat.current = Date.now(); act(action); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [enabled, bindings, act]);
}
