const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const AI=require('../utils/ai'),G=require('../utils/game-engine');
const root=path.resolve(__dirname,'..');
const clientPath=require.resolve('../utils/ai-worker-client');

test('the packaged AI Worker loads and plays with only its configured directory', {timeout:5000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dark-chess-worker-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const configuredDir=path.join(root,require('../game.json').workers);
 fs.cpSync(configuredDir,path.join(dir,'workers'),{recursive:true});
 for(const file of fs.readdirSync(path.join(configuredDir,'shared'))){
  assert.deepEqual(fs.readFileSync(path.join(configuredDir,'shared',file)),fs.readFileSync(path.join(root,'utils',file)),`Run node tools/sync-worker.js after changing ${file}`);
 }
 let receive,reply;
 global.worker={onMessage(callback){receive=callback;},postMessage(message){reply(message);}};
 t.after(()=>{delete global.worker;});
 require(path.join(dir,'workers/ai-worker.js'));
 for(const [index,variant] of ['dark','fusion'].entries()){
  const state={...G.newGame(()=>.4,variant),turn:'black'};
  const response=new Promise(resolve=>{reply=resolve;});
  const id=index+1;
  receive({type:'choose',id,kind:variant==='fusion'?'fusion':'classic',level:'easy',pieces:state.pieces,state});
  const result=await response;
  assert.equal(result.type,'result',result.message);assert.equal(result.id,id);
  assert.ok(result.move);assert.ok(G.move(state,result.move.id,result.move.to).ok);
 }
});

function mockClient(t,createWorker){
 global.wx={createWorker};
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 delete require.cache[clientPath];
 t.after(()=>{delete global.wx;delete require.cache[clientPath];});
 return require(clientPath);
}

test('a Worker that reports no startup error and never replies falls back once',async t=>{
 let creates=0,terminations=0;
 const client=mockClient(t,()=>{creates++;return {postMessage(){},onMessage(){},terminate(){terminations++;}};});
 const fallback=t.mock.method(AI,'choose',async()=>({id:'fallback'}));
 const result=client.choose('classic',{pieces:[]},'normal',{cancel:()=>false});
 t.mock.timers.tick(3000);
 assert.deepEqual(await result,{id:'fallback'});assert.equal(terminations,1);
 await client.choose('classic',{pieces:[]},'normal');
 assert.equal(creates,1);assert.equal(fallback.mock.callCount(),2);
});

test('cancelling a Worker request settles it even if the Worker never replies',async t=>{
 const messages=[];let cancelled=false;
 const client=mockClient(t,()=>({postMessage(message){messages.push(message);},onMessage(){}}));
 const fallback=t.mock.method(AI,'choose',async()=>assert.fail('cancelled searches must not fall back'));
 const result=client.choose('classic',{pieces:[]},'normal',{cancel:()=>cancelled});
 cancelled=true;t.mock.timers.tick(40);
 assert.equal(await result,null);assert.deepEqual(messages.map(message=>message.type),['choose','cancel']);
 t.mock.timers.tick(3000);
 assert.equal(fallback.mock.callCount(),0);
});
