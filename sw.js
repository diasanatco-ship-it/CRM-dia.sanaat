const CACHE='dia-business-v1';
const ASSETS=[
 './','./index.html','./manifest.json','./css/style.css','./css/print.css',
 './js/app.js','./js/db.js','./js/utils.js','./js/router.js',
 './js/views/dashboard.js','./js/views/customers.js','./js/views/products.js',
 './js/views/services.js','./js/views/projects.js','./js/views/invoices.js',
 './js/views/accounting.js','./js/views/reports.js','./js/views/settings.js'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{
    const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return r;
  }).catch(()=>caches.match('./index.html'))));
});
