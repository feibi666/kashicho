const SHELL = 'kashicho-shell-v7';
const DICT = 'kashicho-dict-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL).then(c => c.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('kashicho-shell-') && k !== SHELL).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 分词词典：缓存优先，一次下完长期复用
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith((async () => {
      const c = await caches.open(DICT);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        return hit || Response.error();
      }
    })());
    return;
  }

  // 自身资源：缓存优先 + 后台更新
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req);
      const net = fetch(req)
        .then(r => { if (r && r.ok) c.put(req, r.clone()); return r; })
        .catch(() => hit);
      return hit || net;
    })());
  }
});
