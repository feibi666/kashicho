/* 词典构建放在 Worker 里做。
   kuromoji 构建 17MB 词典是同步 CPU 密集操作，留在主线程会让浏览器
   弹出「此页面没有响应」——这不是网络慢，是主线程被占死。

   每一步都 postMessage 上报。尤其是下载阶段：17MB 在慢网要一两分钟，
   不报进度主线程就分不清「在下载」和「卡死了」。 */

const DICT_REMOTE = 'https://fastly.jsdelivr.net/gh/feibi666/kashicho@main/dict/';
const DICT_LOCAL  = './dict/';

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
   2. 读完后这些响应进了浏览器 HTTP 缓存（jsdelivr 是 max-age=604800），
      kuromoji 随后用 XHR 请求同一 URL 会直接命中缓存，构建阶段从几十秒降到几秒 */
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

  /* 1. 探活快源 */
  let dic = DICT_LOCAL;
  try{
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(DICT_REMOTE + 'unk_char.dat.gz', { signal: ctl.signal });
    clearTimeout(timer);
    if(r && r.ok) dic = DICT_REMOTE;
    say('probe', '快源 HTTP ' + (r && r.status));
  }catch(e){
    say('probe', '快源不通，用站内词典');
  }

  /* 2. 快源可用就先并发下载，顺带把 HTTP 缓存预热 */
  if(dic === DICT_REMOTE){
    const pf = await preload(DICT_REMOTE);
    if(pf.failed > 0){
      say('downgrade', pf.done + ' 个成功 / ' + pf.failed + ' 个失败，改用站内词典');
      dic = DICT_LOCAL;
    }else{
      say('preloaded', pf.mb.toFixed(1) + 'MB 已备好');
    }
  }

  /* 3. 构建 */
  say('build', dic === DICT_REMOTE ? '快源（已缓存）' : '站内词典');
  try{
    tokenizer = await buildWith(dic);
  }catch(e){
    if(dic === DICT_LOCAL) throw e;
    say('rebuild', '快源构建失败，换站内重试');
    tokenizer = await buildWith(DICT_LOCAL);
  }
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
      /* 只回传主线程真正要用的字段，省结构化克隆开销 */
      const tokens = raw.map(t => ({
        surface_form: t.surface_form,
        reading: t.reading,
        pronunciation: t.pronunciation,
        pos: t.pos
      }));
      self.postMessage({ type: 'tokens', id: d.id, tokens });
    }catch(err){
      self.postMessage({ type: 'error', id: d.id, message: String((err && err.message) || err) });
    }
  }
};
