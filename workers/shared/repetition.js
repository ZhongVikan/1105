// Local AI-match rule. Keys contain only observable board information and turn.
const G=require('./game-engine'),R=require('./rules-core');
function key(s){return s.turn+'|'+s.pieces.map(p=>p.x+','+p.y+':'+(p.hidden?'hidden':p.side+','+p.kind)).sort().join('|');}
function analyze(history,next){const states=[...history,next],target=key(next),hits=[];for(let i=0;i<states.length;i++)if(key(states[i])===target)hits.push(i);if(hits.length<3)return null;
 const start=hits[hits.length-3],checks={red:[],black:[]};for(let i=start+1;i<states.length;i++){const actor=states[i-1].turn;checks[actor].push(G.checked(states[i].pieces,R.opposite(actor)));}
 const sides=['red','black'].filter(side=>checks[side].length>0&&checks[side].every(Boolean));return sides.length===2?{kind:'mutual',key:target}:sides.length===1?{kind:'perpetual',offender:sides[0],key:target}:null;
}
module.exports={key,analyze};
