// sw.js — کش‌کردن اپ برای اجرای کامل آفلاین (بدون نیاز به سرور/CDN)
const CACHE = 'dia-business-v2';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css', './css/print.css',
  './js/app.js', './js/db.js', './js/utils.js', './js/router.js', './js/validators.js',
  './js/views/dashboard.js', './js/views/customers.js', './js/views/customer-detail.js',
  './js/views/products.js', './js/views/services.js', './js/views/projects.js',
  './js/views/invoices.js', './js/views/accounting.js', './js/views/reports.js', './js/views/settings.js',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png', './assets/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => cached || caches.match('./index.html'));
      // اگر نسخه کش‌شده موجود است فوراً همان را بده (سریع و آفلاین-امن)، وگرنه منتظر شبکه بمان
      return cached || network;
    })
  );
});
