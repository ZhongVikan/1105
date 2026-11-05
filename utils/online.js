const config=require('../config');
async function call(action,data={}){if(!wx.cloud||!config.cloudEnv)throw new Error('真人对战需先配置云开发环境');const res=await wx.cloud.callFunction({name:'gameService',data:{...data,action}});if(!res.result||!res.result.ok)throw new Error(res.result&&res.result.error||'网络请求失败');return res.result;}
module.exports={call};
