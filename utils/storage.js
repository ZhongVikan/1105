const G=require('./game-engine'),KEY='dark-chess-save-v2';
function load(){try{const v=wx.getStorageSync(KEY);if(!v)return null;G.validate(v.state);return {state:v.state,history:Array.isArray(v.history)?v.history.slice(-100):[]};}catch(e){return null;}}
function save(state,history){try{wx.setStorageSync(KEY,{state,history:history.slice(-100)});return true;}catch(e){return false;}}
function settings(){try{return {sound:true,music:true,effects:true,voice:true,...wx.getStorageSync('dark-chess-settings-v2')};}catch(e){return {sound:true,music:true,effects:true,voice:true};}}
function setSettings(v){wx.setStorageSync('dark-chess-settings-v2',v);}
module.exports={load,save,settings,setSettings};
