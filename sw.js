const SHELL = 'kashicho-shell-v21';
const DICT = 'kashicho-dict-v4';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './kuromoji.js', './dict-worker.js'];

/* 词典快源。kuromoji 内部用 path.join 拼地址，会把 https:// 压成 https:/，
   所以它自己不能直接用绝对 URL——只能请求同源的 ./dict/，由这里代理出去。 */
const DICT_CDN = 'https://fastly.jsdelivr.net/gh/feibi666/kashicho@main/dict/';

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

  /* 分词词典：同源 URL 进来，实际内容优先从 jsdelivr 取（快），取不到才回落到
     站点自带的同源副本（慢但一定在）。缓存键用同源 URL，所以只下一次。
     注意 put 必须 await：页面预取完立刻开始构建，缓存没写好就会重复下载 17MB。 */
  if (url.origin === location.origin && /\/dict\/[^/]*\.dat\.gz$/.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(DICT);
      const hit = await c.match(req);
      if (hit) return hit;
      const name = url.pathname.split('/').pop();
      try{
        const r = await fetch(DICT_CDN + name);
        if (r && r.ok){
          await c.put(req, r.clone()).catch(() => {});
          return r;
        }
      }catch (err) {}
      try{
        const r2 = await fetch(req);
        if (r2 && r2.ok) await c.put(req, r2.clone()).catch(() => {});
        return r2;
      }catch (err) {}
      return Response.error();
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
