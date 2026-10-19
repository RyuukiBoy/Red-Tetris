import { Game } from './Game.js';
export class Room {
  constructor(name,seed) { this.name=name;this.players=[];this.spectators=[];this.hostId=null;this.game=new Game(seed); }
  add(player) { if(this.game.state!=='lobby')throw new Error('ROOM_STARTED');if(this.players.some(p=>p.name.toLowerCase()===player.name.toLowerCase()))throw new Error('NAME_TAKEN');this.players.push(player);if(!this.hostId)this.hostId=player.id; }
  addSpectator(player) { if(this.game.state!=='running')throw new Error('NOT_RUNNING');if([...this.players,...this.spectators].some(p=>p.name.toLowerCase()===player.name.toLowerCase()))throw new Error('NAME_TAKEN');player.spectator=true;this.spectators.push(player); }
  remove(id) { this.players=this.players.filter(p=>p.id!==id);this.spectators=this.spectators.filter(p=>p.id!==id);if(this.hostId===id)this.hostId=this.players[0]?.id??null; }
  getPlayer(id) { return this.players.find(p=>p.id===id); }
  alive() { return this.players.filter(p=>p.alive); }
  start(id,mode='classic') { if(id!==this.hostId)throw new Error('HOST_ONLY');if(this.players.length===0)throw new Error('EMPTY_ROOM');if(this.game.state==='finished'){this.game.reset(Math.floor(Math.random()*0xffffffff),mode);for(const player of this.players){player.alive=true;player.pieceIndex=0;player.spectrum=Array(10).fill(0);player.score=0;player.lines=0;player.level=1;player.board=null;}}else this.game.mode=mode;if(!this.game.start())throw new Error('NOT_LOBBY'); }
  maybeFinish() { const players=this.alive();if(this.game.state==='running'&&players.length<=1){this.game.finish();return players[0]??null;}return undefined; }
  snapshot() { return {room:this.name,host:this.players.find(p=>p.id===this.hostId)?.name??null,state:this.game.state,mode:this.game.mode,players:this.players.map(p=>({id:p.id,name:p.name,host:p.id===this.hostId,alive:p.alive,spectator:false,score:p.score,lines:p.lines,level:p.level,spectrum:p.spectrum})),spectators:this.spectators.map(p=>({id:p.id,name:p.name,spectator:true}))}; }
}
