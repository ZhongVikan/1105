const test=require('node:test'),assert=require('node:assert/strict');
const Controller=require('../src/controller'),G=require('../utils/game-engine');

function onlineController(room,state){
  return Object.assign({},Controller,{
    _alive:true,_hidden:false,_room:room,_state:state,_networkFailures:0,
    _poll:null,_polling:false,
  });
}

test('online poll cadence follows whose turn it is and backs off after failures',()=>{
  const state=G.newGame(undefined,'classic');
  const c=onlineController({waiting:true,side:'red'},state);
  assert.equal(c.pollDelay(),1000,'matching waits use a gentle heartbeat');

  c._room={waiting:false,side:'red'};
  c._state={...state,turn:'black'};
  assert.equal(c.pollDelay(),650,'poll quickly while the opponent can move');
  c._state={...state,turn:'red'};
  assert.equal(c.pollDelay(),900,'poll less often during our turn');

  c._networkFailures=1;
  assert.equal(c.pollDelay(),1800);
  c._networkFailures=3;
  assert.equal(c.pollDelay(),6000,'retry delay is capped');
});

test('online polling uses one timer and never queues a second request',async()=>{
  const state=G.newGame(undefined,'classic');
  const c=onlineController({waiting:false,side:'red'},state);
  const scheduled=[];
  const originalSetTimeout=global.setTimeout;
  const originalClearTimeout=global.clearTimeout;
  let polls=0;
  global.setTimeout=(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;};
  global.clearTimeout=()=>{};
  c.poll=async()=>{polls++;};
  try{
    c.startPolling();
    assert.equal(scheduled.length,1);
    assert.equal(scheduled[0].ms,900);
    const first=scheduled.shift();
    await first.fn();
    assert.equal(polls,1);
    assert.equal(scheduled.length,1,'the next timer is armed only after the request settles');
    assert.equal(scheduled[0].ms,900);
    c.stopPolling();
  }finally{
    global.setTimeout=originalSetTimeout;
    global.clearTimeout=originalClearTimeout;
    c.stopPolling();
  }
});

test('unchanged paired poll takes the read-only cloud path',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
  const roomId='a'.repeat(32),state=G.newGame(undefined,'classic');
  const data={
    chess_users:{},
    chess_rooms:{[roomId]:{id:roomId,red:{uid:'R',nickname:'红方',avatar:'cloud://r'},black:{uid:'B',nickname:'黑方',avatar:'cloud://b'},state,history:[],deadline:Date.now()+60000,rev:7,pauseUsed:{}}},
    chess_lobby:{queue:{entries:[]}},
  };
  let transactions=0,openid='R';
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const db={
    collection(name){return {doc(id){return {
      async get(){return {data:clone(data[name][id])};},
      async set({data:value}){data[name][id]=clone(value);},
      async update({data:value}){Object.assign(data[name][id],clone(value));},
      async remove(){delete data[name][id];},
    };}};},
    async runTransaction(fn){transactions++;return fn(db);},
  };
  const cloud={init(){},database:()=>db,getWXContext:()=>({OPENID:openid})};
  const sandbox={exports:{},console:{error(){},log(){}},require(name){if(name==='wx-server-sdk')return cloud;if(name==='crypto')return crypto;if(name==='./service')return require('../cloudfunctions/gameService/service');if(name==='./shared/game-engine')return require('../cloudfunctions/gameService/shared/game-engine');return require(name);}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../cloudfunctions/gameService/index.js'),'utf8'),sandbox,{filename:'gameService/index.js'});
  const first=await sandbox.exports.main({action:'poll',roomId,rev:7});
  assert.equal(first.ok,true);
  assert.equal(first.rev,7);
  assert.equal(transactions,0,'a paired unchanged poll must not open a transaction');
  openid='outsider';
  const denied=await sandbox.exports.main({action:'poll',roomId,rev:7});
  assert.equal(denied.ok,false,'fast path still enforces room membership');
  assert.equal(transactions,0);
});
