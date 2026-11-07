const test=require('node:test'),assert=require('node:assert/strict'),Runtime=require('../src/runtime');

function page(room){
 const r=Object.create(Runtime.prototype);r.scene='home';r.profile={nickname:'玩家',avatar:'cloud://avatar'};r.pendingRoom='';r._inviteRoom='';r._inviteBusy=false;r._invitePromptRoom='';r.controller=null;r.open=scene=>{r.scene=scene;};return r;
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('first shared invite accepts object or string query and joins only once',async()=>{
 const room='a'.repeat(32),r=page(room);let calls=0;r.startGame=async options=>{calls++;r.controller={data:{roomId:options.room},_room:{roomId:options.room}};return true;};
 r.invite('room='+room);await settle();assert.equal(calls,1);assert.equal(r.pendingRoom,'');
 r.invite({room});await settle();assert.equal(calls,1);
});

test('failed first invite keeps the room pending for a retry',async()=>{
 const room='b'.repeat(32),r=page(room);let calls=0;r.startGame=async()=>{calls++;return calls>1;};
 r.invite({room});await settle();assert.equal(calls,1);assert.equal(r.pendingRoom,room);
 r.invite({room});await settle();assert.equal(calls,2);assert.equal(r.pendingRoom,'');
});

test('sharing a waiting room before cloud creation finishes does not send an empty link',()=>{
 const room='c'.repeat(32),r=page(room),sent=[],oldWx=global.wx;global.wx={shareAppMessage(info){sent.push(info);}};
 try{
  r.controller={_mode:'online',data:{waiting:true,roomId:''},_room:null};let toast='';r.toast=v=>{toast=v};
  assert.equal(r.share(),false);assert.equal(toast,'房间创建中，请稍候');assert.equal(sent.length,0);
  r.controller._room={roomId:room};r.controller.onShareAppMessage=()=>({title:'邀请',query:'room='+room});
  assert.equal(r.share(),true);assert.equal(sent.length,1);assert.equal(sent[0].query,'room='+room);
 }finally{if(oldWx===undefined)delete global.wx;else global.wx=oldWx;}
});
