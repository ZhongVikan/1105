// Public-board tactical announcement only; does not change legality or results.
const G=require('./game-engine'),R=require('./rules-core');
function detect(state){
 if(!state||state.status!=='playing'||!['red','black'].includes(state.turn)||!Array.isArray(state.pieces))return null;
 const actor=R.opposite(state.turn),pieces=state.pieces;
 const checking=G.attackers(pieces,state.turn).filter(p=>!p.hidden&&p.side===actor);
 if(!checking.length)return null;
 // One announcement per check, even for double check / several fork targets.
 for(const kind of ['rook','horse','cannon']){
  const targets=pieces.filter(p=>!p.hidden&&p.side===state.turn&&p.kind===kind);
  for(const attacker of checking)for(const target of targets){
   if(G.legalAttempt(pieces,attacker.id,{x:target.x,y:target.y},actor))return kind;
  }
 }
 return null;
}
module.exports={detect};
