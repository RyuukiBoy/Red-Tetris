export class Player {
  constructor(id,name,joinedAt=Date.now()) { this.id=id; this.name=name; this.joinedAt=joinedAt; this.alive=true; this.pieceIndex=0; this.spectrum=Array(10).fill(0); }
  nextIndex() { const index=this.pieceIndex; this.pieceIndex+=1; return index; }
  lose() { this.alive=false; }
}
