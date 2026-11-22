const AI=require('./ai'),FusionAI=require('./fusion-ai'),Difficulty=require('./ai-difficulty');
let worker=null,workerUnavailable=false,sequence=0;
const pending=new Map();

function finishRequest(id){
 const request=pending.get(id);if(!request)return null;
 pending.delete(id);clearInterval(request.cancelTimer);clearTimeout(request.timeout);
 return request;
}
function failWorker(error){
 workerUnavailable=true;
 const current=worker;worker=null;
 for(const id of pending.keys())finishRequest(id).reject(error);
 try{if(current&&typeof current.terminate==='function')current.terminate();}catch(e){}
}
function ensureWorker(){
 if(worker||workerUnavailable)return worker;
 if(typeof wx==='undefined'||typeof wx.createWorker!=='function')return null;
 try{
  const current=wx.createWorker('workers/ai-worker.js');
  if(!current||typeof current.postMessage!=='function'||typeof current.onMessage!=='function'){workerUnavailable=true;return null;}
  worker=current;current.onMessage(message=>{
   if(!message||message.id===undefined)return;const request=finishRequest(message.id);if(!request)return;
   if(message.type==='result')request.resolve(message.cancelled?null:message.move);
   else request.reject(new Error(message.message||'AI Worker failed'));
  });
  const handleFailure=error=>{if(current===worker)failWorker(error instanceof Error?error:Error('AI Worker failed'));};
  if(typeof current.onError==='function')current.onError(handleFailure);
  if(typeof current.onProcessKilled==='function')current.onProcessKilled(handleFailure);
  return worker;
 }catch(error){failWorker(error);return null;}
}
function direct(kind,payload,level,options){
 return kind==='fusion'?FusionAI.choose(payload.state,level,options):AI.choose(payload.pieces,'black',level,options);
}
function choose(kind,payload,level,options={}){
 if(options.cancel&&options.cancel())return Promise.resolve(null);
 const current=ensureWorker();if(!current)return direct(kind,payload,level,options);
 const id=++sequence,history=payload.history||[],message={type:'choose',id,kind,level:Difficulty.effectiveLevel(level),pieces:payload.pieces,state:payload.state,history};
 return new Promise((resolve,reject)=>{
  const request={resolve,reject};pending.set(id,request);
  // A Worker that fails during module loading may never deliver an error event.
  request.timeout=setTimeout(()=>finishRequest(id)?.reject(Error('AI Worker did not respond')),3000);
  if(options.cancel)request.cancelTimer=setInterval(()=>{
   if(!options.cancel())return;
   const cancelled=finishRequest(id);if(!cancelled)return;
   try{current.postMessage({type:'cancel',id});}catch(e){}
   cancelled.resolve(null);
  },40);
  try{current.postMessage(message);}catch(error){finishRequest(id)?.reject(error);}
 }).catch(error=>{
  if(current===worker)failWorker(error);
  if(options.cancel&&options.cancel())return null;
  return direct(kind,payload,level,options);
 });
}
module.exports={choose,hasWorker:()=>!!worker||!workerUnavailable&&typeof wx!=='undefined'&&typeof wx.createWorker==='function'};
