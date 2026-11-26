const SHELL = 'kashicho-shell-v12';
const DICT = 'kashicho-dict-v3';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './kuromoji.js', './dict-worker.js'];

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
      keys.filter(k => (k.startsWith('kashicho-shell-') && k !== SHELL) ||
                       (k.startsWith('kashicho-dict-') && k !== DICT))
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 同域的分词词典（./dict/*.dat.gz）：纯缓存优先，词典不会变，下完就长期复用
  // 跨域的那份（jsdelivr）刻意不拦：它自带 max-age=604800，浏览器 HTTP 缓存足够，
  // 多一层 SW 转发只会增加「请求挂住」的风险
  if (url.origin === location.origin && /\.dat\.gz$/.test(url.pathname)) {
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
