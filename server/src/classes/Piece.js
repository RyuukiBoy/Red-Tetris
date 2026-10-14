const TYPES=['I','O','T','S','Z','J','L'];
export class Piece {
  constructor(type,rotation=0,x=3,y=0) { this.type=type; this.rotation=rotation; this.x=x; this.y=y; }
  static sequence(seed,length=512) { let state=seed>>>0; const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;}; return Array.from({length},()=>{const type=TYPES[random()%TYPES.length];return new Piece(type,0,3,0);}); }
}
