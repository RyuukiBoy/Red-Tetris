import { Piece } from './Piece.js';
export class Game {
  constructor(seed) { this.seed=seed>>>0; this.state='lobby'; this.sequence=Piece.sequence(this.seed); }
  start() { if(this.state!=='lobby') return false; this.state='running'; return true; }
  reset(seed) { this.seed=seed>>>0;this.sequence=Piece.sequence(this.seed);this.state='lobby'; }
  batch(index,count=8) { return this.sequence.slice(index,index+count); }
  finish() { if(this.state==='running') this.state='finished'; }
}
