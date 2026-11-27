/* 歌詞帳 —— 网易云译文中转（Cloudflare Worker）
 *
 * 为什么需要它：译文只在 /api/song/lyric 里，这个接口既不返 CORS 头、
 * 也不认 callback，GitHub Pages 这样的静态页直接读不到。
 * 这个小中转只做一件事：替你请求那一个接口，并把 CORS 头补上。
 *
 * 部署（2 分钟，不用装任何东西）：
 *   1. 打开 https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. 把本文件内容整个粘进去，Deploy
 *   3. 拿到形如 https://xxx.yyy.workers.dev 的地址
 *   4. 在 proto.html 里把 NET_RELAY 改成：
 *        const NET_RELAY = 'https://xxx.yyy.workers.dev/?url=';
 *   5. 提交推送，手机上带新的 ?v= 打开即可
 *
 * 免费额度：每天 10 万次请求，个人用绰绰有余。
 * 隐私：只转发「歌曲 id」这一条公开信息，不碰账号、不落盘、不留日志。
 */

const ALLOW = /^https:\/\/music\.163\.com\/api\/song\/lyric\?/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const target = new URL(request.url).searchParams.get('url') || '';
    if (!ALLOW.test(target)) {
      return new Response('只放行 music.163.com 的歌词接口', { status: 400, headers: CORS });
    }

    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
        'Referer': 'https://music.163.com/'
      },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
};
