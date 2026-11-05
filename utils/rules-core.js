// Confirmed rule primitives. This is NOT a complete legality/checkmate engine.
const C=require('./coordinates');
const opposite=side=>side==='red'?'black':'red';
function controller(p){return p.hidden?(p.y<=4?'black':'red'):p.side;}
function occupant(pieces,to){return pieces.find(p=>p.x===to.x&&p.y===to.y);}
function canCapture(actor,target){return !!target&&(target.hidden||target.side!==actor);}
const back=['rook','horse','elephant','advisor','general','advisor','elephant','horse','rook'];
function openingRole(point){
 if(!C.valid(point))return null;
 if(point.y===0||point.y===9)return back[point.x];
 if((point.y===2||point.y===7)&&[1,7].includes(point.x))return 'cannon';
 if((point.y===3||point.y===6)&&[0,2,4,6,8].includes(point.x))return 'pawn';
 return null; // Never invent a role at a traditional empty square.
}
function canReach(pieces,p,to,actor){
 if(!C.valid(to)||!C.valid(p)||controller(p)!==actor)return false;
 const dx=to.x-p.x,dy=to.y-p.y,ax=Math.abs(dx),ay=Math.abs(dy);
 if(!ax&&!ay)return false;
 const target=occupant(pieces,to);
 if(target&&(!canCapture(actor,target)||(p.variant==='jieqi'&&controller(target)===actor)))return false;
 const kind=p.hidden?openingRole(p):p.kind;
 if(!kind)throw new Error('UNRESOLVED_OPENING_ROLE');
 const blocked=(x,y)=>!!occupant(pieces,{x,y});
 if(kind==='advisor')return ax===1&&ay===1&&(!(p.hidden||p.variant==='classic')||(to.x>=3&&to.x<=5&&(actor==='red'?to.y>=7:to.y<=2)));
 if(kind==='elephant')return ax===2&&ay===2&&!blocked(p.x+dx/2,p.y+dy/2)&&(p.variant!=='classic'||(actor==='red'?to.y>=5:to.y<=4));
 if(kind==='horse')return (ax===2&&ay===1&&!blocked(p.x+dx/2,p.y))||(ax===1&&ay===2&&!blocked(p.x,p.y+dy/2));
 if(kind==='pawn'){
  const forward=actor==='red'?-1:1,crossed=actor==='red'?p.y<=4:p.y>=5;
  return (!dx&&dy===forward)||(crossed&&ax===1&&!dy);
 }
 if(kind==='general')return ax+ay===1&&to.x>=3&&to.x<=5&&(actor==='red'?to.y>=7:to.y<=2);
 if(kind==='rook'||kind==='cannon'){
  if(dx&&dy)return false;
  let count=0,x=p.x+Math.sign(dx),y=p.y+Math.sign(dy);
  while(x!==to.x||y!==to.y){if(blocked(x,y))count++;x+=Math.sign(dx);y+=Math.sign(dy);}
  return kind==='rook'?count===0:count===(target?1:0);
 }
 return false;
}
function initialHiddenLayout(random=Math.random){
 const standard=C.initialPieces().map(p=>({...p,kind:openingRole(p)}));
 const generals=standard.filter(p=>p.general),slots=standard.filter(p=>!p.general);
 for(let attempt=0;attempt<128;attempt++){
  const pool=slots.slice();
  for(let i=pool.length-1;i>0;i--){
   const n=random();if(!Number.isFinite(n)||n<0||n>=1)throw new Error('Invalid random source');
   const j=Math.floor(n*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];
  }
  const pieces=slots.map((slot,i)=>({...pool[i],id:`piece-${slot.x}-${slot.y}`,x:slot.x,y:slot.y,hidden:true}));
  // Both camps contain spies; generals are never shuffled.
  const mixed=['red','black'].every(side=>pieces.some(p=>controller(p)===side&&p.side!==side)&&pieces.some(p=>controller(p)===side&&p.side===side));
  if(mixed){const result=[...generals,...pieces];C.validatePieces(result);return result;}
 }
 throw new Error('Unable to generate mixed setup');
}
function initialLayout(variant='dark',random=Math.random){
 if(!['dark','classic','jieqi','fusion'].includes(variant))throw Error('未知玩法');
 if(variant==='dark')return initialHiddenLayout(random);
 const standard=C.initialPieces().map(p=>({...p,kind:openingRole(p),variant}));
 if(variant==='classic'||variant==='fusion')return standard;
 const result=standard.filter(p=>p.general);
 for(const side of ['red','black']){
  const slots=standard.filter(p=>p.side===side&&!p.general),pool=slots.slice();
  for(let i=pool.length-1;i>0;i--){const n=random();if(!Number.isFinite(n)||n<0||n>=1)throw Error('Invalid random source');const j=Math.floor(n*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  slots.forEach((slot,i)=>result.push({...pool[i],id:`piece-${slot.x}-${slot.y}`,x:slot.x,y:slot.y,hidden:true}));
 }
 return result;
}
module.exports={initialLayout,controller,canCapture,openingRole,canReach,initialHiddenLayout,opposite};
