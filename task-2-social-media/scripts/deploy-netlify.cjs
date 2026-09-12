const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const stateFile = path.join(root, '.netlify/state.json');
const siteName = 'codealpha-social-platform-5574484';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function release(token) {
  async function api(route, method='GET', body, binary=false) {
    const response = await fetch('https://api.netlify.com/api/v1'+route, {
      method, signal: AbortSignal.timeout(60000),
      headers: { Authorization: 'Bearer '+token, 'Content-Type': binary?'application/octet-stream':'application/json' },
      ...(body ? {body:binary?body:JSON.stringify(body)} : {})
    });
    const text = await response.text();
    let data;try{data=JSON.parse(text);}catch{data={message:text.slice(0,250)};}
    if(!response.ok)throw new Error(`${method} ${route}: ${response.status} ${data.message || data.error || 'Request failed'}`);
    return data;
  }
  const existing = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile,'utf8')) : {};
  let site;
  if(existing.siteId)site=await api('/sites/'+existing.siteId);
  else {
    const sites=await api('/sites');site=sites.find(item=>item.name===siteName);
    if(!site)site=await api('/sites','POST',{name:siteName,account_slug:'hamzatalha783'});
  }
  fs.mkdirSync(path.dirname(stateFile),{recursive:true});
  const state={siteId:site.id,name:site.name,url:site.ssl_url || `https://${site.name}.netlify.app`};
  fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
  console.log('Netlify project:',state.name);
  const files={};const buffers=new Map();
  function collect(folder,prefix=''){
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      const relative=prefix+'/'+entry.name;const full=path.join(folder,entry.name);
      if(entry.isDirectory())collect(full,relative);
      else {const data=fs.readFileSync(full);const hash=crypto.createHash('sha1').update(data).digest('hex');files[relative]=hash;buffers.set(hash,{relative,data});}
    }
  }
  collect(path.join(root,'public'));
  const fn=fs.readFileSync(path.join(root,'.deploy/api.zip'));const hash=crypto.createHash('sha256').update(fn).digest('hex');
  let deploy=await api(`/sites/${site.id}/deploys`,'POST',{files,functions:{api:hash},draft:false,title:'CodeAlpha Social: full-stack release'});
  state.deployId=deploy.id;fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
  for(let i=0;deploy.state==='preparing'&&i<20;i++){await pause(2000);deploy=await api('/deploys/'+deploy.id);}
  for(const digest of deploy.required || []) {
    const file=buffers.get(digest);if(!file)throw new Error('Unknown required file');
    await api(`/deploys/${deploy.id}/files${file.relative.split('/').map(encodeURIComponent).join('/')}`,'PUT',file.data,true);
  }
  if((deploy.required_functions || []).includes(hash))await api(`/deploys/${deploy.id}/functions/api?runtime=js`,'PUT',fn,true);
  console.log('Frontend and backend uploaded. Waiting for production readiness.');
  for(let attempt=0;attempt<80;attempt++) {
    deploy=await api('/deploys/'+deploy.id);
    if(deploy.state==='ready'){
      state.url=deploy.ssl_url || state.url;state.deployUrl=deploy.deploy_ssl_url;state.state=deploy.state;
      fs.writeFileSync(stateFile,JSON.stringify(state,null,2));console.log(JSON.stringify(state));return;
    }
    if(deploy.state==='error')throw new Error(deploy.error_message || 'Deployment failed');
    await pause(3000);
  }
  throw new Error('Deployment still processing. Reconcile the saved deploy ID before retrying.');
}

function finish(){if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();process.stdin.unref?.();}
if(process.env.NETLIFY_AUTH_TOKEN){release(process.env.NETLIFY_AUTH_TOKEN).catch(e=>{console.error(e.message);process.exitCode=1;});}
else {
  if(!process.stdin.isTTY)throw new Error('Use NETLIFY_AUTH_TOKEN or an interactive terminal.');
  process.stdin.setRawMode(true);process.stdin.resume();let input='';
  console.log('Enter deployment credential (hidden):');
  process.stdin.on('data',function receive(chunk){input+=chunk.toString();if(!/[\r\n]/.test(input))return;process.stdin.off('data',receive);process.stdin.pause();const token=input.trim();input='';release(token).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(finish);});
}
