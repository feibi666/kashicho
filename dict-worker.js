/* 词典构建放在 Worker 里做。
   kuromoji 构建 17MB 词典是同步 CPU 密集操作，留在主线程会让浏览器
   弹出「此页面没有响应」——这不是网络慢，是主线程被占死。

   ⚠️ dicPath 必须是相对路径 ./dict/，不能写成 https://...
   kuromoji 内部用 path.join 拼接（kuromoji.js:8197），会把 "https://" 压成 "https:/"，
   浏览器随后按相对路径解析，请求全变成 404。快源由 Service Worker 在 ./dict/ 这层代理。 */

const DICT_PATH = './dict/';

/* kuromoji 要的 12 个词典分片 */
const FILES = [
  'base.dat.gz', 'cc.dat.gz', 'check.dat.gz', 'tid.dat.gz', 'tid_map.dat.gz', 'tid_pos.dat.gz',
  'unk.dat.gz', 'unk_char.dat.gz', 'unk_compat.dat.gz', 'unk_invoke.dat.gz', 'unk_map.dat.gz', 'unk_pos.dat.gz'
];

let tokenizer = null;

const say = (step, detail) => self.postMessage({ type: 'step', step, detail: detail || '' });

function buildWith(dicPath){
  return new Promise((res, rej) => {
    self.kuromoji.builder({ dicPath }).build((err, t) => err ? rej(err) : res(t));
  });
}

/* 先把 12 个分片自己下载一遍：
   1. 能报 MB 进度，主线程的看门狗靠它判断「还在动」
   2. 请求经 Service Worker 代理到快源并写入 Cache Storage，
      kuromoji 随后用 XHR 请求同一 URL 直接命中缓存，构建阶段从几十秒降到几秒 */
async function preload(base){
  let done = 0, bytes = 0, failed = 0;
  const CONC = 4;
  let idx = 0;
  const run = async () => {
    while(idx < FILES.length){
      const f = FILES[idx++];
      try{
        const r = await fetch(base + f);
        if(!r.ok){ failed++; say('download', f + ' 失败 HTTP ' + r.status); continue; }
        const buf = await r.arrayBuffer();
        bytes += buf.byteLength;
        done++;
        say('download', done + '/' + FILES.length + ' · ' + (bytes / 1048576).toFixed(1) + 'MB');
      }catch(e){
        failed++;
        say('download', f + ' 出错 ' + ((e && e.message) || e));
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, run));
  return { done, failed, mb: bytes / 1048576 };
}

async function init(){
  say('import');
  importScripts('./kuromoji.js');
  say('imported', 'kuromoji 已就绪');

  const pf = await preload(DICT_PATH);
  if(pf.done === 0) throw new Error('词典分片一个都没取到，请检查网络后刷新');

  say('build', pf.mb.toFixed(1) + 'MB，开始构建');
  tokenizer = await buildWith(DICT_PATH);
  say('built');
}

self.onmessage = async (e) => {
  const d = e.data || {};

  if(d.type === 'init'){
    try{
      await init();
      self.postMessage({ type: 'ready' });
    }catch(err){
      self.postMessage({ type: 'fatal', message: String((err && err.message) || err) });
    }
    return;
  }

  if(d.type === 'tokenize'){
    try{
      if(!tokenizer) throw new Error('词典还没准备好');
      const raw = tokenizer.tokenize(d.text) || [];
      /* 只回传主线程真正要用的字段，省结构化克隆开销。
         basic_form 是字典形（立ち尽くし → 立ち尽くす），释义按它挂，
         这样一个词条能覆盖这首歌里它的所有活用形 */
      const tokens = raw.map(t => ({
        surface_form: t.surface_form,
        reading: t.reading,
        pronunciation: t.pronunciation,
        pos: t.pos,
        basic_form: t.basic_form,
        conjugated_form: t.conjugated_form
      }));
      self.postMessage({ type: 'tokens', id: d.id, tokens });
    }catch(err){
      self.postMessage({ type: 'error', id: d.id, message: String((err && err.message) || err) });
    }
  }
};
