function atLeast(version,min='2.32.3'){const a=String(version).split('.').map(Number),b=min.split('.').map(Number);for(let i=0;i<3;i++){if(!Number.isFinite(a[i]||0))return false;if((a[i]||0)!==b[i])return (a[i]||0)>b[i];}return true;}
function supported(){if(typeof wx.requirePrivacyAuthorize!=='function')return false;try{const info=wx.getAppBaseInfo?wx.getAppBaseInfo():wx.getSystemInfoSync?wx.getSystemInfoSync():{};return !info.SDKVersion||atLeast(info.SDKVersion);}catch(error){return false;}}
module.exports={supported,atLeast};
