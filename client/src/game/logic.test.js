import { describe,it,expect } from 'vitest';
import { addPenalty,clearLines,collides,emptyBoard,ghostPiece,lockPiece,merge,move,rotate,spectrum,hardDrop } from './logic.js';
import { makeBoard,makePiece } from '../../../shared/pieces.js';
describe('pure board rules',()=>{
 it('rotates four times to the same piece',()=>{const b=makeBoard(),p=makePiece('T');let n=p;for(let i=0;i<4;i++)n=rotate(b,n);expect(n).toEqual(p)});
 it('rejects wall and pile collisions',()=>{const b=makeBoard();expect(collides(b,makePiece('I',-1))).toBe(true);b[2][4]='red';expect(collides(b,makePiece('O',3,1))).toBe(true)});
 it('moves without mutating the input and rejects blocked moves',()=>{const b=makeBoard(),p=makePiece('O');expect(move(b,p,1,0).x).toBe(4);expect(move(b,p,-6,0)).toBe(p);b[0][5]='red';expect(move(b,p,1,0)).toBe(p);expect(p.x).toBe(3)});
 it('rejects rotations that collide',()=>{const b=makeBoard();for(const {x,y} of [{x:5,y:0}])b[y][x]='red';expect(rotate(b,makePiece('I',3,0))).toEqual(makePiece('I',3,0))});
 it('clears exactly full rows and keeps dimensions',()=>{const b=makeBoard();b[19]=Array(10).fill('red');const r=clearLines(b);expect(r.cleared).toBe(1);expect(r.board).toHaveLength(20);expect(r.board.every(row=>row.length===10)).toBe(true);expect(clearLines(makeBoard()).cleared).toBe(0)});
 it('computes column heights and returns a valid ghost landing',()=>{const b=makeBoard();b[18][3]='blue';expect(spectrum(b)[3]).toBe(2);expect(ghostPiece(makeBoard(),makePiece('O')).y).toBe(18)});
 it('merges without mutating board',()=>{const b=makeBoard(),r=merge(b,makePiece('O'));expect(b.flat().every(x=>x===null)).toBe(true);expect(r.flat().filter(Boolean)).toHaveLength(4)});
 it('drops to the last valid position',()=>expect(hardDrop(makeBoard(),makePiece('O')).y).toBe(18));
 it('locks pieces and reports a clear',()=>{const b=makeBoard();b[19].fill('red');b[19][4]=null;b[19][5]=null;const r=lockPiece(b,makePiece('O',3,18));expect(r.cleared).toBeGreaterThan(0);expect(r.board).toHaveLength(20)});
 it('adds garbage, detects overflow, and handles zero lines',()=>{const b=makeBoard();b[0][0]='red';const r=addPenalty(b,1);expect(r.lost).toBe(true);expect(r.board[19].filter(Boolean)).toHaveLength(9);expect(addPenalty(makeBoard(),0).board).toEqual(makeBoard());expect(emptyBoard()).toEqual(makeBoard())});
});


