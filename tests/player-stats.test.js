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

test('a simulated result is saved before upload and retried without duplicating the round',async t=>{
 const storage=new Map(),attempts=[];
 global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,structuredClone(value))};
 t.after(()=>delete global.wx);
 let offline=true;
 t.mock.method(Online,'call',async(action,result)=>{
  assert.equal(action,'recordSimulatedResult');attempts.push(result);
  if(offline)throw Error('offline');
  return {ok:true};
 });
 const c={...Controller,_simulatedMatch:{id:'a'.repeat(32),round:1,finished:false}};
 const finished={status:'ended',winner:'red'};
 c.recordSimulatedStats(finished);c.recordSimulatedStats(finished);
 await assert.rejects(SimulatedStats.flush(),/offline/);
 assert.deepEqual([...storage.values()].flat(),[{simulationId:'a'.repeat(32),round:1,winner:'red'}]);
 offline=false;
 await SimulatedStats.flush();
 assert.deepEqual(attempts.map(result=>result.round),[1,1]);
 assert.deepEqual([...storage.values()].flat(),[]);
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 t.mock.method(Math,'random',()=>0);
 Object.assign(c,{_alive:true,_state:{...G.newGame(undefined,'classic'),...finished},_fakeOpponent:{nickname:'棋友'},_clock:{start(){}},
  data:{},setData(patch){Object.assign(this.data,patch);},sync(){},toast(){},scheduleAI(){}});
 c.requestFake('restart');t.mock.timers.tick(1200);
 assert.deepEqual(c._simulatedMatch,{id:'a'.repeat(32),round:2,finished:false});
 c.recordSimulatedStats({status:'ended',winner:null});
 await SimulatedStats.flush();
 assert.deepEqual(attempts.map(result=>result.round),[1,1,2]);
});
