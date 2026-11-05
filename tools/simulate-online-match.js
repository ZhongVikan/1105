// Runs the real gameService entry with two in-memory users. No fake game rules.
const vm=require('vm'),fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict');
const G=require('../cloudfunctions/gameService/shared/game-engine'),S=require('../cloudfunctions/gameService/service');
const source=fs.readFileSync(require.resolve('../cloudfunctions/gameService/index.js'),'utf8');
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const data={chess_users:{},chess_rooms:{},chess_lobby:{queue:{entries:[]}}},writes={rooms:0,lobby:0,users:0};
function makeDB(){
 const col=name=>({doc(id){return {async get(){return {data:clone(data[name][id])};},async set({data:value}){data[name][id]=clone(value);if(name==='chess_rooms')writes.rooms++;if(name==='chess_lobby')writes.lobby++;if(name==='chess_users')writes.users++;},async update({data:value}){Object.assign(data[name][id],clone(value));writes.users++;},async remove(){delete data[name][id];writes.rooms++;}};}});
 const db={collection:col,async runTransaction(fn){const before=clone(data),wb={...writes};try{return await fn(db);}catch(e){for(const k of Object.keys(data)){data[k]=before[k];}Object.assign(writes,wb);throw e;}}};return db;
}
let openid='';const cloud={init(){},database:()=>makeDB(),getWXContext:()=>({OPENID:openid})};
const sandbox={exports:{},console:{error(){},log(){}},require:n=>n==='wx-server-sdk'?cloud:n==='crypto'?crypto:n==='./service'?S:G};vm.runInNewContext(source,sandbox,{filename:'gameService/index.js'});const main=sandbox.exports.main;
const users=[['red-user','红方','cloud://red'],['black-user','黑方','cloud://black']];let now=100000;const realNow=Date.now;Date.now=()=>now;const call=async(uid,action,extra={})=>{openid=uid;const r=await main({...extra,action});assert.equal(r.ok,true,uid+' '+action+' '+(r.error||''));return r;};
(async()=>{for(const [uid,nickname,avatar] of users)await call(uid,'profile',{nickname,avatar});
 openid=users[0][0];let created=await call(openid,'match',{variant:'dark'});const roomId=created.roomId;assert.equal(created.waiting,true);assert.equal(created.red.nickname,'红方');
 let joined=await call(users[1][0],'match',{variant:'dark'});assert.equal(joined.roomId,roomId);assert.equal(joined.waiting,false);assert.deepEqual(new Set([joined.red.nickname,joined.black.nickname]),new Set(['红方','黑方']));
 let first=await call(users[0][0],'poll',{roomId}),second=await call(users[1][0],'poll',{roomId});assert.equal(first.waiting,false);assert.equal(first.red.nickname,joined.red.nickname);assert.equal(second.black.nickname,joined.black.nickname);
 const usersBySide={[first.side]:users[0][0],[second.side]:users[1][0]};
 const uidForSide=side=>usersBySide[side];
 // Find a real legal move for whichever side has the first turn, then reply for the other side.
 const pick=(state,side)=>{for(const p of state.pieces)if(p.side===side||p.hidden&&G.displayPieces([p])[0].side===side)for(let y=0;y<10;y++)for(let x=0;x<9;x++)if(G.legalAttempt(state.pieces,p.id,{x,y},side))return {id:p.id,to:{x,y}};throw Error('no legal '+side+' move');};
 const firstSide=first.state.turn,firstUid=uidForSide(firstSide);let rev=first.rev,m=pick(first.state,firstSide);first=await call(firstUid,'move',{roomId,rev,id:m.id,to:m.to});assert.equal(first.ok,true);second=await call(users[1][0]===firstUid?users[0][0]:users[1][0],'poll',{roomId});const secondSide=second.state.turn;const secondUid=uidForSide(secondSide);m=pick(second.state,secondSide);second=await call(secondUid,'move',{roomId,rev:second.rev,id:m.id,to:m.to});
 first=await call(users[0][0],'poll',{roomId});assert.equal(first.state.ply,2);assert.equal(new Set([first.red.nickname,first.black.nickname]).size,2);
 const roomWritesBefore=writes.rooms,lobbyWritesBefore=writes.lobby;for(let i=0;i<20;i++){now+=1200;await call(users[0][0],'poll',{roomId});await call(users[1][0],'poll',{roomId});}assert.equal(writes.rooms,roomWritesBefore,'unchanged paired polls should not rewrite room');assert.equal(writes.lobby,lobbyWritesBefore,'unchanged paired polls should not rewrite lobby');
 // Verify a waiting match is kept alive with a bounded heartbeat, not every poll.
 const waiting=await call(users[0][0],'match',{variant:'fusion'});const waitingId=waiting.roomId;const beforeHeartbeat=writes.lobby;for(let i=0;i<10;i++){now+=1200;await call(users[0][0],'poll',{roomId:waitingId});}assert.equal(writes.lobby,beforeHeartbeat,'waiting poll heartbeat remains below 15s');data.chess_rooms[waitingId].queueHeartbeatAt=Date.now()-16000;now+=3000;await call(users[0][0],'poll',{roomId:waitingId});assert.ok(writes.lobby-beforeHeartbeat<=1,'waiting heartbeat writes are bounded');
 console.log(JSON.stringify({ok:true,roomId,pairedPly:2,pairedPolls:40,pairedRoomWrites:writes.rooms-roomWritesBefore,pairedLobbyWrites:writes.lobby-lobbyWritesBefore,waitingHeartbeatWrites:writes.lobby-beforeHeartbeat,profiles:{red:first.red.nickname,black:first.black.nickname}}));Date.now=realNow;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
