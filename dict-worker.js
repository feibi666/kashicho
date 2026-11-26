/* 词典构建放在 Worker 里做。
   kuromoji 构建 17MB 词典是同步 CPU 密集操作，留在主线程会让浏览器
   弹出「此页面没有响应」——这不是网络慢，是主线程被占死。 */

const DICT_REMOTE = 'https://fastly.jsdelivr.net/gh/feibi666/kashicho@main/dict/';
const DICT_LOCAL  = './dict/';

let tokenizer = null;

function buildWith(dicPath){
  return new Promise((res, rej) => {
    self.kuromoji.builder({ dicPath }).build((err, t) => err ? rej(err) : res(t));
  });
}

async function init(){
  importScripts('./kuromoji.js');
  let dic = DICT_LOCAL;
  try{
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2000);
    const r = await fetch(DICT_REMOTE + 'unk_char.dat.gz', { signal: ctl.signal });
    clearTimeout(timer);
    if(r && r.ok) dic = DICT_REMOTE;
  }catch(e){ /* 主源不通就走本地 */ }
  try{
    tokenizer = await buildWith(dic);
  }catch(e){
    if(dic === DICT_LOCAL) throw e;
    tokenizer = await buildWith(DICT_LOCAL);
  }
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
