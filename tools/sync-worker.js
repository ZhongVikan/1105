const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'workers/shared');
// WeChat Workers can load only files under the configured worker directory.
const modules=['ai','ai-difficulty','coordinates','fusion','fusion-ai','game-engine','motifs','no-capture','repetition','rules-core'];
fs.mkdirSync(dest,{recursive:true});
for(const name of modules){
 const file=name+'.js';
 fs.copyFileSync(path.join(root,'utils',file),path.join(dest,file));
}
