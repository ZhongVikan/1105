const test=require('node:test'),a=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const G=require('../cloudfunctions/gameService/shared/game-engine'),S=require('../cloudfunctions/gameService/service');
const id='a'.repeat(32),target='b'.repeat(32),key=crypto.createHash('sha256').update('R').digest('hex');
function setup({variant='dark',black=null,deadline=Date.now()+60000,match=true,status='playing',missing=false}={}){
 let user='R',now=Date.now();
 const data={chess_users:{[key]:{uid:'R',nickname:'R',avatar:'cloud://r',activeRoom:id}},chess_rooms:{},chess_lobby:{queue:{entries:match?[{id,at:now}]:[]}}};
 if(!missing)data.chess_rooms[id]={id,red:{uid:'R'},black,state:{...G.newGame(undefined,variant),status},history:[],deadline,rev:0,pauseUsed:{},match,createdAt:now,queueHeartbeatAt:now};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const db={collection(name){return {doc(id){return {async get(){return {data:data[name][id]?clone(data[name][id]):null};},async set({data:value}){data[name][id]=clone(value);},async update({data:value}){Object.assign(data[name][id],clone(value));},async remove(){delete data[name][id];}};}};},async runTransaction(fn){const before=clone(data);try{return await fn(db);}catch(e){for(const k of Object.keys(data))data[k]=before[k];throw e;}}};
 const cloud={init(){},database:()=>db,getWXContext:()=>({OPENID:user})},sandbox={exports:{},Date:{now:()=>now},console:{error(){}},require:n=>n==='wx-server-sdk'?cloud:n==='crypto'?crypto:n==='./service'?S:G};
 vm.runInNewContext(fs.readFileSync(require.resolve('../cloudfunctions/gameService/index.js'),'utf8'),sandbox);
 return {data,advance:ms=>{now+=ms;},call:(event,uid='R')=>{user=uid;return sandbox.exports.main(event);}};
}
for(const action of ['create','match'])test(`${action} replaces waiting room of another variant`,async()=>{const {data,call}=setup();const r=await call({action,variant:'fusion'});a.equal(r.ok,true);a.equal(r.state.variant,'fusion');a.notEqual(r.roomId,id);a.equal(data.chess_rooms[id],undefined);a.ok(!data.chess_lobby.queue.entries.some(e=>e.id===id));a.equal(data.chess_users[key].activeRoom,r.roomId);});
test('cancel releases a waiting room without supplying its variant',async()=>{const {data,call}=setup({variant:'fusion'});a.equal((await call({action:'cancel'})).cancelled,true);a.equal(data.chess_users[key].activeRoom,null);a.equal(data.chess_rooms[id],undefined);a.equal(data.chess_lobby.queue.entries.length,0);});
test('switch between matchmaking and friend invitation with same variant',async()=>{const {data,call}=setup();const r=await call({action:'create'});a.equal(r.ok,true);a.notEqual(r.roomId,id);a.equal(data.chess_rooms[r.roomId].match,false);const next=await call({action:'match'});a.notEqual(next.roomId,r.roomId);a.equal(data.chess_rooms[next.roomId].match,true);});
test('repeated request reuses compatible waiting room',async()=>{const {call}=setup();a.equal((await call({action:'match'})).roomId,id);});
test('join friend replaces own incompatible waiting room',async()=>{const {data,call}=setup();data.chess_rooms[target]={...data.chess_rooms[id],id:target,red:{uid:'friend'},match:false,state:G.newGame(undefined,'fusion')};const r=await call({action:'join',roomId:target});a.equal(r.ok,true);a.equal(r.roomId,target);a.equal(r.state.variant,'fusion');a.equal(data.chess_rooms[id],undefined);});
test('failed join preserves previous room transactionally',async()=>{const {data,call}=setup();a.equal((await call({action:'join',roomId:target})).ok,false);a.ok(data.chess_rooms[id]);a.equal(data.chess_users[key].activeRoom,id);});
test('expired paired game settles before variant check',async()=>{const {data,call}=setup({black:{uid:'B'},deadline:Date.now()-1000});const r=await call({action:'match',variant:'fusion'});a.equal(r.ok,true);a.equal(r.state.variant,'fusion');a.equal(data.chess_rooms[id].state.reason,'timeout');});
test('live paired game resumes safely across variants',async()=>{const {data,call}=setup({black:{uid:'B'}});const r=await call({action:'create',variant:'fusion'});a.equal(r.ok,true);a.equal(r.roomId,id);a.equal(r.state.variant,'dark');a.equal(Object.keys(data.chess_rooms).length,1);});
for(const opts of [{missing:true},{status:'ended'}])test('stale activeRoom is recovered '+JSON.stringify(opts),async()=>{const {call}=setup(opts);const r=await call({action:'match',variant:'fusion'});a.equal(r.ok,true);a.equal(r.state.variant,'fusion');a.notEqual(r.roomId,id);});

async function registerGuest(call){a.equal((await call({action:'profile',nickname:'B',avatar:'cloud://b'},'B')).ok,true);}

for(const match of [true,false])test(`${match?'lobby':'friend'} room starts its 60 seconds only after both devices acknowledge the pairing`,async()=>{
 const {call,advance}=setup({match});
 await registerGuest(call);
 const joined=await call({action:match?'match':'join',roomId:id},'B');
 a.equal(joined.roomId,id);a.equal(joined.starting,true);a.equal(joined.deadline,0);
 const cancelled=await call({action:'cancel',roomId:id,rev:0});
 a.equal(cancelled.starting,true);a.equal(cancelled.cancelled,undefined);
 a.equal((await call({action:'poll',roomId:id,rev:0})).rev,joined.rev,'old waiting polls do not acknowledge the pairing');
 const one=await call({action:'poll',roomId:id,rev:joined.rev},'B');
 a.equal(one.starting,true);a.equal(one.deadline,0);
 const early=await call({action:'move',roomId:id,rev:one.rev});
 a.equal(early.ok,false);a.match(early.error,/就绪/);
 advance(3000);
 const both=await call({action:'poll',roomId:id,rev:joined.rev});
 a.equal(both.starting,false);a.equal(both.deadline,both.serverNow+60000);
 advance(1000);
 a.equal((await call({action:'poll',roomId:id,rev:both.rev},'B')).deadline,both.deadline);
});

test('a player left in preparation can rematch after the other device fails to acknowledge',async()=>{
 const {call,advance}=setup();
 await registerGuest(call);
 const joined=await call({action:'match'},'B');
 await call({action:'poll',roomId:id,rev:joined.rev},'B');
 advance(15001);
 const timed=await call({action:'poll',roomId:id,rev:joined.rev},'B');
 a.equal(timed.starting,false);a.equal(timed.canRematch,false);a.equal(timed.state.reason,'not-ready');
 const again=await call({action:'match'},'B');
 a.notEqual(again.roomId,id);a.equal(again.waiting,true);
});

test('an earlier acknowledgement does not start the clock after that device goes quiet',async()=>{
 const {call,advance}=setup();
 await registerGuest(call);
 const joined=await call({action:'match'},'B');
 await call({action:'poll',roomId:id,rev:joined.rev},'B');
 advance(6000);
 const stale=await call({action:'poll',roomId:id,rev:joined.rev});
 a.equal(stale.starting,true);a.equal(stale.deadline,0);
 const returned=await call({action:'poll',roomId:id,rev:stale.rev},'B');
 a.equal(returned.starting,false);a.equal(returned.deadline,returned.serverNow+60000);
});

test('expired queue presence is skipped and the returning user can match again',async()=>{
 const {call,data,advance}=setup();
 await registerGuest(call);
 advance(90000);
 const guest=await call({action:'match'},'B');
 a.notEqual(guest.roomId,id);a.equal(guest.waiting,true);
 a.equal((await call({action:'poll',roomId:id,rev:0})).queueExpired,true);
 const resumed=await call({action:'match'});
 a.equal(resumed.roomId,guest.roomId);a.equal(resumed.starting,true);
 a.equal(data.chess_rooms[id],undefined);
});

test('late cancel or leave for an old room cannot clear the new active room',async()=>{
 const {call,data}=setup({status:'ended',black:{uid:'B'}});
 const next=await call({action:'match',variant:'fusion'});
 a.equal((await call({action:'cancel',roomId:id})).cancelled,true);
 a.equal((await call({action:'leave',roomId:id})).left,true);
 a.equal(data.chess_users[key].activeRoom,next.roomId);
 a.ok(data.chess_rooms[next.roomId]);
});
