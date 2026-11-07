const AI=require('./ai'),FusionAI=require('./fusion-ai');
let worker=null,workerUnavailable=false,sequence=0;
const pending=new Map();

function failWorker(error){
 workerUnavailable=true;
 const current=worker;worker=null;
 try{if(current&&typeof current.terminate==='function')current.terminate();}catch(e){}
 for(const request of pending.values())request.reject(error);
 pending.clear();
}
function ensureWorker(){
 if(worker||workerUnavailable)return worker;
 if(typeof wx==='undefined'||typeof wx.createWorker!=='function')return null;
 try{
  const current=wx.createWorker('workers/ai-worker.js');
  if(!current||typeof current.postMessage!=='function'||typeof current.onMessage!=='function'){workerUnavailable=true;return null;}
  worker=current;current.onMessage(message=>{
   if(!message||message.id===undefined)return;const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearInterval(request.cancelTimer);
   if(message.type==='result')request.resolve(message.cancelled?null:message.move);
   else request.reject(new Error(message.message||'AI Worker failed'));
  });
  if(typeof current.onError==='function')current.onError(error=>failWorker(error instanceof Error?error:Error('AI Worker failed')));
  return worker;
 }catch(error){workerUnavailable=true;return null;}
}
function direct(kind,payload,level,options){
 return kind==='fusion'?FusionAI.choose(payload.state,level,options):AI.choose(payload.pieces,'black',level,options);
}
function choose(kind,payload,level,options={}){
 const current=ensureWorker();if(!current)return direct(kind,payload,level,options);
 const id=++sequence,history=payload.history||[],message={type:'choose',id,kind,level,pieces:payload.pieces,state:payload.state,history};
 return new Promise((resolve,reject)=>{
  const request={resolve,reject,cancelTimer:null};pending.set(id,request);
  request.cancelTimer=setInterval(()=>{if(options.cancel&&options.cancel()){try{current.postMessage({type:'cancel',id});}catch(e){}clearInterval(request.cancelTimer);}},40);
  try{current.postMessage(message);}catch(error){clearInterval(request.cancelTimer);pending.delete(id);reject(error);}
 }).catch(error=>{
  if(error&&error.code==='AI_CANCELLED')return null;
  if(current===worker)failWorker(error);
  return direct(kind,payload,level,options);
 });
}
module.exports={choose,hasWorker:()=>!!worker||!workerUnavailable&&typeof wx!=='undefined'&&typeof wx.createWorker==='function'};
