/* Offline-Unterstützung: App-Dateien zwischenspeichern. Daten von OneDrive werden nie zwischengespeichert. */
const CACHE="notizbuch-v2-7";
const FILES=["./","index.html","app.css","config.js","js/db.js","js/onedrive.js","js/app.js","vendor/msal-browser.min.js","vendor/qrcode.js","js/calc.js","js/calendar.js","manifest.webmanifest","icons/icon.svg","icons/icon-192.png","icons/icon-512.png","icons/icon-180.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=="GET"||url.origin!==location.origin)return;
  // Netz zuerst (damit Updates sofort ankommen), bei Offline aus dem Zwischenspeicher
  // "no-cache": GitHub Pages lässt Browser Dateien 10 Minuten zwischenspeichern; so kommt jede neue Version sofort an
  e.respondWith(fetch(url.href,{cache:"no-cache",credentials:"same-origin"}).then(r=>{const copy=r.clone();if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,copy));return r;})
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match("index.html"))));
});
