'use strict';
importScripts('vault-crypto.js');
const scope=new URL(self.registration.scope),prefix=scope.pathname+'_content/';
const IDLE=30*60*1000,DB_NAME='biology-vault-session:'+scope.pathname;
const STORAGE_ERROR='ログイン状態を保存できません。このサイトの端末内データの保存を許可して、もう一度お試しください。';
let files=null,loadedId=null,database=null,queue=Promise.resolve();

// Workers may stop at any time. Persist ciphertext, a non-exportable key and
// an expiry only. Decrypted teaching materials remain in memory.
function openDatabase(){
 if(database)return database;
 database=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('state');
  request.onerror=()=>reject(Error(STORAGE_ERROR));
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
 }).catch(error=>{database=null;throw error;});
 return database;
}
async function transaction(work){
 const db=await openDatabase();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');let value;
  tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(Error(STORAGE_ERROR));tx.onerror=()=>{};
  try{work(store,result=>{value=result;});}catch{tx.abort();}
 });
}
function validSession(session){
 return session?.version===1&&typeof session.id==='string'&&Number.isFinite(session.expiresAt)&&
  session.key?.type==='secret'&&session.key.extractable===false&&session.key.algorithm?.name==='AES-GCM';
}
async function readSession(touch=false){
 return transaction((store,done)=>{
  const request=store.get('session');
  request.onsuccess=()=>{
   const session=request.result;
   if(!validSession(session)||Date.now()>=session.expiresAt){store.clear();files=null;loadedId=null;done(null);return;}
   if(touch){session.expiresAt=Date.now()+IDLE;store.put(session,'session');}
   done(session);
  };
 });
}
async function clearSession(id){
 files=null;loadedId=null;
 await transaction(store=>{
  if(!id){store.clear();return;}
  const request=store.get('session');request.onsuccess=()=>{if(request.result?.id===id)store.clear();};
 });
}
async function unpack(bytes){
 const plain=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
 const bundle=JSON.parse(plain);if(bundle.version!==1||!Array.isArray(bundle.files))throw Error();
 const next=new Map();
 for(const file of bundle.files){
  if(typeof file.path!=='string'||file.path.startsWith('/')||file.path.split('/').includes('..'))throw Error();
  const raw=atob(file.data);next.set(file.path,{mime:file.mime,bytes:Uint8Array.from(raw,c=>c.charCodeAt(0))});
 }
 if(!next.has('index.html'))throw Error();return next;
}
async function restoreFiles(session){
 if(files&&loadedId===session.id)return files;
 const stored=await transaction((store,done)=>{
  const request=store.get('payload');request.onsuccess=()=>done(request.result);
 });
 if(stored?.id!==session.id)throw Error();
 const next=await unpack(await BioVault.decryptWithKey(stored.ciphertext,session.key));
 files=next;loadedId=session.id;return next;
}
function serial(work){const result=queue.then(work);queue=result.catch(()=>{});return result;}
function reply(event,value){event.ports[0]?.postMessage(value);}
function inScope(value){try{const url=new URL(value);return url.origin===scope.origin&&url.pathname.startsWith(scope.pathname);}catch{return false;}}
async function notifyLocked(){for(const client of await self.clients.matchAll())if(inScope(client.url))client.postMessage({type:'LOCKED'});}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(!inScope(event.source?.url))return;
 event.waitUntil(serial(async()=>{
  try{
   if(event.data?.type==='STATUS'||event.data?.type==='TOUCH'){
    reply(event,{unlocked:!!await readSession(event.data.type==='TOUCH')});return;
   }
   if(event.data?.type==='LOCK'){await clearSession();await notifyLocked();reply(event,{ok:true});return;}
   if(event.data?.type!=='UNLOCK')return;
   try{
    if(typeof event.data.password!=='string'||event.data.password.length>256)throw Error();
    const response=await fetch(new URL('vault.bin',scope),{cache:'no-store'});
    if(!response.ok)throw Error('教材データを取得できません。通信状況を確認してください。');
    const ciphertext=new Uint8Array(await response.arrayBuffer());
    const opened=await BioVault.openVault(ciphertext,event.data.password);event.data.password='';
    const next=await unpack(opened.bytes),id=crypto.randomUUID();
    await transaction(store=>{
     store.put({version:1,id,key:opened.key,expiresAt:Date.now()+IDLE},'session');
     store.put({id,ciphertext},'payload');
    });
    files=next;loadedId=id;reply(event,{ok:true});
   }catch(error){
    const known=[STORAGE_ERROR,'教材データを取得できません。通信状況を確認してください。'];
    reply(event,{ok:false,error:known.includes(error.message)?error.message:'パスワードが違うか、教材データが更新されています。もう一度お試しください。'});
   }finally{if(event.data)event.data.password='';}
  }catch{reply(event,{ok:false,error:STORAGE_ERROR});}
 }));
});
function lockedResponse(request){
 if(request.mode==='navigate'){const login=new URL(scope);login.searchParams.set('next',request.url);return Response.redirect(login,302);}
 return new Response('教材を開き直してください。',{status:401,headers:{'Cache-Control':'no-store'}});
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==scope.origin||!url.pathname.startsWith(prefix))return;
 event.respondWith(serial(async()=>{
  if(!['GET','HEAD'].includes(event.request.method))return new Response(null,{status:405});
  let session;
  try{
   session=await readSession(true);
   if(!session){await notifyLocked();return lockedResponse(event.request);}
   const current=await restoreFiles(session);
   let path;try{path=decodeURIComponent(url.pathname.slice(prefix.length));}catch{return new Response(null,{status:400});}
   const file=current.get(path||'index.html');if(!file)return new Response('見つかりません。',{status:404});
   let body=file.bytes;
   if(file.mime.startsWith('text/html'))body=new TextEncoder().encode(new TextDecoder().decode(body).replace('</body>',`<script src="${scope.pathname}vault-session.js"></script></body>`));
   return new Response(event.request.method==='HEAD'?null:body,{headers:{'Content-Type':file.mime,'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Robots-Tag':'noindex, nofollow'}});
  }catch{
   if(session)await clearSession(session.id).catch(()=>{});
   await notifyLocked();return lockedResponse(event.request);
  }
 }));
});
