// Single Worker entry for local AI search. The main thread owns UI/input;
// this file owns one search at a time and never creates another Worker.
const AI=require('../utils/ai'),FusionAI=require('../utils/fusion-ai'),Repetition=require('../utils/repetition'),R=require('../utils/rules-core');

const channel=typeof worker!=='undefined'?worker:typeof wx!=='undefined'?wx:null;
const cancelled=new Set();
const send=value=>{if(channel&&typeof channel.postMessage==='function')channel.postMessage(value);};
function avoidPerpetual(state,history,move){
 const piece=state.pieces.find(p=>p.id===move.id);if(!piece||piece.hidden)return true;
 const candidate={...state,pieces:AI.apply(AI.publicBoard(state.pieces),move,state.turn),turn:R.opposite(state.turn)};
 const repeat=Repetition.analyze(history,candidate);
 return !repeat||repeat.kind!=='perpetual'||repeat.offender!==state.turn;
}
async function choose(message){
 const {id,kind,level,pieces,state,history=[]}=message;
 const cancel=()=>cancelled.has(id);
 try{
  const result=kind==='fusion'
   ?await FusionAI.choose(state,level,{cancel})
   :await AI.choose(pieces,'black',level,{history,cancel,allowMove:move=>avoidPerpetual(state,history,move),yieldFrame:()=>new Promise(resolve=>setTimeout(resolve,0))});
  send({type:'result',id,move:result,cancelled:cancel()});
 }catch(error){send({type:'error',id,message:String(error&&error.message||error)});}finally{cancelled.delete(id);}
}
function onMessage(message){
 if(!message||typeof message!=='object')return;
 if(message.type==='cancel'){cancelled.add(message.id);return;}
 if(message.type==='choose')choose(message);
}
if(channel&&typeof channel.onMessage==='function')channel.onMessage(onMessage);
