import { Game } from './Game.js';
export class Room {
  constructor(name,seed) { this.name=name;this.players=[];this.hostId=null;this.game=new Game(seed); }
  add(player) { if(this.game.state!=='lobby')throw new Error('ROOM_STARTED');if(this.players.some(p=>p.name===player.name))throw new Error('NAME_TAKEN');this.players.push(player);if(!this.hostId)this.hostId=player.id; }
  remove(id) { this.players=this.players.filter(p=>p.id!==id);if(this.hostId===id)this.hostId=this.players[0]?.id??null; }
  getPlayer(id) { return this.players.find(p=>p.id===id); }
  alive() { return this.players.filter(p=>p.alive); }
  start(id) { if(id!==this.hostId)throw new Error('HOST_ONLY');if(this.players.length===0)throw new Error('EMPTY_ROOM');if(this.game.state==='finished'){this.game.reset(Math.floor(Math.random()*0xffffffff));for(const player of this.players){player.alive=true;player.pieceIndex=0;player.spectrum=Array(10).fill(0);}}if(!this.game.start())throw new Error('NOT_LOBBY'); }
  maybeFinish() { const players=this.alive();if(this.game.state==='running'&&players.length<=1){this.game.finish();return players[0]??null;}return undefined; }
  snapshot() { return {room:this.name,host:this.players.find(p=>p.id===this.hostId)?.name??null,state:this.game.state,players:this.players.map(p=>({id:p.id,name:p.name,host:p.id===this.hostId,alive:p.alive,spectrum:p.spectrum}))}; }
}
