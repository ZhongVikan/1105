const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('../cloudfunctions/gameService/shared/game-engine');
const S=require('../cloudfunctions/gameService/service');
function room(preference){
  const state=G.newGame(undefined,'classic');
  return {id:'a'.repeat(32),ownerUid:'A',seatPreference:preference,round:0,red:{uid:'A',nickname:'甲'},black:{uid:'B',nickname:'乙'},state,history:[state],deadline:Date.now()+60000,rev:0,pauseUsed:{},menuPauseUsed:{}};
}
test('seat preference locks creator color before opponent joins',()=>{
  for(const preference of ['red','black','rotate']){
    const r=room(preference);r.black=null;
    const result=S.reduce(r,'A',{action:'preference',rev:0,preference},Date.now());
    assert.equal(result.seatPreference,preference);
  }
});
test('rotate restart swaps both seats for the next game',()=>{
  const r=room('rotate');r.pending={kind:'restart',by:'A',until:Date.now()+10000};r.rev=1;
  S.reduce(r,'B',{action:'reply',rev:1,accept:true},Date.now());
  assert.equal(r.red.uid,'B');
  assert.equal(r.black.uid,'A');
  assert.equal(r.round,1);
});
test('fixed seat preferences keep the creator seat across restart',()=>{
  for(const preference of ['red','black']){
    const r=room(preference);r.pending={kind:'restart',by:'A',until:Date.now()+10000};r.rev=1;
    S.reduce(r,'B',{action:'reply',rev:1,accept:true},Date.now());
    assert.equal(r.red.uid,'A');
    assert.equal(r.black.uid,'B');
  }
});
test('undo reply exposes an accepted or rejected feedback event',()=>{
  for(const accept of [true,false]){
    const r=room('red');r.pending={kind:'undo',by:'A',until:Date.now()+10000};r.rev=1;
    S.reduce(r,'B',{action:'reply',rev:1,accept},Date.now());
    assert.equal(r.event,accept?'undo-accepted':'undo-rejected');
  }
});
