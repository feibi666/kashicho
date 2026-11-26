/* 词典构建放在 Worker 里做。
   kuromoji 构建 17MB 词典是同步 CPU 密集操作，留在主线程会让浏览器
   弹出「此页面没有响应」——这不是网络慢，是主线程被占死。
   每一步都 postMessage 上报，主线程据此显示进度，卡住时能立刻看出卡在哪。 */

const DICT_REMOTE = 'https://fastly.jsdelivr.net/gh/feibi666/kashicho@main/dict/';
const DICT_LOCAL  = './dict/';

let tokenizer = null;

const say = (step, detail) => self.postMessage({ type: 'step', step, detail: detail || '' });

function buildWith(dicPath){
  return new Promise((res, rej) => {
    self.kuromoji.builder({ dicPath }).build((err, t) => err ? rej(err) : res(t));
  });
}

/* kuromoji 内部走 XMLHttpRequest，不是 fetch。
   两件事必须分开测：fetch 通不代表 XHR 通（跨域时尤其） */
function xhrProbe(url, ms){
  return Promise.race([
    new Promise(res => {
      try{
        const x = new XMLHttpRequest();
        x.open('GET', url);
        x.responseType = 'arraybuffer';
        x.onload  = () => res('ok:' + x.status + ':' + (x.response ? x.response.byteLength : 0));
        x.onerror = () => res('error');
        x.ontimeout = () => res('timeout');
        x.timeout = ms;
        x.send();
      }catch(e){ res('throw:' + ((e && e.message) || e)); }
    }),
    /* XHR 的 timeout 在某些环境下不生效，外面再套一层硬超时 */
    new Promise(res => setTimeout(() => res('hang'), ms + 1500))
  ]);
}

async function init(){
  say('import');
  importScripts('./kuromoji.js');
  say('imported', 'kuromoji ok');

  /* 1. 先判断快源是否可达（fetch） */
  let dic = DICT_LOCAL;
  try{
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(DICT_REMOTE + 'unk_char.dat.gz', { signal: ctl.signal });
    clearTimeout(timer);
    if(r && r.ok) dic = DICT_REMOTE;
    say('probe-fetch', 'status ' + (r && r.status));
  }catch(e){
    say('probe-fetch', '失败 ' + ((e && e.message) || e));
  }

  /* 2. 关键验证：kuromoji 真正要用的 XHR 能不能完成 */
  const xp = await xhrProbe(dic + 'unk_char.dat.gz', 6000);
  say('probe-xhr', xp);

  /* 快源的 XHR 不可用（挂起/跨域被拒）→ 退回同域，慢但能成 */
  if(!/^ok:200:/.test(xp) && dic === DICT_REMOTE){
    dic = DICT_LOCAL;
    say('downgrade', '快源 XHR 不可用，改用同域词典');
    const xp2 = await xhrProbe(dic + 'unk_char.dat.gz', 6000);
    say('probe-xhr-local', xp2);
    if(!/^ok:200:/.test(xp2)){
      throw new Error('同域 XHR 也不可用（' + xp2 + '），词典无法加载');
    }
  }

  /* 3. 构建 */
  say('build', dic === DICT_REMOTE ? '快源' : '同域');
  try{
    tokenizer = await buildWith(dic);
  }catch(e){
    if(dic === DICT_LOCAL) throw e;
    say('rebuild', '快源构建失败，换同域重试');
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
