const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('../utils/game-engine');
const AI=require('../utils/ai');

test('classic AI opening avoids the repeated cannon-horse exchange and varies plans',async()=>{
  const state=G.newGame(undefined,'classic'),families=new Set();
  for(const q of [0,.4,.7,1]){
    const move=await AI.choose(state.pieces,'black','normal',{random:()=>q,yieldFrame:()=>Promise.resolve()});
    assert.ok(move);
    const piece=state.pieces.find(p=>p.id===move.id),target=state.pieces.find(p=>p.x===move.to.x&&p.y===move.to.y);
    assert.ok(!(piece.kind==='cannon'&&target&&target.kind==='horse'));
    families.add(piece.kind);
  }
  assert.ok(families.size>1);
});
