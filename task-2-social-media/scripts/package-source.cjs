const fs = require('node:fs');
const path = require('node:path');
const { zipSync } = require('fflate');
const root = path.resolve(__dirname, '..');
const destination = path.resolve(root, '..', 'task-2-github-ready');
const folder = path.join(destination, 'task-2-social-media');
const entries = {};
const allowed = ['.gitignore','package.json','package-lock.json','README.md','server.js','storage.js','netlify.toml','data/seed.json','public','netlify','scripts/build.cjs','scripts/verify-api.cjs','scripts/deploy-netlify.cjs','scripts/package-source.cjs'];
function copy(relative) {
  const source = path.join(root,relative);
  if(fs.statSync(source).isDirectory()){
    for(const name of fs.readdirSync(source))copy(path.join(relative,name));
    return;
  }
  const target=path.join(folder,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
  const bytes=fs.readFileSync(source);fs.writeFileSync(target,bytes);
  entries['task-2-social-media/'+relative.split(path.sep).join('/')]=bytes;
}
for(const item of allowed)copy(item);
const names=Object.keys(entries);
if(names.some(name=>/node_modules|\.netlify|\.deploy|data\/db\.json|\.env$/.test(name)))throw new Error('Unexpected private file in source package.');
const zipPath=path.join(destination,'task-2-social-media-source.zip');
fs.writeFileSync(zipPath,zipSync(entries,{level:9}));
console.log(JSON.stringify({folder,zipPath,files:names.length,zipBytes:fs.statSync(zipPath).size}));
