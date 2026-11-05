const test=require('node:test'),a=require('node:assert/strict');
const F=require('../utils/fake-opponents'),Def=require('../src/controller');
test('fake opponent pool has 100 supplied nicknames',()=>{a.equal(F.names.length,100);a.equal(new Set(F.names).size,100);});
test('fallback enters hard local AI after a waiting match',async()=>{const c={...Def,_alive:true,_mode:'online',_matchQueue:true,_room:{waiting:true,roomId:'',rev:0},_token:0,_clock:{start(){}},data:{},setData(p){Object.assign(this.data,p)},sync(){},scheduleAI(){}};await c.activateFakeOpponent();a.equal(c._mode,'ai');a.equal(c._level,'hard');a.equal(c.data.waiting,false);a.ok(c._fakeOpponent.nickname);});
