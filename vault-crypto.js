(()=>{const ITERATIONS=600000;
const MAGIC=new TextEncoder().encode('BIOVAULT1');
async function encrypt(data,password){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await derive(password,salt);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:MAGIC},key,data));
 const result=new Uint8Array(MAGIC.length+28+encrypted.length);result.set(MAGIC);result.set(salt,9);result.set(iv,25);result.set(encrypted,37);return result;
}
async function derive(password,salt){
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function decrypt(bytes,password){
 if(bytes.length<53||!MAGIC.every((v,i)=>bytes[i]===v))throw Error('教材データの形式が違います。');
 const key=await derive(password,bytes.slice(9,25));
 return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(25,37),additionalData:MAGIC},key,bytes.slice(37)));
}

self.BioVault={decrypt};})();