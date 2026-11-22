const WARNING_ROUNDS=30, DRAW_ROUNDS=40;
const DRAW_REASON='no-capture-draw';

function turns(state){
 if(!Number.isInteger(state.ply)||state.ply<0)return 0;
 const captures=state.captured||[],last=captures[captures.length-1];
 const start=last?last.atPly:0;
 // A capture can already be recorded while a chase is still on the same turn.
 return Number.isInteger(start)&&start>=0?Math.max(0,state.ply-start):0;
}

function settle(state,event,moveEvent){
 if(turns(state)<DRAW_ROUNDS*2)return {ok:true,state,event};
 return {ok:true,state:{...state,status:'ended',winner:null,reason:DRAW_REASON,motif:'无吃子和棋'},event:moveEvent};
}

module.exports={WARNING_ROUNDS,DRAW_ROUNDS,DRAW_REASON,turns,settle};
