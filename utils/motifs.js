// Conservative recognizers. Called ONLY after the engine proves checkmate.
// Never infer a tactic from hidden identities. Complex historical names stay generic.
function detect(pieces,loser,hits,context={}){
 const winner=loser==='red'?'black':'red',king=pieces.find(p=>!p.hidden&&p.kind==='general'&&p.side===loser);
 const own=pieces.filter(p=>!p.hidden&&p.side===winner),enemy=pieces.filter(p=>!p.hidden&&p.side===loser);
 const rank=p=>loser==='black'?p.y:9-p.y;
 const is=(p,k)=>p&&!p.hidden&&p.kind===k;
 const between=(a,b)=>pieces.filter(p=>p.id!==a.id&&p.id!==b.id&&(a.x===b.x?p.x===a.x&&p.y>Math.min(a.y,b.y)&&p.y<Math.max(a.y,b.y):a.y===b.y&&p.y===a.y&&p.x>Math.min(a.x,b.x)&&p.x<Math.max(a.x,b.x)));
 const cannonHits=hits.filter(p=>is(p,'cannon')),rookHits=hits.filter(p=>is(p,'rook')),horseHits=hits.filter(p=>is(p,'horse'));
 for(const cannon of cannonHits){const screen=between(cannon,king);if(screen.length===1&&screen[0].side===winner&&!screen[0].hidden){if(is(screen[0],'cannon'))return '重炮';if(is(screen[0],'horse'))return '马后炮';}}
 const neighbours=[[0,1],[0,-1],[1,0],[-1,0]].map(([dx,dy])=>({x:king.x+dx,y:king.y+dy})).filter(p=>p.x>=3&&p.x<=5&&rank(p)>=0&&rank(p)<=2);
 const enclosed=neighbours.length&&neighbours.every(q=>enemy.some(p=>p.x===q.x&&p.y===q.y));
 if(enclosed&&cannonHits.length){const advisors=enemy.filter(p=>p.kind==='advisor'&&p.x>=3&&p.x<=5&&rank(p)<=2);return advisors.length===2?'闷宫':'闷杀';}
 if(enclosed&&(rookHits.length||horseHits.length))return '闷罐杀';
 if(hits.some(p=>is(p,'pawn')&&p.x===4&&rank(p)===1))return '小鬼坐龙庭';
 if(horseHits.some(p=>[2,6].includes(p.x)&&rank(p)===1))return '卧槽马';
 if(horseHits.some(p=>[3,5].includes(p.x)&&rank(p)===2))return '挂角马';
 const captured=context.captured,last=context.last;
 if(last&&captured&&is(captured,'advisor')&&captured.side===loser&&captured.x===4&&rank(captured)===1&&rookHits.some(p=>p.id===last.id))return '大刀剜心';
 const attackingKing=own.find(p=>p.kind==='general');
 if(attackingKing&&attackingKing.x===king.x){const screens=between(attackingKing,king);if(screens.length===1&&rookHits.some(p=>p.id===screens[0].id))return '白脸将';}
 if(rookHits.some(p=>rank(p)<=2)&&cannonHits.some(p=>p.x===4&&king.x===4))return '铁门栓';
 // Historical alternation: two distinct checking rooks on consecutive own turns.
 const previous=context.recent&&context.recent.filter(m=>m.actor===winner&&m.check).slice(-1)[0];
 if(previous&&last&&previous.id!==last.id&&rookHits.some(p=>p.id===last.id)&&own.some(p=>p.id===previous.id&&p.kind==='rook')&&previous.ply===context.ply-2)return '双车错';
 return '将死';
}
module.exports={detect};
