const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('../utils/game-engine');
const AI=require('../utils/ai');
const Difficulty=require('../utils/ai-difficulty');

test('classic AI opening avoids the repeated cannon-horse exchange and varies plans',async()=>{
  const state=G.newGame(undefined,'classic'),families=new Set();
  for(const q of [0,.4,.7,1]){
    const move=await AI.choose(state.pieces,'black','normal',{random:()=>q,yieldFrame:()=>Promise.resolve()});
    assert.ok(move&&G.legalAttempt(state.pieces,move.id,move.to,'black'));
    const piece=state.pieces.find(p=>p.id===move.id),target=state.pieces.find(p=>p.x===move.to.x&&p.y===move.to.y);
    assert.ok(!(piece.kind==='cannon'&&target&&target.kind==='horse'));
    families.add(piece.kind);
  }
  assert.ok(families.size>1);
});

test('normal AI varies its first reply with game history at both search depths',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1000});
  const profile=Difficulty.profile;
  let depth;
  t.mock.method(Difficulty,'profile',(level,options)=>({...profile(level,options),depth}));
  const start=G.newGame(undefined,'classic');
  const first=G.move(start,'red-back-1',{x:2,y:7});
  assert.ok(first.ok);
  const {state}=first,history=[start,state];
  for(const maxDepth of [1,2]){
    depth=maxDepth;
    const families=new Set();
    for(const q of [0,1]){
      let completed;
      const move=await AI.choose(state.pieces,'black','normal',{history,random:()=>q,onStats:stats=>{completed=stats.depth;}});
      assert.equal(completed,maxDepth);
      assert.ok(move&&G.legalAttempt(state.pieces,move.id,move.to,'black'));
      assert.ok(!state.pieces.some(p=>p.x===move.to.x&&p.y===move.to.y));
      families.add(state.pieces.find(p=>p.id===move.id).kind);
    }
    assert.equal(families.size,2);
  }
});

test('classic opening variety still takes an unprotected horse',async()=>{
  const start=G.newGame(undefined,'classic');
  const first=G.move(start,'red-back-0',{x:0,y:8});
  assert.ok(first.ok);
  const {state}=first;
  const move=await AI.choose(state.pieces,'black','normal',{
    history:[start,state],random:()=>1,yieldFrame:()=>Promise.resolve(),
  });
  assert.deepEqual(move,{id:'black-cannon-1',to:{x:1,y:9}});
  assert.ok(G.move(state,move.id,move.to).ok);
});
