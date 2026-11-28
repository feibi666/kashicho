# 歌詞帳（kashicho）交接文档

> **新对话开场白**（复制这一句即可）：
> `读 G:\WorkBuddy work\2026-11-26-19-46-28\kashicho\HANDOVER.md，继续维护 kashicho`
>
> 最后更新：2026-11-28 晚 · 对应提交 `c35cd33` · 线上 `SHELL v21` / `DICT v4` / Worker `?v=13`
>
> ⚠️ 这次改动**只在 `proto.html`**，`index.html` 还是 `26d4287` 的行为，等真机验证通过再同步（见 §6.1）。

---

## 0. 三十秒上手

| 项 | 值 |
|---|---|
| 线上地址 | `https://feibi666.github.io/kashicho/`（手机主屏图标点开即是） |
| 原型地址 | 同上换 `proto.html`，加 `?demo` 可无音频看排版 |
| 仓库 | `https://github.com/feibi666/kashicho`（public，Pages 免费版必须公开） |
| 本地目录 | `G:\WorkBuddy work\2026-11-26-19-46-28\kashicho\` |
| 当前 HEAD | `f651943`（`SHELL v17`，改动在 proto，正式版待同步） |
| 改完发版 | 升 `SHELL` → 语法自检 → push（挂 Clash）→ 等 1 分钟 → 抓线上核对 |

用户是唯一的真实用户，真机是安卓 Chrome。**助手改不了的部分**：文件夹授权、锁屏表现、后台保活，这些只能用户自己测。

---

## 1. 这是什么

手机上学日语歌用的注音歌词本 + 本地播放器。授权手机上的音乐文件夹 → 播歌同时给歌词汉字标假名 → 点句子看中文 → 单句循环慢速跟唱。音频和标注全部留在本机，不上传。

### 已定的产品约束（用户明确要求，别擅自改）

- **不出现罗马音**，**只给汉字标假名，假名原样不标**（用户 2026-11-28 明确要求）：
  `咲く` → `咲[さ]く`、`立ち尽くす` → `立[た]ち尽[つ]くす`、`売り場` → `売[う]り場[ば]`。
  连着的一串汉字整体标（`大人`→`大人[おとな]`、`日本語`→`日本語[にほんご]`）。
  读音对不齐时退回整词标一个 ruby，宁可粗也不标错
- **释义按整词算**（用户 2026-11-28 强调）：`立ち尽くす` 是一个整体，释义范围必须包住
  整个词（含假名），不能只框汉字。范围用棕色点线下划线标出，释义小字贴在该范围正下方居中。
  `.hg` 是那个范围容器，别把它的边界缩到汉字上
- **释义挂「字典形」，不挂原文**（用户 2026-11-28 定）：`立ち尽くし/立ち尽くした/立ち尽くして`
  全部指回 `立ち尽くす`，标一次全歌生效。渲染时把活用尾巴（助动词、て/で）并进同一个 `.hg`，
  让「立ち尽くした」整块带下划线而不是被切成两截。这是用户明确要的行为，别改回按 surface 存
- 必须用 **Chrome / Edge 安卓 132+**（`showDirectoryPicker` 需要；VIA 等 WebView 壳不支持 PWA、不支持后台播放）
- 点句子展开单句译文；「译」是一键全展开，位置在工具行**最左**（用户要求排在「音」左边）
- 播放位置只在「杀进程重开」时续接；点歌单、点列表、恢复上次那首**一律从头播**
- 播放模式四档：顺序 → 列表循环 → 单曲循环 → 随机（洗牌，不是每次 random）
- 切歌不弹歌词面板，直接播
- **不做跨设备同步**（用户 2026-11-27 明确取消，包括「JSON 按文件名对齐」那套方案一并作废）。替代品是本机的备份/恢复
- 当前句默认自动居中；手指一滑停止跟随，右下角浮出「回到当前句」

---

## 2. 文件清单

| 文件 | 作用 | 能改吗 |
|---|---|---|
| `index.html` | 全部逻辑，2568 行（CSS + HTML + 内联脚本约 2185 行），无框架无构建 | **主要改这个** |
| `proto.html` | 开发副本，比正式版多一条环境自检条 | 改这个做实验 |
| `dict-worker.js` | Web Worker：预取词典 + 构建分词器 | 可改，改完要 bump `?v=` |
| `kuromoji.js` | 分词引擎（307KB，kuromoji 0.1.2 browserify 产物） | **别改** |
| `dict/*.dat.gz` | IPADIC 词典，12 个分片共 17MB | 别动 |
| `sw.js` | Service Worker：离线缓存 + 词典快源代理 | 要改时必须升版本号 |
| `manifest.json` / `icon-192/512.png` | PWA 安装配置 | 可改 |
| `README.md` | 仓库门面（用户视角的功能介绍） | 可改 |
| `.nojekyll` | 跳过 Jekyll | 不用管 |

---

## 3. 功能与代码入口对照

用户说的「按钮」和代码里的东西对不上时查这张表。

| 用户看到的 | 元素 / 入口 | 代码里 |
|---|---|---|
| 选择音乐文件夹 | `#pickDir` | `pickDir()`，走 `showDirectoryPicker`；不支持则置灰 + 亮出「临时选几首歌」 |
| 点行首三角 = 从这句播 | `.lrow .tri` | `seekToLine(i)` |
| 点句子 = 展开译文 | `.lrow` | `toggleLine()` |
| **双击句子** = 查词面板 | `.lrow` dblclick | `openWords(i)` → `setWsMode('copy'/'read'/'gloss')` |
| 译 | `#btnTr` | 全展开开关，持久化到 `allTr` |
| 音 | `#btnDic` | 批量读音表（一行一条 `宇宙 そら`）→ `applyDict()` |
| 词 | `#btnLyric` | 贴歌词 / 重贴 |
| 轴 | `#btnNet` | 贴网易云链接或 ID → `applyNet()` |
| 1× | `#btnRate` | 1× ⇄ 0.75×，`au.playbackRate` |
| 单句 | `#btnLoop` | `loopCheck()`，用 `timeupdate` 兜住后台 |
| 打点 | `#btnTiming` | `setTiming(true)`，`TAP_LAG = 0.18` |
| 循环 ▾ | `#btnMode` | `setMode()`：顺序/列表/单曲/随机 |
| 备份 / 恢复 | `#btnExport` / `#btnImport` | `buildBackup()` / `applyImport()` |
| 进度条右侧 `n/N` | `#qBtn` | 队列抽屉 `#qSheet` |
| 回到当前句 | `#fab` | `centerCur()`，`follow` 标志 |
| 锁屏 / 通知栏 | — | `msBind()` / `msSetMetadata()` / `msSetPos()` / `msSetState()` |

---

## 4. 数据结构（IndexedDB，库名 `kashicho`）

| 键 | 结构 | 说明 |
|---|---|---|
| `dir` | `FileSystemDirectoryHandle` | 音乐文件夹句柄。**不能序列化、不能导出**，权限也不跨会话，每次重开要点一次「允许」 |
| `last` | `{ name }` | 上次播的那首 |
| `mode` | `string` | 播放模式 |
| `allTr` | `boolean` | 全部译文是否展开 |
| `gloss` | `{ 字典形: 释义 }` | 生词释义，**全局跨歌**（释义不随歌变）。key 是 `basic_form`（立ち尽くす），不是原文（立ち尽くし） |
| `lyr:<歌名>` | 见下 | 每首歌一份歌词记录 |
| `pos:<歌名>` | `number` | 播放秒数，< 3 秒视为没有 |
| `read_legacy` | `{ 词形: 假名 }` | 旧版全局读音，**已作废**，只留档 |

`lyr:<歌名>` 的结构：

```js
{
  raw:     '原始粘贴文本',
  entries: [{ t, jp, zh }],   // 时间轴 + 日文 + 中文
  hasTs:   true,              // 带不带时间轴
  manual:  { 行号: 秒 },       // 人工打点，优先于 entries.t
  dict:    '自定义读音表原文',
  read:    { 词形: 假名 },     // 本歌人工读音，优先级最高
  net:     '网易云原始 lrc',
  netTl:   [译文行],           // 数组，重贴歌词时靠它重补
  autoT:   [自动对轴结果]
}
```

**读音优先级**：`rec.read`（人工，按歌）> 歌词自带 `宇宙(そら)` > `dict` 逐句表 > 分词器 / 词典。

> ⚠️ 注音按歌存、不按词形全局存，是因为多音词在不同歌里读音不同（`咲く` 有的唱 さく、有的唱 えむ）。释义反过来，按词形全局存。

---

## 5. ⚠️ 硬性技术约束（改了就会坏）

### 5.1 词典路径只能是相对路径 `./dict/`

`kuromoji.js:8197` 用 `path.join(dic_path, filename)` 拼地址，浏览器里的 `path-compat` 会**把双斜杠压成单斜杠**：

```
https://fastly.jsdelivr.net/gh/...  →  https:/fastly.jsdelivr.net/gh/...
```

浏览器随即把 `https:/...` 当相对路径拼到站点域名后面 → 12 个分片全 404 → 构建永远不返回，表现为「无声无息卡死」。

**结论：dicPath 永远传 `./dict/`，绝对 URL 由 Service Worker 在这一层代理出去。**

### 5.2 快源由 SW 代理，页面里不许出现 jsdelivr 地址

`sw.js` 的 `DICT_CDN` 是唯一出现 jsdelivr 的地方。它拦截同源 `./dict/*.dat.gz`：查 `kashicho-dict-v4` 缓存 → 未命中取 jsdelivr（实测 3.9 MB/s）→ 失败退回站点自带同源副本（40 KB/s，慢但一定在）。`cache.put` 必须 `await`，否则预取完立刻构建会重复下 17MB。

### 5.3 词典构建必须在 Worker 里

17MB 在主线程构建会阻塞十几秒，浏览器弹「此页面没有响应」。主线程保留 75 秒看门狗兜底：超时就终止 Worker、改主线程构建（会卡，但保证出结果）。

### 5.4 所有静态资源 URL 必须带版本参数

SW 是**缓存优先**。`new Worker('./dict-worker.js?v=13')` 不带参数的话，改了 Worker 代码浏览器永远返回旧文件，且**毫无报错**——表现为「Worker 什么都不做」。**每次改 Worker 必须把数字加一。**

### 5.5 `sw.js` 的两个版本号

```js
const SHELL = 'kashicho-shell-v16';   // 改 index.html / sw.js / 任何 shell 资源时升
const DICT  = 'kashicho-dict-v4';     // 只在要强制重下词典时升（升了会重下 17MB）
```

不升 `SHELL`，手机上看到的永远是旧页面。SW 对**所有同源 GET** 缓存优先，`proto.html` 也在内。

### 5.6 ruby 的 `rt` 里放不下两行

想在词上方同时显示「释义 + 假名」时，`<rt>` 里塞 `<br>` 或给子元素 `display:block` **都无效**——rt 内容被强制排成一行，实测变「风かぜ」并排。只能：

- 上方假名 → 原生 `<ruby><rt>`
- 下方释义 → 外层 `<span class="hg" data-g="…">` + `::before` 绝对定位（`top:calc(100% + .16em)`）

伪元素不进选区，正好不会被复制带进剪贴板。代价是绝对定位不占流，含释义的行必须手动加 `line-height`（现用 2.62），否则盖住下一行。

另外 `<rt>` 是正文兄弟节点，会进剪贴板 → 必须 `user-select:none;pointer-events:none`。

### 5.6.1 包着 ruby 的 `.hg` 不能上 `border-bottom`

给 `.hg` 直接写 `border-bottom` 画范围线（v19 的做法）在真机上会出两条线：`.hg` 是 inline，里面是 `ruby`，inline 盒被拆成多个行框片段，**每个片段各画一条 border**，其中一条正好压在下方释义字上。v19 的 1px 半透明虚线还叠加了「太淡看不见」的问题，用户反馈「下划线没实现」。

现做法：`::after` 绝对定位单独画一条 + `bottom:-.12em`（v20）：

```css
.line .hg::after{content:"";position:absolute;left:-.04em;right:-.04em;bottom:-.12em;
  border-bottom:2px dotted rgba(158,72,30,.92);pointer-events:none}
.line .hg::before{top:calc(100% + .3em)}   /* 释义再让开，别和线挤在一起 */
```

线条可见度按**手机 1 倍像素密度**验收，不能只看 2 倍缩放的无头截图——1px 半透明在 2 倍图里「勉强有」，到手机上就是没有。

### 5.6.2 释义为什么挂在「字典形」上，而不是歌词原文

用户报「立ち尽くした被拆成立ち尽くし和た，不符合语法」。**分词并没有错**：kuromoji（IPADIC）按语法把过去助动词「た」切成独立词元，本来就是这样。错的是我们拿 `surface_form` 当释义 key——于是每个活用形都成了一个互不认识的"新词"。

kuromoji 其实给了答案，只是 worker 早期把它过滤掉了：

```
立ち尽くし   pos=動詞/自立  conj=五段・サ行/連用形  basic=立ち尽くす  read=タチツクシ
た          pos=助動詞     conj=特殊・タ/基本形      basic=た
```

所以现在的规则：

1. `dict-worker.js` 回传 `basic_form`、`conjugated_form`
2. `GLOSS` 的 key 用 `basic_form`；`glossOf()` 里保留 `GLOSS[surface]` 回退，兼容早期按原文存的数据
3. `annotatePlain()` 命中释义后，用 `isTail()` 把紧跟的尾巴并进同一个 `.hg`：**助动词 + 接续助词（て/で/ながら/たら/ても/ば）**，最多并 2 个
4. 读音拼接后交给 `rubyHtml`，`立ち尽くし(タチツクシ) + た(タ)` → `立[た]ち尽[つ]くした`

**尾巴白名单是刻意的保守选择**（用户拍板）：
- 格助词（を/が/に/へ/と）**不吃**，否则「君の」会被并成一块
- 非自立动词（いる/しまう/おく）**不吃**，「見上げている」只框到「見上げて」——`〜ている` 是语法（进行体），属于另一层，不该塞进词义

查词卡片上，原文和字典形不同形时补一行灰色小字 `＝立ち尽くす`（`.wchip .wl`），否则用户会以为标错了词。

⚠️ `mergeTokens` 的例外表（`DICT`）救不了这事：它要求连续 token 拼起来**完全等于**表里的词，歌里写「立ち尽くした」，拼不出「立ち尽くす」，永远不命中。

### 5.7 歌词容器的平滑滚动只在 JS 里指定

`.lyrics` **不能**加 CSS `scroll-behavior:smooth`。加了以后连 `scrollTop = 0` 都变成动画，切歌回顶会触发一连串 scroll 事件，把「程序滚动」和「用户滑动」搅在一起（详见 §7 第一条）。平滑只在 `centerCur()` 里显式传 `behavior:'smooth'`。

### 5.8 MediaSession 的 `playbackState` 只有三态，`none` 是「销毁」

`'none'` 的含义是**「这一页现在没有媒体」**，Chrome 收到就立刻撤卡。切歌时写 `'none'` 会导致每换一首卡片消失一次（ncm 还要先解密几秒，空窗更久）。表示「有媒体但没在走」要用 `'paused'`。

---

## 6. 发版流程（固定）

1. 改代码
2. 动了 `dict-worker.js` → `index.html` 里的 `?v=N` 加一
3. 动了 `index.html` / `sw.js` → `sw.js` 的 `SHELL` 加一
4. 语法自检（内联脚本要先抽出来）：
   ```powershell
   $p="index.html"; $lines=Get-Content $p -Encoding UTF8
   $s=($lines|Select-String '^<script>$'|Select-Object -Last 1).LineNumber
   $e=($lines|Select-String '^</script>$'|Select-Object -Last 1).LineNumber
   $js=$lines[$s..($e-2)] -join "`n"
   [System.IO.File]::WriteAllText("$env:TEMP\kc.js",$js,(New-Object System.Text.UTF8Encoding($false)))
   node --check "$env:TEMP\kc.js"
   ```
5. 提交（message 用英文，中文会乱码）
6. push **必须挂 Clash**：
   ```
   git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main
   ```
7. 等 50–60 秒，抓线上核对。**用 ASCII 标记匹配**（`msSetState('paused')`、`kashicho-shell-v16`），别用中文，PowerShell 会乱码
8. 告诉用户：把主屏图标那个窗口**整个划掉再打开**（或杀掉 Chrome），可能要两次才换到新版

### 6.1 原型 → 正式版同步

业务代码必须**逐字一致**，唯一允许的差异是 envbar。

```powershell
Copy-Item proto.html index.html -Force
```

然后补回三处：① `<title>歌詞帳 · 原型</title>` → `<title>歌詞帳</title>`；② 删 `#envbar` 那段 CSS（8 行）；③ 删 `<div id="envbar">` 并把 `renderEnv()` 换成只判断 `!env.hasDir` 的版本（照 `675b9ef` 抄）。

验收：`git diff --no-index --stat proto.html index.html` 应约 8 insertions / 38 deletions。最后 bump `SHELL`。

### 6.2 两个 PowerShell 假失败

- `git push` 把进度写 stderr，PS 5.1 当 `NativeCommandError`，红字 + 退出码 1，但**实际成功**。以 `git ls-remote --heads origin main` 的 hash 为准
- 同理 `Get-Content` 输出中文会乱码，核对线上用 ASCII 特征串

---

## 7. 已知坑（别再重复调查）

| 现象 | 真因 |
|---|---|
| 组合词里的假名也被标音（`立ち尽く` 整体标 `たちつく`） | 旧 `rubyWrap` 只剥首尾送假名，汉字之间夹的假名跟着整词进了 ruby。`493d00c` 改为按汉字段切读音、拿假名当锚点，对不齐退回整词标 |
| 新歌一开居中就失效：高亮一路往下、跑出屏幕，得手动点「回到当前句」 | 旧判定「距上次程序滚动 >700ms 即用户滑动」，但切歌回顶本身就是平滑动画、时间戳还停在上一次，第一个 scroll 事件就把 `follow` 关了。`f651943` 改为 `progScrolling` 标志 + `scrollend` 收尾，回顶走 `jumpTop()` 也挡一下 |
| 听歌两三分钟屏幕自己黑 | 纯音频不会阻止息屏（只有视频会）。`f651943` 加了 Screen Wake Lock：播放申请、暂停释放、回前台重取 |
| 卡在「正在准备注音词典」 | 词典从 jsdelivr 直连 17MB 下不完（早期）；现为本地 + SW 代理 |
| 「此页面没有响应」 | 主线程构建 17MB 词典，已移入 Worker |
| Worker 一个日志都不报，45 秒判卡死 | SW 吐了旧版 Worker 脚本，URL 没版本参数 |
| 12 个 `GET dict/*.dat.gz 404`，地址里站点域名后跟着 `fastly.jsdelivr.net` | kuromoji 的 `path.join` 压斜杠（§5.1） |
| `rubyWrap` 给纯假名注音（`する[する]`） | 已加汉字检查 |
| 切歌过早 `revokeObjectURL` 导致新歌无声 | 已改为延迟 5 秒回收 |
| `一人` 被拆成 `一(いち)人(にん)` | 读音例外表 + 词元合并 |
| 首屏 `await DB.get('dict')` 卡死 | 改后台加载 + 2.5s 超时 |
| 无头浏览器里 Worker 永远不返回 | virtual-time 不推进 Worker 的网络请求，**不是 bug**，别用它验证 Worker |
| 无头量窄屏尺寸不准 | `--window-size` 受 DPI 影响且最小约 500px，实测 `clientWidth` 跑到 754，截出来是**裁切**不是溢出。可靠做法：外层页放 `<iframe width=390>` |
| 拿不到 `lines` / `wsIdx` | 顶层 `let` 不挂 `window`，`iframe.contentWindow.lines` 是 undefined。要在 iframe 里**注入 script** 才同 realm |
| 人工注音按词形全局存 → 换歌读音串 | 已改存 `rec.read`，按歌隔离（§4） |
| 查词面板开着切歌，接着点词写到新歌上 | `openSong()` 里清 `wsIdx`/`wsPick` 并关面板 |
| 改了页面但手机还是旧版 | SW 缓存优先，不 bump `SHELL` 永远是旧版（§5.5） |
| 勾「同时套用到其他歌」有的歌没变 | 按设计：只写进「歌词里确实出现该词形」的歌，且已有不同读音的不覆盖 |
| 锁屏 / 通知栏没有媒体卡片 | 代码要齐：`metadata`（artwork 必须**绝对 URL**）、`prev/nexttrack`、`setPositionState`、`playbackState`。齐了还没有 → 查系统（§9） |
| 卡片出来一会儿又消失 | ① 切歌设了 `playbackState='none'`（主动撤卡）；② 系统「固定媒体播放器」没开；③ Chrome 电池是「优化」，锁屏后后台被冻结 |

---

## 8. 验证手段

### 8.1 本地跑

```powershell
cd "G:\WorkBuddy work\2026-11-26-19-46-28\kashicho"
python -m http.server 8765 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8765/?demo`。`file://` 不行——Service Worker 要求 http。

### 8.2 原型专用调试入口

- `?demo`：无音频看排版
- `?demo&noengine`：不走分词引擎，注音写死（无头环境 Worker 起不来时用）
- `&w390`：把播放页套进 390px 的框，桌面上看真机换行

### 8.3 无头验证（只适合主线程路径）

```powershell
msedge --headless=new --disable-gpu --no-sandbox --virtual-time-budget=150000 `
  --user-data-dir=$env:TEMP\kc-test --dump-dom "http://127.0.0.1:8765/?demo&v=x"
```

更靠谱的方式是用 CDP 直连（Node 22 自带 `WebSocket`）：起 Edge 带 `--remote-debugging-port`，`Runtime.enable` 挂 `exceptionThrown` 收 JS 异常，`Runtime.evaluate` 读状态。这套跑过多次，比 `--dump-dom` 能看到真错误。

### 8.4 只能用户自己验的

文件夹授权、锁屏 / 通知栏表现、后台续播、单句循环接缝、重开续接位置。

---

## 9. 媒体通知：代码做完了，剩下的在系统侧

安卓的媒体卡片由 Chrome 生成，依据两件事：**audio 真的在出声**、**mediaSession 上有东西**。代码侧已齐（`msBind()` 一带）：

- `metadata`：`title` / `artist` / `album` / `artwork`（**绝对 URL**，`new URL('.', location.href)` 拼）
- action handlers：`play` / `pause` / `stop` / `previoustrack` / `nexttrack` / `seekbackward` / `seekforward` / `seekto`
- `setPositionState`：`updProgress()` 里节流 1 秒
- `playbackState`：`play`→`playing`、`pause`→`paused`、切歌→`paused`（**不是 `none`**）
- 后台保活：2 秒 `setInterval`，`document.hidden && !au.paused` 时顶回 `playing` 并同步位置（rAF 进后台会停摆）
- 回到前台重设一遍 `metadata` + 状态 + 位置

**用户必须自己开的四项**：

| 设置 | 位置 | 为什么 |
|---|---|---|
| 固定媒体播放器（Pin media player） | 设置 → 声音与振动 → 媒体 | 关着时一暂停系统就收走控件 |
| 电池 → 无限制 | 设置 → 应用 → Chrome → 电池 | 默认「优化」会在锁屏后冻结后台标签页 |
| 通知权限 + 锁屏显示通知 | 设置 → 应用 → Chrome → 通知 | 被禁则卡片不出现 |
| 自启动 / 锁定后台 | 国产 ROM 的额外项 | 防进程回收 |

**平台天花板**：PWA 没有前台服务（Foreground Service），做不到原生音乐 App 那种绝对常驻。四项都开了仍偶尔掉属能力边界，彻底解决只能 Capacitor 加壳 + 原生前台服务。

### 9.1 屏幕常亮（`f651943` 起，仅 proto）

纯音频播放**不会**阻止系统息屏（只有视频会），所以看歌词看到两三分钟屏就黑了。`wakeAcquire()` / `wakeRelease()` 用 Screen Wake Lock 兜住：

- `play` → 申请 `navigator.wakeLock.request('screen')`；`pause` → 释放
- 页面被切后台时浏览器会**自动释放**锁（规范行为），回前台且仍在播时重取一次
- 申请失败（省电模式、电量过低、不支持）静默降级，不影响播放
- ⚠️ 挡不住用户按电源键主动锁屏；锁屏后继续听靠的是上面的媒体会话 + 系统四项设置

---

## 10. 网易云 `.ncm` 解码器

用户的歌来自手机网易云直下，路径 `/storage/emulated/0/Download/netease/cloudmusic/Music/`，文件名形如 `大原ゆい子-旅人の唄.ncm`。公共 Download 目录 Chrome 的目录选择器够得着（`Android/data/` 里的够不着）。

**格式依据**：`taurusxin/ncmdump` v1.5.1 的 `src/ncmcrypt.cpp` + `src/utils/aes.cpp`。**不要凭记忆改，任何字段都回去对源码。**

结构：

1. 头 8 字节 magic `CTENFDAM`，再跳 2 字节
2. u32 LE 密钥长度 → 密钥区每字节 `^0x64` → AES-128-ECB 解密（key `hzHRAmso5kInbaxW`），去 PKCS7
3. 明文前 17 字节是 `neteasecloudmusic`，**从第 17 字节起**才是 RC4 初始 key
4. u32 LE 元数据长度 → 每字节 `^0x63` → 去掉前 22 字节（`163 key(Don't modify):`）→ base64 → AES-128-ECB（key `#14ljk_!\]&0U<('`）→ 去掉前 6 字节（`music:`）→ JSON
5. 跳 5 字节（CRC32 4 + 版本 1）→ u32 封面帧长 → u32 封面长 → 封面数据 → 跳到 `封面起点 + 封面帧长`
6. 剩下全是音频，逐字节 XOR

两个实现要点：

- Web Crypto 不支持 ECB，AES 必须自己写。**S-box 用 GF(2⁸) 求逆 + 仿射变换现算**，别手抄 256 字节表（抄错一个字全盘失败）。改完必须用 `crypto.createDecipheriv('aes-128-ecb')` 随机对拍
- 音频密钥流只跟 `i mod 256` 有关，预计算 256 字节再 `audio[i] ^= ks[i & 255]`，10MB 约 0.1s

**验证**（仓库自带 `test/test.ncm`，474KB）：解码后应以 `fLaC` 或 `ID3` 开头；解析 FLAC 的 STREAMINFO 应得 44100Hz / 2ch / 16bit / 176400 采样 = 4.00s，元数据「贝贝 / 李荣浩 / 耳朵」。

**失败时**：抛「不是 ncm 文件」或「解出来后不是已知音频格式」，页面直接显示原因，不静默。

---

## 11. 网易云时间轴与译文

**数据在哪**：`https://music.163.com/api/song/lyric?id=X&lv=-1&kv=-1&tv=-1` 返回 `{lrc, klyric, tlyric, transUser, lyricUser}`，`tlyric.lyric` 就是带时间戳的中文译文，**时间戳与 `lrc` 完全一致**，按时间直接配对，不需要对齐算法。

**为什么不能直接用**（2026-11-27 逐条实测，别再试）：

| 接口 | 有译文 | 认 `callback` | 发 CORS 头 |
|---|---|---|---|
| `/api/song/media?id=` | ✗ 只有原文 | ✓ | ✗ |
| `/api/song/lyric?id=&lv=-1&kv=-1&tv=-1` | ✓ | ✗ | ✗ |

`callback` / `jsoncallback` / `cb` / `format=jsonp` / `jsonp` / `jsonpCallback` 全试过，`/api/song/lyric` 一律原样返回 JSON。纯静态页两头堵：没有 JSONP 也没有 CORS。

**GitHub 也当不了中转**：Pages 是纯静态没有服务端；Actions 触发要 PAT，公开页塞不了 token；「Actions 定时预抓 → 提交 JSON → 页面从 raw 读」是预缓存，不能点一下就要。公共 CORS 中转同时段实测全挂（allorigins 522、codetabs 522、corsproxy 401、cors.lol 429 等）。

**现在的做法**——公开镜像，零部署：

```
https://music-api.gdstudio.xyz/api.php?types=lyric&source=netease&id=<歌曲id>
→ { lyric: "...", tlyric: "...", from: "..." }
```

- 带 `ACAO:*`，国内可直连（实测 1.2–3.0 秒）
- `lyric` + `tlyric` 一次拿齐，`fetchNetAll()` 一个请求
- 镜像不通时退回官方 `/api/song/media` 的 JSONP，**只有轴没有译文**，功能不中断
- 译文只补 `zh` 为空的句子（`fillZh`），手写译文永不被覆盖
- 常量 `MIRROR_API` 是唯一外部依赖（第三方，随时可能挂）。挂了按序处理：① 换同类镜像；② 退回官方 JSONP；③ 自建 Worker 中转（代码在 git 历史 `e16e425` 的 `relay-worker.js`）

**已知数据问题**：网易云译文偶有跨行错位（例 `旅人の唄` id 2692705089，31.82s 的「満ち足りぬ 心に」对到「满溢而出的清泉」），是译者拆长句造成，官方 App 同样如此，**不是 bug，别修**。

---

## 12. 用户偏好（影响沟通方式）

- **结论先行**、表格化、篇幅受控；要能直接执行，不要长篇原理
- **不愿为小功能装第三方软件**，也不接受「用前要先手动开某个程序」
- 优先用助手自身能力，别急着找外部工具
- 担心过度依赖单一 AI / 云服务，方案要考虑数据留在本地
- 技术底子硬（自己部署 SillyTavern、调 mpv 补帧、配 LADA），可以直接上硬核内容，但要给他「放大器」而不是替他做决定
- **技术参数绝不凭记忆写**——快捷键、API、字段必须回权威来源核对。他被错误的文档坑过
- 习惯先出原型、真机验证，再决定是否发布；改视觉位置时经常返工（释义从词上改到词下，「译」从「轴」右边改到「音」左边），先照做再讨论

---

## 13. 换机 / 换手机

### 13.1 换电脑

代码全在 GitHub，规模 32MB，无需备份。**新机 clone 下来这份文档就在仓库里**（`HANDOVER.md`）。

```powershell
git clone https://github.com/feibi666/kashicho.git "G:\WorkBuddy work\kashicho"

git config --global user.name  "feibi666"
git config --global user.email "1297517237@qq.com"
git config --global credential.helper manager
git config --global core.autocrlf false   # 这条别省
```

`core.autocrlf false` 必须设：旧仓文件是纯 LF，被设成 `true` 会检成 CRLF，diff 变脏。

新机需要：**Git**（建议 `I:\Git`）、**静态服务器**（Python 3 或任意）。Node 可以不装，WorkBuddy 自带一份。

首次 push 会弹 GitHub 授权，之后永久记住。

本地预览：

```powershell
cd "G:\WorkBuddy work\kashicho"
python -m http.server 8765 --bind 127.0.0.1
```

### 13.2 换手机

| 项 | 结果 |
|---|---|
| 代码 / 线上 | 不受影响，同一 URL 打开就是新版 |
| 歌词、打点、注音、释义 | **全丢**（存在旧机 IndexedDB）。**先用「备份」导出 JSON** |
| 音乐文件夹授权 | 重新授权一次 |
| 播放位置、上次那首 | 重置 |

新机装好后用「恢复」导入备份：歌词、释义、读音都能回来；同名歌会问「覆盖 / 跳过」。

---

## 14. 已知限制与可选方向

**限制（都是既定取舍，不是 bug）**

- 无假名的纯汉字日文行会被当成译文行（如「東京」）。要分清只能靠时间轴
- 倍速只有 `1×` / `0.75×` 两档
- 歌词只存本机 IndexedDB，靠备份/恢复手工迁移
- 文件夹授权不跨会话，每次重开要点一次「允许」
- PWA 无法常驻媒体通知（§9）
- 网易云译文依赖第三方镜像，可能失效

**如果以后还要做**（按性价比排序）

1. **双 audio 元素热切换** —— 消除切歌那几秒卡片闪断。改动涉及事件绑定整体结构，中等风险
2. **0.5× 倍速**、倍速记忆
3. **歌词导出为 `.lrc`**（带假名/译文的扩展格式），方便导入其他播放器
4. **Capacitor 加壳 + 原生前台服务** —— 只有这个能根治媒体通知常驻，工程量大

---

## 15. 版本编年（找回归点时用）

| 提交 | 事 |
|---|---|
| `3e82602` | 基线：PWA 上线、注音引擎本地化、Worker、SW 词典代理（`SHELL v13`） |
| `c1e07be` → `9abb8f1` | 原型阶段：下沉控制区、居中跟随、译开关、生词释义、ncm 解码、递归扫盘、查词三 tab |
| `ed748b3` | 释义移到词下、译左移、ncm、递归 |
| `c57023f` | 网易云改走 gdstudio 镜像（此前 CF Worker 中转方案作废） |
| `c796836` | 人工读音改按歌存（`rec.read`），旧全局键转 `read_legacy` |
| `675b9ef` | 原型转正为 `index.html` + 「同时套用到其他歌」勾选（`SHELL v14`） |
| `022e0b2` | 媒体会话补齐（artwork/prev-next/positionState）+ 备份导入导出（`SHELL v15`） |
| `26d4287` | 切歌不再设 `playbackState='none'`、后台位置保活（`SHELL v16`） |
| `f651943` | 居中跟随改 `progScrolling` + `scrollend` 判定（修切歌后不回正）、加 Screen Wake Lock 屏幕常亮（`SHELL v17`，**仅 proto**，待真机验证后同步正式版） |
| `493d00c` | 混合词只给汉字标音（`立[た]ち尽[つ]くす`），夹在汉字间的假名不再被标（`SHELL v18`，**仅 proto**） |
| `f6f2db8` | 释义词范围加棕色虚线下划线，范围=整个词（含假名），释义小字居中在下方；`body.nogloss` 时线一起隐藏（`SHELL v19`，**仅 proto**） |
| `3d406c0` | 范围线改用 `::after` 单线（v19 的 border 在 ruby inline 盒上画成两条、且太淡看不见），2px dotted 深棕、释义下移让位（`SHELL v20`，**仅 proto**） |
| `c35cd33` | 释义改挂字典形 `basic_form`，渲染时吸收活用尾巴（助动词/て/で）成一整块；卡片补「＝原形」提示；demo 加一句 `立ち尽くした` 做回归样例（`SHELL v21`，**仅 proto**） |
