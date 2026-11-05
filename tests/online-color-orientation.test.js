const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Controller=require('../src/controller');
const G=require('../utils/game-engine');

test('server assigns the joining player a random red or black seat',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../cloudfunctions/gameService/index.js'),'utf8');
  assert.match(source,/crypto\.randomInt\(0,2\)/);
  assert.match(source,/room\.red=joining;room\.black=existing/);
});

test('client automatically follows assigned side while preserving manual flips',()=>{
  const c=Object.assign({},Controller,{data:{...Controller.data},_alive:true,_room:null,runtime:null,_state:null,sync(){},tick(){}});
  c.setData=patch=>Object.assign(c.data,patch);
  const state=G.newGame(undefined,'classic');
  c.applyRoom({roomId:'r',rev:1,side:'black',red:{nickname:'红',avatar:'r'},black:{nickname:'黑',avatar:'b'},waiting:false,state,serverNow:Date.now()});
  assert.equal(c.data.flipped,true);
  c.data.flipped=false;
  c.applyRoom({roomId:'r',rev:2,side:'black',red:{nickname:'红',avatar:'r'},black:{nickname:'黑',avatar:'b'},waiting:false,state,serverNow:Date.now()});
  assert.equal(c.data.flipped,false);
  c.applyRoom({roomId:'r',rev:3,side:'red',red:{nickname:'红',avatar:'r'},black:{nickname:'黑',avatar:'b'},waiting:false,state,serverNow:Date.now()});
  assert.equal(c.data.flipped,false);
});
