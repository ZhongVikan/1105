const config=require('../config');
async function call(action,data={}){
 if(!wx.cloud||!config.cloudEnv)throw new Error('真人对战需先配置云开发环境');
 const response=await wx.cloud.callFunction({name:'gameService',data:{...data,action}});
 const result=response&&response.result;
 if(result&&result.ok)return result;
 const error=new Error(result&&result.error||'网络请求失败');
 error.serverRejected=!!(result&&result.ok===false);
 throw error;
}
module.exports={call};
