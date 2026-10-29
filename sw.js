// 오프라인 우선: 앱 파일은 캐시에서 즉시, 백그라운드로 갱신 (다음 실행 때 반영)
const VER='22845567';
const CACHE='sobang100-'+VER;
const CORE=['./','index.html','style.css','app.js','data.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE.map(u=>new Request(u,{cache:'no-cache'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('sobang100-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(req,{ignoreSearch:true});
    // GitHub Pages의 10분 HTTP 캐시를 건너뛰고 서버에 재검증(ETag)
    const same=new URL(req.url).origin===location.origin;
    const net=(same?fetch(req.url,{cache:'no-cache'}):fetch(req)).then(r=>{ if(r&&(r.ok||r.type==='opaque'))c.put(req,r.clone()); return r }).catch(()=>hit);
    return hit||net;
  }));
});
