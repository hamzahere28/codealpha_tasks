const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(root, '.verification-'));
const dbFile = path.join(temporary, 'db.json');
const sourceDb = path.join(root,'data','db.json');
fs.copyFileSync(fs.existsSync(sourceDb) ? sourceDb : path.join(root,'data','seed.json'),dbFile);
process.env.SOCIAL_DB_FILE = dbFile;
const server = require('../server.js');
let base;
async function request(route,method='GET',body,token,status=200){const res=await fetch(base+route,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(res.status,status,`${method} ${route}: ${await res.clone().text()}`);return res.json();}
(async()=>{
  try{
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base=`http://127.0.0.1:${server.address().port}`;
    const guest=await request('/api/feed');assert(guest.posts.length>0);assert(!('email' in guest.users[0]));
    await request('/api/posts','POST',{content:'No account'},null,401);
    const registration=await request('/api/auth/register','POST',{name:'QA Creator',username:'qa_creator_'+Date.now(),email:`qa_${Date.now()}@example.com`,password:'Testing123!'},null,201);
    const token=registration.token;
    const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=';
    const created=await request('/api/posts','POST',{content:'A verification post',mood:'Build logs',image},token,201);
    const id=created.post.id;assert.equal(created.post.image,image);
    await request(`/api/posts/${id}/like`,'POST',{},token);
    await request(`/api/posts/${id}/save`,'POST',{},token);
    await request(`/api/posts/${id}/comments`,'POST',{content:'A thoughtful reply'},token,201);
    await request(`/api/users/${guest.users[0].id}/follow`,'POST',{},token);
    await request('/api/me','PATCH',{name:'Updated Creator',role:'Designer',bio:'Making meaningful things.',location:'Karachi'},token);
    const feed=await request('/api/feed','GET',null,token);const post=feed.posts.find(p=>p.id===id);
    assert(post.saved&&post.liked);assert.equal(post.commentCount,1);assert.equal(feed.viewer.name,'Updated Creator');assert.equal(feed.viewer.followingCount,1);
    const persisted=JSON.parse(fs.readFileSync(dbFile,'utf8'));assert(persisted.users.find(u=>u.id===registration.user.id).savedPosts.includes(id));
    await request(`/api/posts/${guest.posts[0].id}`,'DELETE',null,token,403);
    await request('/api/posts','POST',{content:'Invalid image',image:'javascript:alert(1)'},token,400);
    await request(`/api/posts/${id}`,'DELETE',null,token);assert(!(await request('/api/feed')).posts.some(p=>p.id===id));
    await request('/api/auth/logout','POST',{},token);await request('/api/me','GET',null,token,401);
    console.log('PASS: registration, authorization, image posts, likes, replies, saves, follows, profile edits, persistence, deletion ownership, validation, logout.');
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
