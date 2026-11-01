'use strict';
importScripts('vault-crypto.js');
const scope=new URL(self.registration.scope),prefix=scope.pathname+'_content/';
let files=null,lastUsed=0,busy=false;
const IDLE=30*60*1000;
function unlocked(){if(files&&Date.now()-lastUsed>IDLE)files=null;return !!files;}
function reply(event,value){event.ports[0]?.postMessage(value);}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(!event.source?.url||new URL(event.source.url).origin!==scope.origin||!new URL(event.source.url).pathname.startsWith(scope.pathname))return;
 event.waitUntil((async()=>{
  if(event.data?.type==='STATUS'){reply(event,{unlocked:unlocked()});return;}
  if(event.data?.type==='TOUCH'){if(unlocked())lastUsed=Date.now();reply(event,{unlocked:unlocked()});return;}
  if(event.data?.type==='LOCK'){files=null;for(const client of await self.clients.matchAll())client.postMessage({type:'LOCKED'});reply(event,{ok:true});return;}
  if(event.data?.type!=='UNLOCK')return;
  if(busy){reply(event,{ok:false,error:'別の処理が進行中です。少し待ってからお試しください。'});return;}
  busy=true;
  try{
   if(typeof event.data.password!=='string'||event.data.password.length>256)throw Error();
   const response=await fetch(new URL('vault.bin',scope),{cache:'no-store'});if(!response.ok)throw Error('教材データを取得できません。通信状況を確認してください。');
   const bytes=await BioVault.decrypt(new Uint8Array(await response.arrayBuffer()),event.data.password);
   const plain=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
   const bundle=JSON.parse(plain);if(bundle.version!==1||!Array.isArray(bundle.files))throw Error();
   const next=new Map();for(const f of bundle.files){if(typeof f.path!=='string'||f.path.startsWith('/')||f.path.split('/').includes('..'))throw Error();const raw=atob(f.data);next.set(f.path,{mime:f.mime,bytes:Uint8Array.from(raw,c=>c.charCodeAt(0))});}
   if(!next.has('index.html'))throw Error();files=next;lastUsed=Date.now();reply(event,{ok:true});
  }catch(e){reply(event,{ok:false,error:e.message==='教材データを取得できません。通信状況を確認してください。'?e.message:'パスワードが違うか、教材データが更新されています。もう一度お試しください。'});}
  finally{if(event.data)event.data.password='';busy=false;}
 })());
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==scope.origin||!url.pathname.startsWith(prefix))return;
 event.respondWith((async()=>{
  if(!unlocked()){
   if(event.request.mode==='navigate'){const login=new URL(scope);login.searchParams.set('next',url.href);return Response.redirect(login,302);}
   for(const client of await self.clients.matchAll())client.postMessage({type:'LOCKED'});
   return new Response('教材を開き直してください。',{status:401,headers:{'Cache-Control':'no-store'}});
  }
  if(!['GET','HEAD'].includes(event.request.method))return new Response(null,{status:405});
  let path;try{path=decodeURIComponent(url.pathname.slice(prefix.length));}catch{return new Response(null,{status:400});}
  const file=files.get(path||'index.html');if(!file)return new Response('見つかりません。',{status:404});lastUsed=Date.now();
  let body=file.bytes;
  if(file.mime.startsWith('text/html'))body=new TextEncoder().encode(new TextDecoder().decode(body).replace('</body>',`<script src="${scope.pathname}vault-session.js"></script></body>`));
  return new Response(event.request.method==='HEAD'?null:body,{headers:{'Content-Type':file.mime,'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Robots-Tag':'noindex, nofollow'}});
 })());
});
