const fs = require('node:fs');
const path = require('node:path');
const ncc = require('@vercel/ncc');
const {zipSync} = require('fflate');
const root = path.resolve(__dirname, '..');

(async()=>{
  const vendor=path.join(root,'public/vendor');
  fs.mkdirSync(vendor,{recursive:true});
  for(const name of ['three.module.js','three.core.js'])fs.copyFileSync(path.join(root,'node_modules/three/build',name),path.join(vendor,name));
  fs.copyFileSync(path.join(root,'node_modules/lucide/dist/umd/lucide.js'),path.join(vendor,'lucide.js'));
  const target=path.join(root,'.deploy');fs.mkdirSync(target,{recursive:true});
  const result=await ncc(path.join(root,'netlify/functions/api.js'),{cache:false,minify:false,quiet:true});
  const contents={'api.js':Buffer.from(result.code)};
  for(const [name,asset] of Object.entries(result.assets)) if(name !== 'db.json') contents[name]=Buffer.from(asset.source);
  fs.writeFileSync(path.join(target,'api.zip'),zipSync(contents,{level:9}));
  console.log('Built frontend assets and Netlify API function.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
