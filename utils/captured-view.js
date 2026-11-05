const G=require('./game-engine');
exports.groups=pieces=>{const map=new Map();for(const p of G.displayPieces(pieces)){const k=p.side+':'+p.kind;if(map.has(k))map.get(k).count++;else map.set(k,{...p,count:1});}return Array.from(map.values());};
