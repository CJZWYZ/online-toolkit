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
function layout({ title, desc, theme, body, pre = '' }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='9' fill='none' stroke='%234FD1C5' stroke-width='1.6'/><path d='M12 12 18.5 7.5' stroke='%234FD1C5' stroke-width='2' stroke-linecap='round'/></svg>" />
<meta name="color-scheme" content="light dark" />
<link rel="stylesheet" href="${pre}style.css?v=2" />
</head>
<body class="theme-${theme}">
<a class="skip" href="#main">跳到正文</a>
<header class="topbar">
  <a class="brand" href="${pre}">
    <svg class="mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".55" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.2" />
      <path d="M12 1.6V6M12 18v4.4M1.6 12H6M18 12h4.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      <path d="M12 12 18.5 7.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg><span>Tiaqi</span>
  </a>
  <nav class="nav" aria-label="主导航">
    <a href="${pre}intel/">情报站</a>
    <a href="${pre}fiction/">小说档案</a>
    <a href="${pre}about.html">关于</a>
  </nav>
</header>
<main id="main">${body}</main>
<footer class="footer">
  <div class="foot-row">
    <p class="foot-brand">Tiaqi</p>
    <nav class="foot-nav" aria-label="页脚导航">
      <a href="${pre}intel/archive/">归档</a>
      <a href="${pre}feed.xml">RSS</a>
      <a href="${pre}about.html">关于与更新机制</a>
    </nav>
  </div>
  <p class="foot-note">纯静态构建 · 无追踪、无统计脚本 · 评论托管于 GitHub Discussions</p>
</footer>
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
function renderHome(issue, chapters) {
  const latest = chapters[chapters.length - 1];
  const n = issue?.signals?.length || 0;
  const dimCount = {};
  (issue?.signals || []).forEach((s) => { dimCount[s.dimension] = (dimCount[s.dimension] || 0) + 1; });
  const dimLine = Object.entries(dimCount).map(([d, c]) => `${cfg.dimensions[d]?.label || d} ${c}`).join(' · ') || '暂无';
  const top = (issue?.signals || []).slice(0, 3).map(signalCard).join('');
  const book = chapters[0];

  const intelBody = n
    ? `<p class="door-meta mono">第 ${esc(issue.issue)} 期 · ${esc(issue.date)}</p>
       <p class="door-headline">本期概览</p>
       <div class="empty"><p class="empty-title">已归集 ${n} 条信号</p>
       <p class="empty-hint">${esc(dimLine)}。核心判断由人工撰写，当前状态：待补充。</p></div>
       <div class="signals-grid cols-1">${top}</div>
       <p class="track-note"><a class="cta cta-dark" href="intel/${esc(issue.issue)}/">查看本期简报 →</a></p>`
    : `<p class="door-meta mono">第 — 期</p>
       <p class="door-headline">本期核心判断</p>
       <div class="empty"><p class="empty-title">首期简报正在归集信号</p>
       <p class="empty-hint">信号来自公开信源，按周期自动归集；核心判断由人工撰写后发布。</p></div>`;

  const ficBody = latest
    ? `<p class="door-meta mono">第 ${esc(latest.volume)} 卷 · 第 ${pad2(latest.chapter)} 章</p>
       <p class="door-headline serif">${esc(latest.title)}</p>
       <div class="empty"><p class="empty-hint">${esc(latest.synopsis || '')}</p></div>
       <p class="track-note"><a class="cta cta-light" href="fiction/${esc(latest.slug)}/">开始阅读 →</a>
       <a class="cta cta-ghost" href="fiction/">全部目录 →</a></p>`
    : `<p class="door-meta mono">卷 — · 第 — 章</p>
       <p class="door-headline serif">尚未开卷</p>
       <div class="empty"><p class="empty-title">档案尚未开卷</p>
       <p class="empty-hint">章节以 Markdown 管理，按「书目 → 卷 → 章」归档。</p></div>`;

  const motifBand = [...MOTIFS.values()].map((m) => {
    const ic = (issue?.signals || []).filter((s) => (s.motif || []).includes(m.slug)).length;
    const fc = chapters.filter((c) => (c.motif || []).includes(m.slug)).length;
    return `<a class="motif-card" href="motif/${esc(m.slug)}/"><span class="motif-name">${esc(m.name)}</span>
      <span class="motif-count mono">情报 ${ic} · 虚构 ${fc}</span></a>`;
  }).join('');

  const body = `
<section class="hero">
  <p class="eyebrow">SIGNAL · ARCHIVE</p>
  <h1 class="display">把散落的信号<br />读成判断</h1>
  <p class="lede">天启不是预告终局的号角，而是一台把信号读成判断的仪器。<br />一边记录现实的脉动，一边收藏虚构的回声——同一套观测，两种刻度。</p>
</section>
<div class="tracks">
  <section class="track track-intel" aria-labelledby="intel-h">
    <div class="track-head"><p class="track-kicker">SIGNAL</p><h2 class="track-title" id="intel-h">情报站</h2></div>
    <div class="beam" aria-hidden="true"></div>${intelBody}
    <p class="track-note">情报为「简报制」：一期一页，含核心判断、分维度信号与本期母题，不做倒序博客流。</p>
  </section>
  <section class="track track-fiction" aria-labelledby="fiction-h">
    <div class="track-head"><p class="track-kicker">ARCHIVE</p><h2 class="track-title serif" id="fiction-h">小说档案</h2></div>
    <div class="rule" aria-hidden="true"></div>${ficBody}
    <p class="track-note">小说为「档案制」：按卷组织而非按时间倒序，正文限宽、适合长文阅读，讨论入口收在文末。</p>
  </section>
</div>
<section class="motif-band">
  <h2 class="motif-title">母题：两条线的缝合处</h2>
  <div class="motif-cards">${motifBand}</div>
</section>`;
  return layout({ title: 'Tiaqi —— 把散落的信号读成判断', desc: '情报站与小说档案的双线站点，纯静态构建。', theme: 'home', body });
}

function renderBriefing(issue, all) {
  const idx = all.findIndex((x) => x.issue === issue.issue);
  const prev = all[idx + 1], next = all[idx - 1];
  const dims = [...new Set(issue.signals.map((s) => s.dimension))];
  const filters = `<div class="filters" role="group" aria-label="按维度筛选">
    <button type="button" class="tg" data-dim="all" aria-pressed="true">全部 ${issue.signals.length}</button>
    ${dims.map((d) => `<button type="button" class="tg" data-dim="${esc(d)}" aria-pressed="false">${esc(cfg.dimensions[d]?.label || d)} ${issue.signals.filter((s) => s.dimension === d).length}</button>`).join('')}
  </div>`;
  const cards = issue.signals.map((s) => `<div class="sig-wrap" data-dim="${esc(s.dimension)}">${signalCard(s, '../../motif/')}</div>`).join('');
  const body = `
<section class="brief">
  <p class="eyebrow"><a href="../archive/">← 归档</a></p>
  <p class="issue-no mono">第 ${esc(issue.issue)} 期</p>
  <h1 class="h1">本期核心判断</h1>
  <div class="beam wide" aria-hidden="true"></div>
  ${issue.headline
      ? `<p class="headline">${esc(issue.headline)}</p><ol class="judgments">${(issue.judgments || []).map((j) => `<li>${esc(j)}</li>`).join('')}</ol>`
      : `<div class="empty pending"><p class="empty-title">本期判断待补充</p>
         <p class="empty-hint">信号已由机器归集完成（${issue.signals.length} 条），核心判断由人工撰写后发布。下方信号可先行查阅。</p></div>`}
  <h2 class="sec">分维度信号</h2>
  ${filters}
  <div class="signals-grid" id="signals">${cards || '<p class="empty-hint">本期暂无信号。</p>'}</div>
  <h2 class="sec">本期母题</h2>
  <p class="motif-line">${[...new Set(issue.signals.flatMap((s) => s.motif || []))].map((m) => `<a class="chip chip-d" href="../../motif/${esc(m)}/">${esc(MOTIFS.get(m)?.name || m)}</a>`).join('') || '<span class="empty-hint">本期信号未命中母题。</span>'}</p>
  <nav class="issue-nav">
    ${prev ? `<a href="../${esc(prev.issue)}/">← ${esc(prev.issue)}</a>` : '<span class="disabled">← 已是最早</span>'}
    ${next ? `<a href="../${esc(next.issue)}/">${esc(next.issue)} →</a>` : '<span class="disabled">已是最新 →</span>'}
  </nav>
</section>
<script>
document.querySelectorAll('.filters .tg').forEach(function(b){
  b.addEventListener('click',function(){
    var d=b.getAttribute('data-dim');
    document.querySelectorAll('.filters .tg').forEach(function(x){x.setAttribute('aria-pressed', x===b?'true':'false');});
    document.querySelectorAll('#signals .sig-wrap').forEach(function(w){
      w.hidden = !(d==='all' || w.getAttribute('data-dim')===d);
    });
  });
});
</script>`;
  return layout({ title: `第 ${issue.issue} 期简报 —— Tiaqi 情报站`, desc: `第 ${issue.issue} 期简报，共 ${issue.signals.length} 条信号。`, theme: 'intel', body, pre: '../../' });
}

function renderIntelLatest(issue) {
  const body = `<section class="brief"><p class="eyebrow">正在跳转到最新一期…</p>
  <p class="h1"><a href="${esc(issue.issue)}/">第 ${esc(issue.issue)} 期简报 →</a></p></section>`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8" />
<meta http-equiv="refresh" content="0; url=${esc(issue.issue)}/" />
<link rel="canonical" href="${esc(issue.issue)}/" />
<title>情报站 —— Tiaqi</title></head><body>${body}</body></html>`;
}

function renderArchive(all) {
  const rows = all.map((i) => `<li class="tl-item">
    <span class="tl-node" aria-hidden="true"></span>
    <a class="tl-issue mono" href="../${esc(i.issue)}/">${esc(i.issue)}</a>
    <span class="tl-body">${i.headline ? esc(i.headline) : '<span class="empty-hint">判断待补充</span>'}
    <span class="tl-meta mono">${i.signals.length} 信号 / ${new Set(i.signals.map((s) => s.dimension)).size} 维度</span></span>
  </li>`).join('');
  const body = `<section class="brief">
    <p class="eyebrow">ARCHIVE</p><h1 class="h1">情报归档</h1>
    <div class="beam wide" aria-hidden="true"></div>
    ${all.length ? `<ul class="timeline">${rows}</ul>` : '<div class="empty"><p class="empty-title">还没有已发布的简报</p><p class="empty-hint">首期简报将在下一次归集后生成。</p></div>'}
  </section>`;
  return layout({ title: '情报归档 —— Tiaqi', desc: '全部情报简报按期归档。', theme: 'intel', body, pre: '../../' });
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
    <p class="eyebrow">ARCHIVE</p>
    <h1 class="h1 serif">${esc(book?.bookTitle || '小说档案')}</h1>
    <div class="rule wide" aria-hidden="true"></div>
    ${chapters.length ? vols : '<div class="empty"><p class="empty-title">档案尚未开卷</p><p class="empty-hint">章节以 Markdown 管理，按卷发布。</p></div>'}
  </section>`;
  return layout({ title: `${book?.bookTitle || '小说档案'} —— Tiaqi`, desc: '按卷归档的章节目录。', theme: 'fiction', body, pre: '../' });
}

function renderChapter(c, chapters, all) {
  const i = chapters.findIndex((x) => x.slug === c.slug);
  const prev = chapters[i - 1], next = chapters[i + 1];
  const body = `<article class="chapter">
    <p class="eyebrow"><a href="../../">《${esc(c.bookTitle)}》 · 第 ${esc(c.volume)} 卷 · 第 ${pad2(c.chapter)} 章</a></p>
    <h1 class="h1 serif">${esc(c.title)}</h1>
    <p class="ch-info">${esc(c.published || '')} · ${esc(c.words || '')} 字 ${c.demo ? '<span class="badge-demo">示例章节</span>' : ''}</p>
    ${(c.motif || []).length ? `<p class="motif-line">母题 ${c.motif.map((m) => `<a class="chip chip-l" href="../../../motif/${esc(m)}/">${esc(MOTIFS.get(m)?.name || m)}</a>`).join('')}</p>` : ''}
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
  return layout({ title: `${c.title} · 《${c.bookTitle}》第 ${pad2(c.chapter)} 章 —— Tiaqi`, desc: c.synopsis || `${c.title}`, theme: 'fiction', body, pre: '../../../' });
}

function renderMotif(slug, all, chapters) {
  const m = MOTIFS.get(slug);
  const sig = all.flatMap((i) => i.signals.filter((s) => (s.motif || []).includes(slug)).map((s) => ({ ...s, issue: i.issue })));
  const chs = chapters.filter((c) => (c.motif || []).includes(slug));
  const body = `<section class="brief theme-paper">
    <p class="eyebrow">MOTIF</p>
    <h1 class="h1 serif">${esc(m.name)}</h1>
    <div class="rule wide" aria-hidden="true"></div>
    <p class="standfirst">${esc(m.gloss)}</p>
    <h2 class="sec">现实侧 · ${sig.length} 条信号</h2>
    ${sig.length ? `<div class="signals-grid cols-1">${sig.slice(0, 12).map((s) => signalCard(s, '../../motif/')).join('')}</div>` : '<p class="empty-hint">该母题暂无情报信号。</p>'}
    <h2 class="sec">虚构侧 · ${chs.length} 章</h2>
    ${chs.length ? `<ol class="chapter-list">${chs.map((c) => `<li><a href="../../fiction/${esc(c.slug)}/"><span class="ch-no mono">${pad2(c.chapter)}</span><span class="ch-title">${esc(c.title)}</span></a></li>`).join('')}</ol>` : '<p class="empty-hint">该母题暂无小说映照。</p>'}
  </section>`;
  return layout({ title: `母题 ${m.name} —— Tiaqi`, desc: m.gloss, theme: 'fiction', body, pre: '../../' });
}

function renderFeed(issue, chapters) {
  const items = [
    ...(issue?.signals || []).map((s) => `<item><title>${esc(s.title)}</title><link>${esc(s.url)}</link><pubDate>${new Date(s.date).toUTCString()}</pubDate><description>${esc(s.source)} · ${esc(cfg.dimensions[s.dimension]?.label || s.dimension)}</description></item>`),
    ...chapters.map((c) => `<item><title>《${esc(c.bookTitle)}》第 ${pad2(c.chapter)} 章 · ${esc(c.title)}</title><link>https://www.tiaqi.com/fiction/${esc(c.slug)}/</link><pubDate>${new Date(c.published || Date.now()).toUTCString()}</pubDate><description>${esc(c.synopsis || '')}</description></item>`)
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<title>Tiaqi · 天启</title><link>https://www.tiaqi.com/</link>
<description>情报站与小说档案的双线站点</description><language>zh-CN</language>
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
  } catch {}
}
fs.writeFileSync(file, JSON.stringify(issue, null, 2));

const allIssues = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
  .sort((a, b) => b.issue.localeCompare(a.issue));

console.log('生成页面…');
write('index.html', renderHome(allIssues[0], chapters));
write('feed.xml', renderFeed(allIssues[0], chapters));
for (const i of allIssues) write(`intel/${i.issue}/index.html`, renderBriefing(i, allIssues));
write('intel/index.html', renderIntelLatest(allIssues[0]));
write('intel/archive/index.html', renderArchive(allIssues));
write('fiction/index.html', renderFictionIndex(chapters));
for (const c of chapters) write(`fiction/${c.slug}/index.html`, renderChapter(c, chapters, allIssues));
for (const m of MOTIFS.values()) write(`motif/${m.slug}/index.html`, renderMotif(m.slug, allIssues, chapters));
console.log('完成。');
