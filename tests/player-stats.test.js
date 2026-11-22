const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const Controller=require('../src/controller'),Online=require('../utils/online'),SimulatedStats=require('../utils/simulated-stats');
const G=require('../utils/game-engine'),Service=require('../cloudfunctions/gameService/service');
const roster=require('../utils/fake-opponents');
const filename=require.resolve('../cloudfunctions/gameService/index');

function cloudGame(){
 const data={chess_users:{},chess_rooms:{},chess_lobby:{}};
 let uid,now=1000,transactions=Promise.resolve();
 const db={collection(name){return {doc(id){
  const collection=data[name];
  return {async get(){return {data:structuredClone(collection[id])};},async set({data:row}){collection[id]=structuredClone(row);},
   async update({data:changes}){assert.ok(collection[id]);Object.assign(collection[id],structuredClone(changes));},async remove(){delete collection[id];}};
 }};},runTransaction(callback){
  const result=transactions.then(async()=>{
   const previous=structuredClone(data);
   try{return await callback(db);}catch(error){Object.assign(data,previous);throw error;}
  });
  transactions=result.catch(()=>{});return result;
 }};
 const cloud={init(){},database:()=>db,getWXContext:()=>({OPENID:uid})};
 const context={exports:{},console:{error(){}},require:name=>({'wx-server-sdk':cloud,crypto,'./service':Service,'./shared/game-engine':G,'./shared/fake-opponents':roster})[name],Date:{now:()=>now}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),context);
 return {data,advance:ms=>{now+=ms;},call(user,event){uid=user;return context.exports.main(event).then(structuredClone);}};
}

const avatar=user=>'cloud://test/avatars/'+user+'.png';
async function register(server,user){assert.equal((await server.call(user,{action:'profile',nickname:user,avatar:avatar(user)})).ok,true);}
async function pair(server,variant='classic',ready=true){
 const created=await server.call('host',{action:'create',variant,seatPreference:'rotate'});
 const joined=await server.call('guest',{action:'join',roomId:created.roomId});
 assert.equal(joined.ok,true,joined.error);
 if(!ready)return joined;
 const ack=await server.call('guest',{action:'poll',roomId:joined.roomId,rev:joined.rev});
 return server.call('host',{action:'poll',roomId:joined.roomId,rev:ack.rev});
}
function roomStats(server,viewer,room,side){
 return server.call(viewer,{action:'playerStats',roomId:room.roomId,side,nickname:room[side].nickname,avatar:room[side].avatar});
}
const counts=result=>[result.games,result.wins];

test('cloud results are per variant and counted once across polls, profile changes and rotating rematches',async()=>{
 const server=cloudGame();await register(server,'host');await register(server,'guest');
 const first=await pair(server);
 assert.equal(first.starting,false);
 assert.deepEqual(counts(await roomStats(server,'host',first,'red')),[0,0]);
 const terminal=await server.call('guest',{action:'resign',roomId:first.roomId,rev:first.rev});
 assert.equal(terminal.state.winner,'red');
 await Promise.all(['host','guest'].map(user=>server.call(user,{action:'poll',roomId:first.roomId,rev:terminal.rev})));
 assert.deepEqual(counts(await roomStats(server,'guest',terminal,'red')),[1,1]);
 assert.deepEqual(counts(await roomStats(server,'host',terminal,'black')),[1,0]);
 assert.equal((await roomStats(server,'outsider',terminal,'red')).ok,false);
 assert.equal((await server.call('host',{action:'playerStats',roomId:first.roomId,side:'black',nickname:'host',avatar:avatar('host')})).ok,false);
 await server.call('host',{action:'profile',nickname:'host-new',avatar:avatar('host')});
 const request=await server.call('host',{action:'request',kind:'restart',roomId:first.roomId,rev:terminal.rev});
 const rematch=await server.call('guest',{action:'reply',accept:true,roomId:first.roomId,rev:request.rev});
 assert.equal(rematch.black.nickname,'host');
 assert.deepEqual(counts(await roomStats(server,'guest',rematch,'black')),[1,1]);
 const draw=await server.call('host',{action:'request',kind:'draw',roomId:first.roomId,rev:rematch.rev});
 const second=await server.call('guest',{action:'reply',accept:true,roomId:first.roomId,rev:draw.rev});
 assert.equal(second.state.reason,'draw');
 assert.deepEqual(counts(await roomStats(server,'guest',second,'black')),[2,1]);
 assert.deepEqual(counts(await roomStats(server,'host',second,'red')),[2,0]);
 const different=await pair(server,'fusion');
 assert.deepEqual(counts(await roomStats(server,'host',different,'red')),[0,0]);
});

test('switching rooms settles an expired round once and a failed readiness check records no game',async()=>{
 const server=cloudGame();await register(server,'host');await register(server,'guest');
 const active=await pair(server,'dark');
 server.advance(60001);
 const next=await server.call('host',{action:'create',variant:'jieqi'});
 assert.notEqual(next.roomId,active.roomId);
 const expired=await server.call('guest',{action:'poll',roomId:active.roomId,rev:active.rev});
 assert.equal(expired.state.reason,'timeout');
 assert.deepEqual(counts(await roomStats(server,'guest',expired,'red')),[1,0]);
 assert.deepEqual(counts(await roomStats(server,'host',expired,'black')),[1,1]);
 const joining=await server.call('guest',{action:'join',roomId:next.roomId});
 server.advance(15001);
 const notReady=await server.call('host',{action:'poll',roomId:next.roomId,rev:joining.rev});
 assert.equal(notReady.state.reason,'not-ready');
 assert.deepEqual(counts(await roomStats(server,'guest',notReady,'red')),[0,0]);
 assert.deepEqual(counts(await roomStats(server,'host',notReady,'black')),[0,0]);
});

test('a simulated fallback records consecutive rematches once for its owner and its assigned opponent',async()=>{
 const server=cloudGame();await register(server,'host');await register(server,'guest');
 const queued=await server.call('host',{action:'match',variant:'jieqi'});
 const cancel={action:'cancel',roomId:queued.roomId,rev:queued.rev,simulate:true};
 const cancelled=await server.call('host',cancel),ticket=cancelled.simulated;
 assert.ok(roster.names.includes(ticket.nickname));
 assert.deepEqual((await server.call('host',cancel)).simulated,ticket);
 assert.equal(server.data.chess_rooms[queued.roomId],undefined);
 const lookup=(user,side)=>server.call(user,{action:'playerStats',simulationId:ticket.id,side});
 const record=(user,round,winner)=>server.call(user,{action:'recordSimulatedResult',simulationId:ticket.id,round,winner,variant:'dark'});
 assert.deepEqual(counts(await lookup('host','black')),[0,0]);
 assert.equal((await lookup('guest','black')).ok,false);
 assert.equal((await record('guest',1,'red')).ok,false);
 assert.equal((await record('host',2,'red')).ok,false);
 assert.equal((await record('host',1,'red')).ok,true);
 await Promise.all([record('host',1,'black'),record('host',1,'red'),record('host',2,'black')]);
 assert.equal((await record('host',3,null)).ok,true);
 assert.deepEqual(counts(await lookup('host','red')),[3,1]);
 assert.deepEqual(counts(await lookup('host','black')),[3,1]);
 const realRoom=await pair(server,'jieqi');
 assert.deepEqual(counts(await roomStats(server,'guest',realRoom,'red')),[3,1]);
 assert.deepEqual(counts(await roomStats(server,'host',realRoom,'black')),[0,0]);
});

test('a simulated account shares completed results across players, with separate totals for each variant',async t=>{
 const opponent=roster.forNickname(roster.names[0]);
 t.mock.method(roster,'pick',()=>opponent);
 const server=cloudGame();
 await register(server,'host');await register(server,'guest');
 async function match(user,variant){
  const queued=await server.call(user,{action:'match',variant});
  const {simulated}=await server.call(user,{action:'cancel',roomId:queued.roomId,rev:queued.rev,simulate:true});
  assert.equal(simulated.nickname,opponent.nickname);
  return simulated.id;
 }
 const first=await match('host','classic'),second=await match('guest','classic');
 const read=(user,simulationId)=>server.call(user,{action:'playerStats',simulationId,side:'black'});
 const record=(user,simulationId,round,winner)=>server.call(user,{action:'recordSimulatedResult',simulationId,round,winner});
 assert.deepEqual(counts(await read('host',first)),[0,0]);
 const results=await Promise.all([record('host',first,1,'black'),record('guest',second,1,'red')]);
 assert.ok(results.every(result=>result.ok));
 assert.equal((await record('guest',second,2,null)).ok,true);
 assert.deepEqual(counts(await read('host',first)),[3,1]);
 assert.deepEqual(counts(await read('guest',second)),[3,1]);
 assert.deepEqual(counts(await read('guest',await match('guest','dark'))),[0,0]);
});

test('simulated results are saved locally, uploaded once, and can bypass a rejected older simulation',async t=>{
 const key='chess-pending-simulated-results';
 const older={simulationId:'f'.repeat(32),round:1,winner:'red'};
 const storage=new Map([[key,[older]]]),attempts=[];
 global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,structuredClone(value))};
 t.after(()=>delete global.wx);
 let offline=true;
 t.mock.method(Online,'call',async(action,result)=>{
  assert.equal(action,'recordSimulatedResult');attempts.push(result);
  if(offline)throw Error('offline');
  if(result.simulationId===older.simulationId)throw Object.assign(Error('未找到拟真人对局'),{serverRejected:true});
  return {ok:true};
 });
 const opponent=roster.forNickname(roster.names[1]);
 const c={...Controller,_fakeOpponent:opponent,_simulatedMatch:{id:'a'.repeat(32),round:1,finished:false},
  _alive:true,_mode:'ai',data:{topSide:'black',topName:opponent.nickname},setData(patch){Object.assign(this.data,patch);}};
 const finished={status:'ended',variant:'classic',winner:'red'};
 c._state=finished;
 c.recordSimulatedStats(finished);c.recordSimulatedStats(finished);
 await assert.rejects(SimulatedStats.flush(),/offline/);
 assert.deepEqual(storage.get(key).pending,[older,{simulationId:'a'.repeat(32),round:1,winner:'red'}]);
 await c.showPlayerStats('black');
 assert.deepEqual(counts(c.data.playerStats),[1,0]);
 assert.equal(c.data.playerStats.source,'local');
 assert.equal(c.data.playerStats.status,'ready');
 c.closePlayerStats();
 offline=false;
 await assert.rejects(SimulatedStats.flush(),/未找到拟真人对局/);
 assert.deepEqual(storage.get(key).pending,[older]);
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 t.mock.method(Math,'random',()=>0);
 Object.assign(c,{_state:{...G.newGame(undefined,'classic'),...finished},_clock:{start(){}},sync(){},toast(){},scheduleAI(){}});
 c.requestFake('restart');t.mock.timers.tick(1200);
 assert.deepEqual(c._simulatedMatch,{id:'a'.repeat(32),round:2,finished:false});
 c.recordSimulatedStats({...finished,winner:null});
 await assert.rejects(SimulatedStats.flush(),/未找到拟真人对局/);
 assert.deepEqual(attempts.filter(result=>result.simulationId===c._simulatedMatch.id).map(result=>result.round),[1,2]);
 assert.deepEqual(storage.get(key).pending,[older]);
 assert.deepEqual(storage.get(key).local.classic.opponents[opponent.nickname],{games:2,wins:0});

 c._simulatedMatch={id:null,round:1,finished:false};
 c.recordSimulatedStats({...finished,status:'playing',winner:null});
 await c.showPlayerStats('black');
 assert.deepEqual(counts(c.data.playerStats),[2,0]);
 c.recordSimulatedStats({...finished,winner:'black'});
 c.recordSimulatedStats({...finished,winner:'black'});
 await c.showPlayerStats('black');
 assert.deepEqual(counts(c.data.playerStats),[3,1]);
 assert.equal(c.data.playerStats.source,'local');
 assert.deepEqual(storage.get(key).pending,[older]);
 assert.deepEqual(SimulatedStats.localTotals('dark',opponent.nickname),{games:0,wins:0});
});
