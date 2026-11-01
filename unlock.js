'use strict';
const base=new URL('./',location.href),form=document.querySelector('#unlockForm'),button=document.querySelector('#open'),status=document.querySelector('#status'),input=document.querySelector('#password');
let worker;
function call(type,data={}){return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('処理が完了しませんでした。ページを再読み込みしてください。')),90000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};worker.postMessage({type,...data},[channel.port2]);});}
function destination(){const fallback=new URL('_content/index.html#home',base);try{const url=new URL(new URL(location.href).searchParams.get('next')||fallback.href,base);return url.origin===base.origin&&url.pathname.startsWith(base.pathname+'_content/')?url.href:fallback.href;}catch{return fallback.href;}}
(async()=>{try{
 if(!isSecureContext||!navigator.serviceWorker||!crypto.subtle||!window.DecompressionStream)throw Error('このブラウザーでは教材を開けません。最新版のChrome・Edge・Safariをお使いください。HTTPSで開く必要があります。');
 await navigator.serviceWorker.register(new URL('vault-sw.js',base),{scope:base.pathname,updateViaCache:'none'});
 const registration=await navigator.serviceWorker.ready;worker=registration.active;
 const result=await call('STATUS');if(result.unlocked){location.replace(destination());return;}
 status.textContent='';button.disabled=false;
 }catch(e){status.textContent=e.message;}
})();
form.addEventListener('submit',async e=>{e.preventDefault();if(!worker)return;button.disabled=true;status.textContent='教材を開いています…';let password=input.value;input.value='';try{const result=await call('UNLOCK',{password});password='';if(!result.ok)throw Error(result.error||'パスワードが違います。もう一度入力してください。');location.replace(destination());}catch(e){password='';status.textContent=e.message;button.disabled=false;input.focus();}});
