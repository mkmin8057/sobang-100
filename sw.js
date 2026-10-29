// 오프라인 우선: 앱 파일은 캐시에서 즉시, 백그라운드로 갱신 (다음 실행 때 반영)
const VER='4c7ba04f';
const CACHE='sobang100-'+VER;
const CORE=['./','index.html','style.css','app.js','data.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('sobang100-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(req,{ignoreSearch:true});
    const net=fetch(req).then(r=>{ if(r&&(r.ok||r.type==='opaque'))c.put(req,r.clone()); return r }).catch(()=>hit);
    return hit||net;
  }));
});
