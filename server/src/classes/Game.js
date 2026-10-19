import { Piece } from './Piece.js';
import { isGameMode } from '../../../shared/modes.js';
export class Game {
  constructor(seed,mode='classic') { this.seed=seed>>>0; this.state='lobby'; this.mode=isGameMode(mode)?mode:'classic'; this.sequence=Piece.sequence(this.seed); this.scoreSaved=false; }
  start() { if(this.state!=='lobby') return false; this.state='running'; return true; }
  reset(seed,mode='classic') { this.seed=seed>>>0;this.sequence=Piece.sequence(this.seed);this.mode=isGameMode(mode)?mode:'classic';this.state='lobby';this.scoreSaved=false; }
  batch(index,count=8) { return this.sequence.slice(index,index+count); }
  finish() { if(this.state==='running') this.state='finished'; }
}
