export class Player {
  constructor(id,name,joinedAt=Date.now(),spectator=false) { this.id=id; this.name=name; this.joinedAt=joinedAt; this.alive=true; this.spectator=spectator; this.pieceIndex=0; this.spectrum=Array(10).fill(0); this.score=0; this.lines=0; this.level=1; this.board=null; }
  nextIndex() { const index=this.pieceIndex; this.pieceIndex+=1; return index; }
  lose() { this.alive=false; }
}
