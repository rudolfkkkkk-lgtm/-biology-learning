'use strict';
(()=>{const script=document.currentScript,base=new URL('./',script.src);let leaving=false;
 function returnToLogin(){if(leaving)return;leaving=true;const url=new URL(base);url.searchParams.set('next',location.href);location.replace(url.href);}
 navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='LOCKED')returnToLogin();});
 const bar=document.createElement('div');bar.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:8px 20px;background:#e8eddc;font:12px Meiryo,sans-serif;color:#243c32;gap:15px';
 const text=document.createElement('span');text.textContent='生徒用教材';const lock=document.createElement('button');lock.textContent='教材を閉じる';lock.type='button';lock.style.cssText='font:inherit;padding:4px 12px;background:white;color:#244e40;border:1px solid #acbaa5;border-radius:4px;cursor:pointer';
 lock.onclick=()=>{const worker=navigator.serviceWorker.controller;if(worker)worker.postMessage({type:'LOCK'});else returnToLogin();};bar.append(text,lock);document.body.prepend(bar);
 function check(){if(document.hidden)return;const worker=navigator.serviceWorker.controller;if(!worker){returnToLogin();return;}const channel=new MessageChannel();channel.port1.onmessage=e=>{channel.port1.close();if(!e.data.unlocked)returnToLogin();};worker.postMessage({type:'STATUS'},[channel.port2]);}
 addEventListener('pageshow',check);document.addEventListener('visibilitychange',check);setInterval(check,30000);
 let lastTouch=0;function touch(){if(Date.now()-lastTouch<15000)return;lastTouch=Date.now();navigator.serviceWorker.controller?.postMessage({type:'TOUCH'});}
 for(const event of ['pointerdown','keydown','scroll'])addEventListener(event,touch,{passive:true});
})();
