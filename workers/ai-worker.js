// Single Worker entry for local AI search. The main thread owns UI/input;
// this file owns one search at a time and never creates another Worker.
const AI=require('./shared/ai'),FusionAI=require('./shared/fusion-ai'),Repetition=require('./shared/repetition'),R=require('./shared/rules-core');

const channel=typeof worker!=='undefined'?worker:typeof wx!=='undefined'?wx:null;
const searches=new Map();
const send=value=>{if(channel&&typeof channel.postMessage==='function')channel.postMessage(value);};
function avoidPerpetual(state,history,move){
 const piece=state.pieces.find(p=>p.id===move.id);if(!piece||piece.hidden)return true;
 const candidate={...state,pieces:AI.apply(AI.publicBoard(state.pieces),move,state.turn),turn:R.opposite(state.turn)};
 const repeat=Repetition.analyze(history,candidate);
 return !repeat||repeat.kind!=='perpetual'||repeat.offender!==state.turn;
}
async function choose(message){
 const {id,kind,level,pieces,state,history=[]}=message;
 const search={cancelled:false};searches.set(id,search);
 const cancel=()=>search.cancelled;
 try{
  const result=kind==='fusion'
   ?await FusionAI.choose(state,level,{cancel})
   :await AI.choose(pieces,'black',level,{history,cancel,allowMove:move=>avoidPerpetual(state,history,move),yieldFrame:()=>new Promise(resolve=>setTimeout(resolve,0))});
  send({type:'result',id,move:result,cancelled:cancel()});
 }catch(error){send({type:'error',id,message:String(error&&error.message||error)});}finally{searches.delete(id);}
}
function onMessage(message){
 if(!message||typeof message!=='object')return;
 if(message.type==='cancel'){const search=searches.get(message.id);if(search)search.cancelled=true;return;}
 if(message.type==='choose')choose(message);
}
if(channel&&typeof channel.onMessage==='function')channel.onMessage(onMessage);
