#!/usr/bin/env node
/* ============================================================
   天启 · Tiaqi 静态生成器（零依赖）
   1) 抓取公开信源 → 去重 → 按维度归类 → 生成 data/intel/<期>.json
   2) 读取 content/fiction/*.md
   3) 渲染全部静态页面到仓库根目录（GitHub Pages 直接托管）
   用法：node scripts/build.mjs [--no-fetch]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const NO_FETCH = process.argv.includes('--no-fetch');
const p = (...a) => path.join(ROOT, ...a);

/* ---------------- 工具 ---------------- */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inlineMd(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

function cleanText(s) {
  return String(s ?? '')
    /* 必须先解 CDATA，否则 <![CDATA[标题]]> 会被当作标签整段删掉 */
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const pad2 = (n) => String(n).padStart(2, '0');

/* ---------------- 配置 ---------------- */
const cfg = JSON.parse(fs.readFileSync(p('scripts/sources.json'), 'utf8'));
const motifCfg = JSON.parse(fs.readFileSync(p('content/motifs.json'), 'utf8'));
const MOTIFS = new Map(motifCfg.motifs.map((m) => [m.slug, m]));

/* ---------------- 抓取 ---------------- */
async function getText(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; tiaqi-bot/1.0)' },
      redirect: 'follow'
    });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; } finally { clearTimeout(t); }
}

const pickOne = (b, re) => { const m = b.match(re); return m ? m[1] : ''; };

function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/\1>/g) || [];
  const out = [];
  for (const b of blocks) {
    const title = cleanText(pickOne(b, /<title[^>]*>([\s\S]*?)<\/title>/));
    let link = cleanText(pickOne(b, /<link[^>]*>([\s\S]*?)<\/link>/));
    if (!link) {
      const h = b.match(/<link[^>]*href=["']([^"']+)["']/);
      if (h) link = h[1];
    }
    const dateRaw = pickOne(b, /<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/);
    const desc = cleanText(pickOne(b, /<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/));
    if (title && link) out.push({ title, link, date: dateRaw.trim(), desc: desc.slice(0, 180) });
  }
  return out;
}

/* ---------------- 归一化 ---------------- */
const normUrl = (u) => { try { const x = new URL(u); return (x.hostname + x.pathname).replace(/\/$/, '').toLowerCase(); } catch { return String(u).toLowerCase(); } };
const fingerprint = (t) => t.toLowerCase().replace(/[\s\W_]+/g, '');

function classify(text) {
  const s = text.toLowerCase();
  let best = 'tech', bestHits = 0;
  for (const [dim, def] of Object.entries(cfg.dimensions)) {
    let hits = 0;
    for (const k of def.keywords) if (s.includes(k.toLowerCase())) hits++;
    if (hits > bestHits) { bestHits = hits; best = dim; }
  }
  return best;
}

function buildSignals(raw) {
  const now = Date.now();
  const seenUrl = new Set(), seenTitle = new Set();
  const items = [];
  for (const it of raw) {
    const u = normUrl(it.link);
    const f = fingerprint(it.title);
    if (seenUrl.has(u) || seenTitle.has(f)) continue;
    seenUrl.add(u); seenTitle.add(f);
    const ts = Date.parse(it.date);
    const days = Number.isNaN(ts) ? 0 : Math.max(0, (now - ts) / 86400000);
    if (days > cfg.limits.windowDays) continue;
    const dim = classify(`${it.title} ${it.desc}`);
    items.push({
      level: 'confirmed',
      dimension: dim,
      title: it.title.slice(0, 120),
      source: it.srcName,
      url: it.link,
      date: Number.isNaN(ts) ? new Date(now).toISOString().slice(0, 10) : new Date(ts).toISOString().slice(0, 10),
      note: it.desc || '',
      motif: cfg.motifByDimension[dim] || [],
      _score: (it.weight || 1) * 10 - days * 0.6
    });
  }
  items.sort((a, b) => b._score - a._score);
  return items.slice(0, cfg.limits.maxSignals).map(({ _score, ...rest }) => rest);
}

/* ---------------- 期号 ---------------- */
function issueId(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

async function collect() {
  const list = cfg.sources.filter((s) => s.enabled !== false);
  const res = await Promise.allSettled(list.map(async (s) => {
    const xml = await getText(s.url);
    if (!xml) return [];
    return parseFeed(xml).map((it) => ({ ...it, srcName: s.name, weight: s.weight ?? 1 }));
  }));
  const raw = [];
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') raw.push(...r.value);
    else console.error(`  ! 信源失败：${list[i].name}`);
  });
  return raw;
}

/* ---------------- 小说 ---------------- */
function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf(':'); if (i < 0) continue;
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    else v = v.replace(/^["']|["']$/g, '');
    data[k] = v;
  }
  return { data, body: m[2] };
}

function renderMarkdown(md) {
  const out = []; let para = [];
  const flush = () => { if (para.length) { out.push('<p>' + inlineMd(para.join(' ')) + '</p>'); para = []; } };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^#{2,3}\s+/.test(line)) { flush(); out.push('<h2>' + inlineMd(line.replace(/^#{2,3}\s+/, '')) + '</h2>'); continue; }
    if (/^>\s?/.test(line)) { flush(); out.push('<blockquote>' + inlineMd(line.replace(/^>\s?/, '')) + '</blockquote>'); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flush(); out.push('<hr />'); continue; }
    para.push(line);
  }
  flush();
  return out.join('\n');
}

function loadFiction() {
  const base = p('content/fiction');
  if (!fs.existsSync(base)) return [];
  const chapters = [];
  for (const book of fs.readdirSync(base)) {
    const dir = path.join(base, book);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (data.status === 'draft') continue;
      chapters.push({
        ...data,
        book,
        chapter: Number(data.chapter) || 0,
        volume: Number(data.volume) || 1,
        motif: Array.isArray(data.motif) ? data.motif : (data.motif ? [data.motif] : []),
        html: renderMarkdown(body),
        slug: `${book}/${pad2(Number(data.chapter) || 0)}`
      });
    }
  }
  return chapters.sort((a, b) => a.volume - b.volume || a.chapter - b.chapter);
}

/* ---------------- 渲染骨架 ---------------- */
/* 静态点阵底噪层：零 JS、零动画、零第三方请求 */
const BG_PLANE = `<div class="bg-plane" aria-hidden="true"></div>`;

/* 欢迎页：无 JS 时是普通可见区块，JS 激活后才成为覆盖层 */
const WELCOME = `<div class="welcome" data-welcome>
  <div class="w-inner">
    <span class="w-dot" aria-hidden="true"></span>
    <div class="w-rule" aria-hidden="true"></div>
    <p class="w-hello">Hello, World.</p>
    <p class="w-title"><span class="wq">天启</span></p>
    <p class="w-sub">抵达此处，即为第一个信号。</p>
    <p class="w-tag">Tiaqi — insight, opened.</p>
    <button type="button" class="w-enter" data-welcome-enter>进入</button>
  </div>
</div>`;

/* 全站唯一一段内联脚本：① no-js → js 标记 ② 欢迎页 dismiss ③ 移动端抽屉 */
const APP_JS = `<script>
(function(){
var R=document.documentElement;
R.classList.remove('no-js');R.classList.add('js');R.dataset.js='1';
var ls=function(k,v){try{return arguments.length>1?localStorage.setItem(k,v):localStorage.getItem(k);}catch(e){return null;}};
var w=R.querySelector('[data-welcome]'),s=R.querySelector('.shell'),main=R.querySelector('#main'),t=0,done=0;
function dismiss(){
  if(done||!w)return;done=1;clearTimeout(t);
  w.classList.add('w-gone');w.setAttribute('aria-hidden','true');w.inert=true;
  if(s)s.inert=false;
  if(main)main.focus({preventScroll:true});
  ls('tq_w',String(Date.now()));
}
if(w){
  var seen=Number(ls('tq_w'));
  if(seen&&Date.now()-seen<6048e5){dismiss();}
  else{
    if(s)s.inert=true;
    t=setTimeout(dismiss,3500);
    w.addEventListener('click',dismiss);
    window.addEventListener('keydown',dismiss);
    window.addEventListener('scroll',function(){if(window.scrollY>=40){dismiss();}},{passive:true});
  }
}
var btn=R.querySelector('.menu-btn'),dr=document.getElementById('drawer'),sc=R.querySelector('.scrim'),cb=R.querySelector('.drawer-close');
if(!btn||!dr||!sc||!cb)return;
btn.hidden=false;
var SEL='a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';
function fo(){return [].slice.call(dr.querySelectorAll(SEL)).filter(function(e){return e.getClientRects().length;});}
function shut(){return !dr.classList.contains('is-open');}
function open(){
  var bw=window.innerWidth-R.clientWidth;
  if(bw>0)R.style.setProperty('--sbw',bw+'px');
  dr.hidden=false;sc.hidden=false;
  void dr.offsetWidth;
  dr.classList.add('is-open');sc.classList.add('is-on');
  btn.setAttribute('aria-expanded','true');
  R.classList.add('dq-open');
  cb.focus({preventScroll:true});
}
function close(back){
  dr.classList.remove('is-open');sc.classList.remove('is-on');
  btn.setAttribute('aria-expanded','false');
  R.classList.remove('dq-open');R.style.removeProperty('--sbw');
  if(back)btn.focus({preventScroll:true});
  setTimeout(function(){if(shut()){dr.hidden=true;sc.hidden=true;}},160);
}
btn.addEventListener('click',function(){shut()?open():close(1);});
cb.addEventListener('click',function(){close(1);});
sc.addEventListener('click',function(){close(1);});
document.addEventListener('keydown',function(e){
  if(shut())return;
  if(e.key==='Escape'){close(1);return;}
  if(e.key!=='Tab')return;
  var f=fo();if(!f.length)return;
  var i=f.indexOf(document.activeElement);if(i<0)i=0;
  e.preventDefault();f[e.shiftKey?(i+f.length-1)%f.length:(i+1)%f.length].focus();
});
var mq=window.matchMedia('(min-width:1024px)'),onMq=function(){if(mq.matches&&!shut())close(0);};
if(mq.addEventListener)mq.addEventListener('change',onMq);else if(mq.addListener)mq.addListener(onMq);
})();
</script>`;

/* 5 个分区入口：真实 URL 直出。序号 01–05 由索引生成，不加英文小标。
   page = 当前页 key（标 aria-current="page"）
   section = 所属栏目 key（无精确命中时标 aria-current="true"，同组只标一个） */
const NAV_ITEMS = [
  ['intel', 'intel/', '情报站'],
  ['fiction', 'fiction/', '档案室'],
  ['motif', 'motif/', '母题'],
  ['archive', 'intel/archive/', '时间线'],
  ['about', 'about.html', '关于']
];

function navList(pre, page = '', section = '') {
  return NAV_ITEMS.map(([k, href, label], i) => {
    const cur = page === k ? 'page' : (!page && section === k ? 'true' : '');
    return `<li><a href="${pre}${href}"${cur ? ` aria-current="${cur}"` : ''}><span class="s-num mono">${pad2(i + 1)}</span><span class="s-txt">${esc(label)}</span></a></li>`;
  }).join('');
}

/* 移动端抽屉：<1024 由汉堡按钮唤出；按钮与抽屉默认 hidden，JS 激活后才可用 */
function drawer(pre, page = '', section = '') {
  return `<div class="scrim" hidden></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-t" hidden>
  <h2 class="sr-only" id="drawer-t">站点导航</h2>
  <button class="drawer-close" type="button">关闭<span class="sr-only">导航</span></button>
  <nav class="sections" aria-label="站点导航"><ul role="list">${navList(pre, page, section)}</ul></nav>
</aside>`;
}

/* 桌面侧栏：≥1024 常驻 sticky；<1024 由抽屉承担，此处 display:none */
function sidebar(pre, page = '', section = '') {
  return `<aside class="sidebar">
  <nav class="sections" aria-label="分区导航"><ul role="list">${navList(pre, page, section)}</ul></nav>
</aside>`;
}

function footNav(pre) {
  return NAV_ITEMS.map(([, href, label], i) => `<a href="${pre}${href}">${pad2(i + 1)} ${esc(label)}</a>`).join('')
    + `<a href="${pre}feed.xml">RSS</a>`;
}

function layout({ title, desc, theme, body, pre = '', active = '', section = '', welcome = false }) {
  return `<!DOCTYPE html>
<html lang="zh-CN" class="no-js">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='9' fill='none' stroke='%231F4FD8' stroke-width='1.6'/><path d='M12 12 18.5 7.5' stroke='%231F4FD8' stroke-width='2' stroke-linecap='round'/></svg>" />
<meta name="color-scheme" content="light" />
<link rel="stylesheet" href="${pre}style.css?v=5" />
</head>
<body class="theme-${theme}">
<a class="skip" href="#main">跳到正文</a>
${BG_PLANE}
<header class="topbar">
  <button class="menu-btn" type="button" aria-controls="drawer" aria-expanded="false" hidden><span class="mb-bars" aria-hidden="true"></span><span class="sr-only">站点导航</span></button>
  <a class="brand" href="${pre || './'}"${active === 'home' ? ' aria-current="page"' : ''}>Tiaqi</a>
</header>
${drawer(pre, active, section)}
${welcome ? WELCOME : ''}
<div class="shell">
${sidebar(pre, active, section)}
<main id="main" tabindex="-1">${body}</main>
</div>
<footer class="footer">
  <div class="foot-row">
    <p class="foot-brand">Tiaqi</p>
    <nav class="foot-nav" aria-label="页脚导航">${footNav(pre)}</nav>
  </div>
  <p class="foot-note">纯静态构建 · 无追踪、无统计脚本 · 评论托管于 GitHub Discussions</p>
</footer>
${APP_JS}
</body>
</html>
`;
}

const DOT = { confirmed: 'dot-full', watch: 'dot-half', noise: 'dot-empty', risk: 'dot-notch' };
const LEVEL_LABEL = { confirmed: '确认', watch: '观察', noise: '噪声', risk: '风险' };

function statusTag(level) {
  return `<span class="status-tag ${esc(level)}"><i class="dot ${DOT[level] || 'dot-full'}" aria-hidden="true"></i>${esc(LEVEL_LABEL[level] || level)}</span>`;
}

function signalCard(s, motifPre = 'motif/') {
  const dim = cfg.dimensions[s.dimension]?.label || s.dimension;
  const motifs = (s.motif || []).map((m) => `<a class="chip" href="${motifPre}${esc(m)}/">${esc(MOTIFS.get(m)?.name || m)}</a>`).join('');
  return `<article class="signal-card ${esc(s.level)}">
  <div class="sc-top">${statusTag(s.level)}<span class="dim">${esc(dim)}</span></div>
  <h3 class="sc-title"><a href="${esc(s.url)}" rel="noopener nofollow">${esc(s.title)}</a></h3>
  <p class="sc-meta">${esc(s.source)} · <span class="mono">${esc(s.date)}</span></p>
  ${s.note ? `<details class="sc-note"><summary>展开批注</summary><p>${esc(s.note)}</p></details>` : ''}
  ${motifs ? `<p class="sc-motif">母题 ${motifs}</p>` : ''}
</article>`;
}

/* ---------------- 页面 ---------------- */
/* 首页：一个焦点区原则。① 焦点区（最新简报 | 最新章节）② 情报最新 3 条
   ③ 档案室章节列表 ④ 关于·订阅一行。空集合不渲染容器。 */
function renderHome(all, chapters) {
  const issue = all[0];
  const latest = chapters[chapters.length - 1];
  const sig = (issue?.signals || []).slice(0, 3);
  let h1used = false;
  const h = () => { const t = h1used ? 'h2' : 'h1'; h1used = true; return t; };
  const kw = (ms) => (ms || []).length
    ? `<span class="kws">${ms.map((m) => `<a class="kw" href="motif/${esc(m)}/">${esc(MOTIFS.get(m)?.name || m)}</a>`).join('')}</span>`
    : '';

  /* ① 焦点区：两轨并列（主：简报 34px / 并列：章节 21px）；任一缺失 → 单轨占满整行 */
  const cells = [];
  if (issue) {
    const dims = [...new Set(issue.signals.map((s) => cfg.dimensions[s.dimension]?.label || s.dimension))];
    const ht = h();
    cells.push(`<section class="f-cell">
    <p class="f-kicker mono">01 情报站 · ${esc(issue.issue)}</p>
    <${ht} class="f-title"><a href="intel/${esc(issue.issue)}/">${esc(issue.headline || `第 ${issue.issue} 期简报`)}</a></${ht}>
    <p class="f-sum">${esc((issue.judgments || []).length
      ? issue.judgments.slice(0, 3).join(' ')
      : `本期已归集 ${issue.signals.length} 条信号，覆盖${dims.join('、') || '多个维度'}。核心判断由人工撰写后发布。`)}</p>
    ${kw([...new Set(issue.signals.flatMap((s) => s.motif || []))])}
    <p class="f-go"><a href="intel/${esc(issue.issue)}/">阅读全文 →</a></p>
  </section>`);
  }
  if (latest) {
    const firstP = (latest.html.match(/<p>([\s\S]*?)<\/p>/) || [, ''])[1].replace(/<[^>]+>/g, '');
    const ht = h();
    cells.push(`<section class="f-cell">
    <p class="f-kicker mono">02 档案室 · 第 ${pad2(latest.chapter)} 章</p>
    <${ht} class="f-title f-title-sm"><a href="fiction/${esc(latest.slug)}/">${esc(latest.title)}</a></${ht}>
    <p class="f-sum f-sum-2">${esc(latest.synopsis || firstP || '')}</p>
    <p class="f-go"><a href="fiction/${esc(latest.slug)}/">阅读章节 →</a></p>
  </section>`);
  }
  const focus = cells.length
    ? `<div class="focus focus-${cells.length}">${cells.join('')}</div>`
    : `<div class="focus focus-1"><section class="f-cell"><h1 class="f-title">抵达此处，即为第一个信号。</h1>
    <p class="f-sum">情报站与档案室的双线站点，内容正在归集。</p></section></div>`;

  /* ② 情报站最新 3 条：仅 1 期时整块不渲染（焦点区已承载该期） */
  const latestBlock = (all.length > 1 && sig.length)
    ? `<section class="latest">
    <h2 class="lst-h">情报站 · 最新 3 条</h2>
    <ul class="lst" role="list">${sig.map((s) => `<li>
      <span class="m-date mono">${esc(s.date)}</span>
      <a class="lst-a" href="intel/${esc(issue.issue)}/">${esc(s.title)}</a>${kw(s.motif)}</li>`).join('')}</ul>
  </section>`
    : '';

  /* ③ 档案室章节列表（弱）：章节少时全量展示并去掉「查看全部」 */
  const CH_MAX = 5;
  const showAll = chapters.length <= CH_MAX;
  const ficBlock = chapters.length
    ? `<section class="chapters">
    <h2 class="lst-h">02 档案室 · 章节</h2>
    <ol class="chapter-list">${chapters.slice(0, showAll ? chapters.length : CH_MAX).map((c) => `<li>
      <a href="fiction/${esc(c.slug)}/"><span class="ch-no mono">${pad2(c.chapter)}</span><span class="ch-title">${esc(c.title)}</span></a>
      <span class="ch-meta mono">${esc(c.date || c.published || '')}</span>
    </li>`).join('')}</ol>
    ${showAll ? '' : '<p class="track-more"><a href="fiction/">查看全部 →</a></p>'}
  </section>`
    : '';

  /* ④ 关于·订阅一行（弱，13px，上 hairline） */
  const aboutLine = `<section class="about-line">
    <p><a href="about.html">05 关于</a> · <a href="feed.xml">订阅 RSS</a> · 无追踪、无统计脚本</p>
  </section>`;

  const body = `${focus}${latestBlock}${ficBlock}${aboutLine}`;
  return layout({
    title: 'Tiaqi —— 抵达此处，即为第一个信号',
    desc: '情报站与档案室的双线站点，纯静态构建。',
    theme: 'home', body, pre: '', active: 'home', section: '', welcome: true
  });
}

function renderBriefing(issue, all, pre = '../../', entry = false) {
  const idx = all.findIndex((x) => x.issue === issue.issue);
  const prev = all[idx + 1], next = all[idx - 1];
  const dims = [...new Set(issue.signals.map((s) => s.dimension))];
  const cards = issue.signals.map((s) => `<div class="sig-wrap" data-dim="${esc(s.dimension)}">${signalCard(s, `${pre}motif/`)}</div>`).join('');
  /* 筛选：radio + CSS 兄弟选择器，无需 JS（无 JS 时全部信号可见） */
  const dimKeys = ['all', ...dims];
  const radios = dimKeys.map((d) => `<input class="vh" type="radio" name="dim" id="dim-${esc(d)}"${d === 'all' ? ' checked' : ''} />`).join('');
  const labels = dimKeys.map((d) => {
    const n = d === 'all' ? issue.signals.length : issue.signals.filter((s) => s.dimension === d).length;
    return `<label class="tg" for="dim-${esc(d)}">${d === 'all' ? '全部' : esc(cfg.dimensions[d]?.label || d)} ${n}</label>`;
  }).join('');
  const dimCss = dimKeys.map((d) => `#dim-${esc(d)}:checked ~ .filters label[for="dim-${esc(d)}"]{color:var(--c-accent);border-color:var(--c-accent);background:var(--c-accent-wash);}
#dim-${esc(d)}:focus-visible ~ .filters label[for="dim-${esc(d)}"]{outline:2px solid var(--c-accent);outline-offset:3px;}
${d === 'all' ? '' : `#dim-${esc(d)}:checked ~ .signals-grid .sig-wrap:not([data-dim="${esc(d)}"]){display:none;}`}`).join('\n');
  const body = `
<section class="brief">
  <p class="eyebrow"><a href="${pre}intel/archive/">← 时间线</a></p>
  <p class="issue-no mono">第 ${esc(issue.issue)} 期</p>
  <h1 class="h1">本期核心判断</h1>
  <div class="beam wide" aria-hidden="true"></div>
  ${issue.headline
      ? `<p class="headline">${esc(issue.headline)}</p><ol class="judgments">${(issue.judgments || []).map((j) => `<li>${esc(j)}</li>`).join('')}</ol>`
      : `<div class="empty pending"><p class="empty-title">本期判断待补充</p>
         <p class="empty-hint">信号已由机器归集完成（${issue.signals.length} 条），核心判断由人工撰写后发布。下方信号可先行查阅。</p></div>`}
  <h2 class="sec">分维度信号</h2>
  <fieldset class="filterbar">
    <legend class="sr-only">按维度筛选</legend>
    ${radios}
    <div class="filters">${labels}</div>
    <div class="signals-grid" id="signals">${cards || '<p class="empty-hint">本期暂无信号。</p>'}</div>
  </fieldset>
  <style>${dimCss}</style>
  <h2 class="sec">本期母题</h2>
  <p class="motif-line"><span class="chips">${[...new Set(issue.signals.flatMap((s) => s.motif || []))].map((m) => `<a class="chip" href="${pre}motif/${esc(m)}/">${esc(MOTIFS.get(m)?.name || m)}</a>`).join('') || '<span class="empty-hint">本期信号未命中母题。</span>'}</span></p>
  <nav class="issue-nav">
    ${prev ? `<a href="${pre}intel/${esc(prev.issue)}/">← ${esc(prev.issue)}</a>` : '<span class="disabled">← 已是最早</span>'}
    ${next ? `<a href="${pre}intel/${esc(next.issue)}/">${esc(next.issue)} →</a>` : '<span class="disabled">已是最新 →</span>'}
  </nav>
</section>`;
  return layout({
    title: entry ? '情报站 —— Tiaqi' : `第 ${issue.issue} 期简报 —— Tiaqi 情报站`,
    desc: `第 ${issue.issue} 期简报，共 ${issue.signals.length} 条信号。`,
    theme: 'intel', body, pre,
    active: entry ? 'intel' : '', section: 'intel'
  });
}

function renderIntelLatest(issue, all) {
  /* 分区入口页：直接渲染最新一期简报正文（真内容，无 meta-refresh 跳转） */
  return renderBriefing(issue, all, '../', true);
}

function renderArchive(all) {
  const rows = all.map((i) => `<li class="tl-item">
    <span class="tl-node" aria-hidden="true"></span>
    <a class="tl-issue mono" href="../${esc(i.issue)}/">${esc(i.issue)}</a>
    <span class="tl-body">${i.headline ? esc(i.headline) : '<span class="empty-hint">判断待补充</span>'}
    <span class="tl-meta mono">${i.signals.length} 信号 / ${new Set(i.signals.map((s) => s.dimension)).size} 维度</span></span>
  </li>`).join('');
  const body = `<section class="brief">
    <p class="eyebrow">04 · 时间线</p><h1 class="h1">时间线</h1>
    <div class="beam wide" aria-hidden="true"></div>
    ${all.length ? `<ul class="timeline">${rows}</ul>` : '<div class="empty"><p class="empty-title">还没有已发布的简报</p><p class="empty-hint">首期简报将在下一次归集后生成。</p></div>'}
  </section>`;
  return layout({ title: '时间线 —— Tiaqi', desc: '全部情报简报按期归档。', theme: 'intel', body, pre: '../../', active: 'archive', section: 'intel' });
}

function renderFictionIndex(chapters) {
  const book = chapters[0];
  const byVol = {};
  chapters.forEach((c) => { (byVol[c.volume] ||= []).push(c); });
  const vols = Object.entries(byVol).map(([v, list]) => `
    <h2 class="sec serif">第 ${esc(v)} 卷${list[0].volumeTitle ? ' · ' + esc(String(list[0].volumeTitle).split('·').pop().trim()) : ''}</h2>
    <ol class="chapter-list">${list.map((c) => `<li>
      <a href="${esc(c.slug)}/"><span class="ch-no mono">${pad2(c.chapter)}</span><span class="ch-title">${esc(c.title)}</span></a>
      <span class="ch-meta mono">${esc(c.date || c.published || '')} · ${esc(c.words || '')} 字</span>
      ${c.demo ? '<span class="badge-demo">示例</span>' : ''}
    </li>`).join('')}</ol>`).join('');
  const body = `<section class="brief theme-paper">
    <p class="eyebrow">02 · 档案室</p>
    <h1 class="h1 serif">${esc(book?.bookTitle || '档案室')}</h1>
    <div class="rule wide" aria-hidden="true"></div>
    ${chapters.length ? vols : '<div class="empty"><p class="empty-title">档案尚未开卷</p><p class="empty-hint">章节以 Markdown 管理，按卷发布。</p></div>'}
  </section>`;
  return layout({ title: `${book?.bookTitle || '档案室'} —— Tiaqi`, desc: '按卷归档的章节目录。', theme: 'fiction', body, pre: '../', active: 'fiction', section: 'fiction' });
}

function renderChapter(c, chapters, all) {
  const i = chapters.findIndex((x) => x.slug === c.slug);
  const prev = chapters[i - 1], next = chapters[i + 1];
  const body = `<article class="chapter">
    <p class="eyebrow"><a href="../../">《${esc(c.bookTitle)}》 · 第 ${esc(c.volume)} 卷 · 第 ${pad2(c.chapter)} 章</a></p>
    <h1 class="h1 serif">${esc(c.title)}</h1>
    <p class="ch-info">${esc(c.published || '')} · ${esc(c.words || '')} 字 ${c.demo ? '<span class="badge-demo">示例章节</span>' : ''}</p>
    ${(c.motif || []).length ? `<p class="motif-line"><span class="chips">${c.motif.map((m) => `<a class="chip" href="../../../motif/${esc(m)}/">${esc(MOTIFS.get(m)?.name || m)}</a>`).join('')}</span></p>` : ''}
    ${c.synopsis ? `<p class="standfirst">${esc(c.synopsis)}</p>` : ''}
    <div class="prose-body">${c.html}</div>
    <nav class="chapter-nav">
      ${prev ? `<a href="../../${esc(prev.slug)}/">← ${esc(prev.title)}</a>` : '<span class="disabled">← 已是第一章</span>'}
      <a href="../../">目录</a>
      ${next ? `<a href="../../${esc(next.slug)}/">${esc(next.title)} →</a>` : '<span class="disabled">已是最新一章 →</span>'}
    </nav>
    <details class="discussion"><summary>展开讨论</summary>
      <div class="discussion-body"><p class="empty-hint">讨论区将在 giscus 配置完成后启用（托管于 GitHub Discussions，需 GitHub 账号）。</p></div>
    </details>
  </article>`;
  return layout({ title: `${c.title} · 《${c.bookTitle}》第 ${pad2(c.chapter)} 章 —— Tiaqi`, desc: c.synopsis || `${c.title}`, theme: 'fiction', body, pre: '../../../', active: '', section: 'fiction' });
}

function renderMotif(slug, all, chapters) {
  const m = MOTIFS.get(slug);
  const sig = all.flatMap((i) => i.signals.filter((s) => (s.motif || []).includes(slug)).map((s) => ({ ...s, issue: i.issue })));
  const chs = chapters.filter((c) => (c.motif || []).includes(slug));
  const body = `<section class="brief">
    <p class="eyebrow"><a href="../">← 全部母题</a></p>
    <h1 class="h1 serif">${esc(m.name)}</h1>
    <div class="rule wide" aria-hidden="true"></div>
    <p class="standfirst">${esc(m.gloss)}</p>
    <h2 class="sec">现实侧 · ${sig.length} 条信号</h2>
    ${sig.length ? `<div class="signals-grid cols-1">${sig.slice(0, 12).map((s) => signalCard(s, '../../motif/')).join('')}</div>` : '<p class="empty-hint">该母题暂无情报信号。</p>'}
    <h2 class="sec">虚构侧 · ${chs.length} 章</h2>
    ${chs.length ? `<ol class="chapter-list">${chs.map((c) => `<li><a href="../../fiction/${esc(c.slug)}/"><span class="ch-no mono">${pad2(c.chapter)}</span><span class="ch-title">${esc(c.title)}</span></a></li>`).join('')}</ol>` : '<p class="empty-hint">该母题暂无小说映照。</p>'}
  </section>`;
  return layout({ title: `母题 ${m.name} —— Tiaqi`, desc: m.gloss, theme: 'motif', body, pre: '../../', active: '', section: 'motif' });
}

function renderMotifIndex(all, chapters) {
  const items = [...MOTIFS.values()].map((m) => {
    const ic = all.reduce((n, i) => n + i.signals.filter((s) => (s.motif || []).includes(m.slug)).length, 0);
    const fc = chapters.filter((c) => (c.motif || []).includes(m.slug)).length;
    return `<li class="motif-item"><a class="motif-card" href="${esc(m.slug)}/">
      <span class="motif-name">${esc(m.name)}</span>
      <span class="motif-gloss">${esc(m.gloss)}</span>
      <span class="motif-count mono">情报 ${ic} · 虚构 ${fc}</span>
    </a></li>`;
  }).join('');
  const body = `<section class="brief">
    <p class="eyebrow">03 · 母题</p>
    <h1 class="h1">母题</h1>
    <div class="rule wide" aria-hidden="true"></div>
    <p class="standfirst">母题是两条线的缝合处：同一命题下的现实信号与虚构章节，可双向跳转。</p>
    ${items ? `<ul class="motif-cards" role="list">${items}</ul>`
      : '<div class="empty"><p class="empty-title">尚未定义母题</p><p class="empty-hint">母题在 content/motifs.json 中维护。</p></div>'}
  </section>`;
  return layout({ title: '母题 —— Tiaqi', desc: '全部母题索引：现实信号与虚构章节的缝合处。', theme: 'motif', body, pre: '../', active: 'motif', section: 'motif' });
}

function renderFeed(issue, chapters) {
  const items = [
    ...(issue?.signals || []).map((s) => `<item><title>${esc(s.title)}</title><link>${esc(s.url)}</link><pubDate>${new Date(s.date).toUTCString()}</pubDate><description>${esc(s.source)} · ${esc(cfg.dimensions[s.dimension]?.label || s.dimension)}</description></item>`),
    ...chapters.map((c) => `<item><title>《${esc(c.bookTitle)}》第 ${pad2(c.chapter)} 章 · ${esc(c.title)}</title><link>https://www.tiaqi.com/fiction/${esc(c.slug)}/</link><pubDate>${new Date(c.published || Date.now()).toUTCString()}</pubDate><description>${esc(c.synopsis || '')}</description></item>`)
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<title>Tiaqi · 天启</title><link>https://www.tiaqi.com/</link>
<description>情报站与档案室的双线站点</description><language>zh-CN</language>
${items}</channel></rss>`;
}

/* ---------------- 写出 ---------------- */
function write(rel, content) {
  const f = p(rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  console.log(`  → ${rel}`);
}

/* ---------------- 主流程 ---------------- */
const chapters = loadFiction();
console.log(`小说：${chapters.length} 章`);

let raw = [];
if (NO_FETCH) {
  console.log('跳过抓取（--no-fetch）');
} else {
  console.log('抓取信源…');
  raw = await collect();
  console.log(`  抓到 ${raw.length} 条原始条目`);
}

const signals = buildSignals(raw);
console.log(`归一化后 ${signals.length} 条信号`);

const id = issueId();
const dir = p('data/intel');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${id}.json`);
let issue = { issue: id, date: new Date().toISOString().slice(0, 10), status: 'pending', headline: null, judgments: [], signals };
if (fs.existsSync(file)) {
  try {
    const old = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (old.human_locked) { issue.headline = old.headline; issue.judgments = old.judgments; issue.status = old.status || 'published'; }
    /* 不抓取时直接复用已归集的数据，避免把已发布的信号清空 */
    if (NO_FETCH) issue = old;
  } catch {}
}
if (!NO_FETCH) fs.writeFileSync(file, JSON.stringify(issue, null, 2));

const allIssues = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
  .sort((a, b) => b.issue.localeCompare(a.issue));

console.log('生成页面…');
write('index.html', renderHome(allIssues, chapters));
write('feed.xml', renderFeed(allIssues[0], chapters));
for (const i of allIssues) write(`intel/${i.issue}/index.html`, renderBriefing(i, allIssues));
write('intel/index.html', renderIntelLatest(allIssues[0], allIssues));
write('intel/archive/index.html', renderArchive(allIssues));
write('fiction/index.html', renderFictionIndex(chapters));
for (const c of chapters) write(`fiction/${c.slug}/index.html`, renderChapter(c, chapters, allIssues));
write('motif/index.html', renderMotifIndex(allIssues, chapters));
for (const m of MOTIFS.values()) write(`motif/${m.slug}/index.html`, renderMotif(m.slug, allIssues, chapters));
console.log('完成。');
