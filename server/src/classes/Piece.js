const TYPES=['I','O','T','S','Z','J','L'];
export class Piece {
  constructor(type,rotation=0,x=3,y=0) { this.type=type; this.rotation=rotation; this.x=x; this.y=y; }
  static sequence(seed,length=512) { let state=seed>>>0; const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;}; const result=[];while(result.length<length){const bag=TYPES.slice();for(let i=bag.length-1;i>0;i--){const j=random()%(i+1);[bag[i],bag[j]]=[bag[j],bag[i]];}for(const type of bag){if(result.length===length)break;result.push(new Piece(type,0,3,0));}}return result; }
}
