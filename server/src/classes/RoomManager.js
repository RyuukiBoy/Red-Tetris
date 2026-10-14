import { Room } from './Room.js';import { Player } from './Player.js';
export class RoomManager {
  constructor({maxRooms=100,maxPlayers=8,seedFactory=()=>Math.floor(Math.random()*0xffffffff)}={}){this.rooms=new Map();this.maxRooms=maxRooms;this.maxPlayers=maxPlayers;this.seedFactory=seedFactory;}
  join(roomName,playerName,id){let room=this.rooms.get(roomName);if(!room){if(this.rooms.size>=this.maxRooms)throw new Error('ROOM_LIMIT');room=new Room(roomName,this.seedFactory());this.rooms.set(roomName,room);}if(room.players.length>=this.maxPlayers)throw new Error('ROOM_FULL');const player=new Player(id,playerName);room.add(player);return {room,player};}
  leave(roomName,id){const room=this.rooms.get(roomName);if(!room)return null;const wasHost=room.hostId===id;room.remove(id);if(room.players.length===0){this.rooms.delete(roomName);return {deleted:true,room};}return {deleted:false,room,hostChanged:wasHost,host:room.players[0]};}
  get(name){return this.rooms.get(name);}
}
