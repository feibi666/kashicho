const SHELL = 'kashicho-shell-v24';
const DICT = 'kashicho-dict-v4';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './kuromoji.js', './dict-worker.js'];

/* 词典快源。kuromoji 内部用 path.join 拼地址，会把 https:// 压成 https:/，
   所以它自己不能直接用绝对 URL——只能请求同源的 ./dict/，由这里代理出去。 */
const DICT_CDN = 'https://fastly.jsdelivr.net/gh/feibi666/kashicho@main/dict/';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    /* 不能用 addAll：它走普通 fetch，会命中 GitHub Pages 给 HTML 的 600s HTTP 缓存，
       install 抓到的可能还是上一版内容，于是「缓存里永远是旧的」自我延续。
       逐个 cache:'reload' 强制回源。单个失败不影响其它资源（旧的 addAll 是全军覆没） */
    const c = await caches.open(SHELL);
    await Promise.all(ASSETS.map(async (u) => {
      try{
        const r = await fetch(u, { cache: 'reload' });
        if(r && r.ok) await c.put(u, r);
      }catch(err){}
    }));
  })());
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

  /* 页面本身（导航、刷新、从主屏图标打开）一律**网络优先**。
     早先是缓存优先「命中就返回、新内容只写进缓存下次再说」，而 './' 和 './index.html'
     又都在 ASSETS 里被 precache 了 —— 结果正式版 HTML 被锁死在缓存里，改完代码要
     bump SHELL 才可能更新；而 bump 后的 sw.js 自己又受 GitHub Pages 的 600s HTTP
     缓存限制，用户连划七八次窗口都还看到旧版（proto.html 不在 ASSETS 里，所以
     原型页一直正常，这更让人误判成「正式版代码不对」）。
     现在：在线永远拿最新 HTML，断网才回落到缓存，离线能力不受影响 */
  const isHtml = req.mode === 'navigate' ||
                 url.pathname.endsWith('/') ||
                 /\.html$/.test(url.pathname);
  if(isHtml){
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      try{
        const r = await fetch(req, { cache: 'reload' });
        if(r && r.ok) c.put(req, r.clone()).catch(() => {});
        return r;
      }catch(err){
        const hit = await c.match(req, { ignoreSearch: true }) || await c.match('./index.html');
        return hit || Response.error();
      }
    })());
    return;
  }

  // 其它自身资源（kuromoji.js、图标）：缓存优先 + 后台更新，体积大、几乎不变
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
