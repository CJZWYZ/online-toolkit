/* ============================================================
   天光 · Skylight —— 纯前端仪表盘逻辑
   纯前端 · 免费开源 API · 无密钥 · 无构建步骤

   目录：
     1  环境与小工具
     2  IP 定位（四级兜底 + 6s 总预算）
     3  天气（Open-Meteo）
     4  日历 / 农历 / 节气 / 节假日
     5  百科 · 历史上的今天 + 热点新闻
     6  搜索（Fuse.js + 键盘导航 + 搜索引擎小窗）
     7  访问统计 + 曲线（countTo / IntersectionObserver）
     8  抽屉（拖拽变量化 / 桌面禁用）
     9  特效：入场落终态 / 指针天光 / 涟漪 / 骨架 / Toast
     10 欢迎页与初始化
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     1 · 环境与小工具
     ============================================================ */
  const $ = (id) => document.getElementById(id);
  const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  const pad2 = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* 媒体查询：集中管理，避免散落魔法字符串 */
  const MQ = {
    reduce: matchMedia("(prefers-reduced-motion: reduce)"),
    mobile: matchMedia("(max-width: 767px)"),
    hover:  matchMedia("(hover: hover) and (pointer: fine)"),
    wide:  matchMedia("(min-width: 1024px)"),
    coarse: matchMedia("(pointer: coarse)")
  };
  const isEco = () => document.documentElement.dataset.perf === "eco";

  /* 带超时的 fetch（默认 5s） */
  function fetchJSON(url, ms = 5000) {
    return new Promise((resolve, reject) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      fetch(url, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then((j) => { clearTimeout(t); resolve(j); })
        .catch((e) => { clearTimeout(t); reject(e); });
    });
  }
  function debounce(fn, ms) {
    let t = 0;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  /* —— Toast（轻量提示，用于"百科失败时点卡片"等静默失败场景） —— */
  let toastTimer = 0;
  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  /* —— 独立 live region：只播报"找到 N 条结果"，300ms 去抖 —— */
  let announceTimer = 0;
  function announce(msg) {
    const box = $("sr-status");
    if (!box) return;
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { box.textContent = msg || ""; }, 300);
  }

  /* ============================================================
     2 · IP 定位（ipwho.is → ipapi.co → 搜狐 script → 太平洋 JSONP）
     ============================================================ */
  function loadScript(src, ms = 5000) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      const t = setTimeout(() => { s.remove(); rej(new Error("timeout")); }, ms);
      s.onload = () => { clearTimeout(t); res(); };
      s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error("fail")); };
      s.src = src;
      document.head.appendChild(s);
    });
  }
  async function geocodeCity(name) {
    try {
      const j = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&language=zh&count=1&format=json`, 5000);
      const r = j && j.results && j.results[0];
      if (r && r.latitude != null) return { lat: r.latitude, lon: r.longitude, tz: r.timezone || tz() };
    } catch (e) {}
    return null;
  }
  /* 四级源本身（不含总预算） */
  async function geoSources() {
    /* 1) ipwho.is（CORS 开放，含经纬度） */
    try {
      const d = await fetchJSON("https://ipwho.is/", 3000);
      if (d && d.success !== false && d.latitude != null) {
        const city = [d.city, d.country].filter(Boolean).join(" · ") || "未知位置";
        return { lat: +d.latitude, lon: +d.longitude, city, ip: d.ip || "",
                 tz: (d.timezone && d.timezone.id) || tz() };
      }
    } catch (e) {}
    /* 2) ipapi.co（规格指定兜底） */
    try {
      const d = await fetchJSON("https://ipapi.co/json/", 3000);
      if (d && d.latitude != null) {
        const city = [d.city, d.country_name].filter(Boolean).join(" · ") || "未知位置";
        return { lat: +d.latitude, lon: +d.longitude, city, ip: d.ip || "", tz: d.timezone || tz() };
      }
    } catch (e) {}
    /* 3) 搜狐 cityjson（script 注入，返回 returnCitySN = {cip, cname}） */
    try {
      await loadScript("https://pv.sohu.com/cityjson?ie=utf-8", 3000);
      const sn = window.returnCitySN;
      if (sn && sn.cname && sn.cname !== "未知") {
        const cn = String(sn.cname).replace(/省|市/g, "");
        const g = await geocodeCity(cn);
        return { lat: g ? g.lat : null, lon: g ? g.lon : null,
                 city: String(sn.cname), ip: sn.cip || "", tz: g ? g.tz : tz() };
      }
    } catch (e) {}
    /* 4) 太平洋电脑网 JSONP（返回 {ip, pro, city}） */
    try {
      const cb = "_tiaqiGeo" + Date.now();
      const got = new Promise((res, rej) => {
        window[cb] = (d) => res(d);
        setTimeout(() => rej(new Error("timeout")), 3000);
      });
      await loadScript(`https://whois.pconline.com.cn/ipJson.jsp?callback=${cb}`, 3000);
      const d = await got;
      if (d && (d.city || d.pro)) {
        const cn = String(d.city || d.pro).replace(/省|市/g, "");
        const g = await geocodeCity(cn);
        const label = [d.pro, d.city].filter((v, i, a) => v && a.indexOf(v) === i).join(" ");
        return { lat: g ? g.lat : null, lon: g ? g.lon : null,
                 city: label || "未知位置", ip: d.ip || "", tz: g ? g.tz : tz() };
      }
    } catch (e) {}
    return { lat: null, lon: null, city: "未知位置", ip: "", tz: tz() };
  }
  /* 定位总预算 6s（Promise.race 封顶）；离线立即降级 */
  const GEO_BUDGET = 6000;
  async function getGeo() {
    if (navigator.onLine === false) {
      return { lat: null, lon: null, city: "离线", ip: "", tz: tz() };
    }
    let timer = 0;
    const cap = new Promise((res) => { timer = setTimeout(() => res(null), GEO_BUDGET); });
    try {
      const r = await Promise.race([geoSources(), cap]);
      clearTimeout(timer);
      return r || { lat: null, lon: null, city: "定位超时", ip: "", tz: tz() };
    } catch (e) {
      clearTimeout(timer);
      return { lat: null, lon: null, city: "未知位置", ip: "", tz: tz() };
    }
  }

  /* ============================================================
     3 · 天气（Open-Meteo，免密钥）
     ============================================================ */
  const WMO = {
    0: { d: "晴", i: "sun" }, 1: { d: "晴间多云", i: "suncloud" }, 2: { d: "多云", i: "cloud" },
    3: { d: "阴", i: "cloud" }, 45: { d: "雾", i: "fog" }, 48: { d: "雾凇", i: "fog" },
    51: { d: "毛毛雨", i: "rain" }, 53: { d: "毛毛雨", i: "rain" }, 55: { d: "毛毛雨", i: "rain" },
    56: { d: "冻毛毛雨", i: "rain" }, 57: { d: "冻毛毛雨", i: "rain" },
    61: { d: "小雨", i: "rain" }, 63: { d: "中雨", i: "rain" }, 65: { d: "大雨", i: "rain" },
    66: { d: "冻雨", i: "rain" }, 67: { d: "冻雨", i: "rain" },
    71: { d: "小雪", i: "snow" }, 73: { d: "中雪", i: "snow" }, 75: { d: "大雪", i: "snow" }, 77: { d: "雪粒", i: "snow" },
    80: { d: "阵雨", i: "rain" }, 81: { d: "阵雨", i: "rain" }, 82: { d: "强阵雨", i: "rain" },
    85: { d: "阵雪", i: "snow" }, 86: { d: "阵雪", i: "snow" },
    95: { d: "雷阵雨", i: "thunder" }, 96: { d: "雷阵雨伴冰雹", i: "thunder" }, 99: { d: "雷阵雨伴冰雹", i: "thunder" }
  };
  /* 图标内的 <g> 带 class，微动效全部由 CSS 驱动（不用 SMIL） */
  function weatherSVG(type) {
    const cloud = `<path d="M13 28 a8 8 0 0 1 1 -16 a11 11 0 0 1 21 2 a7 7 0 0 1 1 14 Z" fill="rgba(255,255,255,0.12)" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`;
    const sunCore = `<circle class="wi-sun" cx="16" cy="16" r="6" stroke="currentColor" stroke-width="2.4"/>`;
    const sunRays = `<g class="wi-rays" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M16 4 V8"/><path d="M5 16 H9"/><path d="M8 8 L11 11"/><path d="M24 8 L21 11"/></g>`;
    const O = `<svg viewBox="0 0 48 48" width="54" height="54"><g class="wi-float">`, C = `</g></svg>`;
    switch (type) {
      case "sun":
        return `${O}<circle class="wi-sun" cx="24" cy="24" r="9" stroke="currentColor" stroke-width="3"/>` +
          `<g class="wi-rays" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M24 6 V11"/><path d="M24 37 V42"/><path d="M6 24 H11"/><path d="M37 24 H42"/><path d="M11 11 L15 15"/><path d="M33 33 L37 37"/><path d="M37 11 L33 15"/><path d="M15 33 L11 37"/></g>${C}`;
      case "suncloud": return `${O}${sunCore}${sunRays}${cloud}${C}`;
      case "cloud":    return `${O}${cloud}${C}`;
      case "fog":      return `${O}${cloud}<g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 38 H34"/><path d="M16 43 H30"/></g>${C}`;
      case "rain":     return `${O}${cloud}<g stroke-linecap="round" stroke-width="3"><path class="wi-drop" d="M17 32 L15 39"/><path class="wi-drop" d="M25 32 L23 39"/><path class="wi-drop" d="M33 32 L31 39"/></g>${C}`;
      case "snow":     return `${O}${cloud}<g><circle class="wi-flake" cx="17" cy="36" r="1.8"/><circle class="wi-flake" cx="25" cy="39" r="1.8"/><circle class="wi-flake" cx="33" cy="36" r="1.8"/></g>${C}`;
      case "thunder":  return `${O}${cloud}<path class="wi-bolt" d="M25 30 L20 40 L25 40 L22 47" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${C}`;
      default:         return `${O}${cloud}${C}`;
    }
  }
  async function fetchWeather(lat, lon) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
      const j = await fetchJSON(url, 5000);
      const c = j.current;
      const info = WMO[c.weather_code] || { d: "未知", i: "cloud" };
      $("w-ico").innerHTML = weatherSVG(info.i);
      $("w-ico").style.opacity = "";
      countTo($("w-temp"), Math.round(c.temperature_2m), 180);
      $("w-desc").textContent = info.d;
      countTo($("w-feel"), Math.round(c.apparent_temperature), 180);
      $("w-wind").textContent = Math.round(c.wind_speed_10m) + " km/h";
      $("w-err").hidden = true;
    } catch (e) {
      $("w-desc").textContent = "天气暂不可用";
      $("w-ico").style.opacity = ".3";
      $("w-err").hidden = false;
    }
  }

  /* ============================================================
     4 · 日历 / 农历 / 节气 / 节假日
     ============================================================ */
  const WK = ["日", "一", "二", "三", "四", "五", "六"];
  let activeSheet = null, highlightIso = null;

  function renderCalendarCard() {
    const cd = window.chineseDays;
    const now = new Date();
    const wd = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][now.getDay()];
    $("cal-greg").textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${wd}`;
    if (!cd) { $("cal-lunar").textContent = "农历（加载失败）"; return; }
    const L = cd.getLunarDate(now);
    $("cal-lunar").textContent = `农历 ${L.lunarMonCN}${L.lunarDayCN} · ${L.zodiac}年`;
    const tags = [];
    const det = cd.getDayDetail(now);
    if (det.name && det.name.includes(",")) {
      const cn = det.name.split(",")[1];
      tags.push(det.work ? ["work", "调休上班 · " + cn] : ["holiday", cn]);
    }
    const terms = cd.getSolarTermsInRange(now, now);
    if (terms.length) tags.push(["term", terms[0].name]);
    $("cal-tags").innerHTML = tags.map(([c, t]) => `<span class="cal-tag ${c}">${t}</span>`).join("");
  }
  function renderCalendarSheet(view) {
    const cd = window.chineseDays;
    const y = view.getFullYear(), m = view.getMonth();
    const now = new Date();
    const isCur = y === now.getFullYear() && m === now.getMonth();
    $("cal-title").textContent = `${y}年${m + 1}月`;
    const days = new Date(y, m + 1, 0).getDate();
    const startDay = new Date(y, m, 1).getDay();
    const monthTerms = {};
    if (cd) {
      cd.getSolarTerms(new Date(y, 0, 1), new Date(y, 11, 31)).forEach((t) => {
        const [ty, tm] = t.date.split("-").map(Number);
        if (ty === y && tm === m + 1) monthTerms[t.date] = t.name;
      });
    }
    let html = WK.map((w) => `<div class="wk">${w}</div>`).join("");
    for (let i = 0; i < startDay; i++) html += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d);
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      let cls = "cal-cell", lunar = "", term = monthTerms[iso];
      if (isCur && d === now.getDate()) cls += " today";
      if (cd) {
        lunar = cd.getLunarDate(date).lunarDayCN;
        const det = cd.getDayDetail(date);
        if (det.name && det.name.includes(",")) cls += det.work ? " work" : " holiday";
        if (term) cls += " term";
      }
      if (iso === highlightIso) cls += " sel";
      html += `<div class="${cls}" data-iso="${iso}"><span>${d}</span>${lunar ? `<span class="lunar">${lunar}</span>` : ""}</div>`;
    }
    $("cal-grid").innerHTML = html;
  }

  /* ============================================================
     5 · 百科 · 历史上的今天 + 热点新闻
     ============================================================ */
  let wikiCurrent = null;
  function extractEvents(j) {
    let arr = null;
    const find = (v) => {
      if (arr || !v || typeof v !== "object") return;
      if (Array.isArray(v)) {
        if (v.length && v[0] && typeof v[0] === "object" && !Array.isArray(v[0])) arr = v;
        return;
      }
      Object.values(v).forEach(find);
    };
    find(j);
    if (!arr) return [];
    const pick = (o, keys) => { for (const k of keys) if (o[k]) return String(o[k]); return ""; };
    return arr.map((o) => {
      const year = pick(o, ["year", "time", "date"]);
      const text = pick(o, ["title", "content", "text", "event", "desc", "detail", "info"]);
      const title = pick(o, ["title", "name"]);
      return { year: /^\d{3,4}$/.test(year) ? year : "", text, pages: title ? [{ title }] : [] };
    }).filter((e) => e.text);
  }
  async function loadWiki() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const tryLoad = async (lang) => {
      const url = `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`;
      const j = await fetchJSON(url, 5000);
      return (j && j.events) || [];
    };
    let evs = [];
    /* 国内可达源优先：60s API → 韩小韩 → oioweb → Wikipedia */
    try {
      const j = await fetchJSON("https://60s.viki.moe/v2/today_in_history", 5000);
      const items = j && j.data && j.data.items;
      if (Array.isArray(items) && items.length) {
        evs = items.map((it) => ({
          year: /^\d{3,4}$/.test(String(it.year)) ? String(it.year) : "",
          text: String(it.description || it.title || "").replace(/\[\d+\]/g, ""),
          title: String(it.title || ""),
          link: it.link || "",
          pages: it.title ? [{ title: String(it.title) }] : []
        }));
      }
    } catch (e) {}
    if (!evs.length) { try { evs = extractEvents(await fetchJSON("https://api.vvhan.com/api/history", 5000)); } catch (e) {} }
    if (!evs.length) { try { evs = extractEvents(await fetchJSON("https://api.oioweb.cn/api/common/HistoryToday", 5000)); } catch (e) {} }
    if (!evs.length) { try { evs = await tryLoad("zh"); } catch (e) {} }
    if (!evs.length) { try { evs = await tryLoad("en"); } catch (e) {} }

    const titleEl = $("wiki-title"), textEl = $("wiki-text");
    if (!evs.length) {
      clearSkeleton(titleEl, () => { titleEl.textContent = "暂无内容"; });
      clearSkeleton(textEl, () => { textEl.textContent = "百科内容暂时无法加载"; });
      return;
    }
    const pool = evs.slice(0, 24);
    const ev = pool[Math.floor(Math.random() * pool.length)];
    wikiCurrent = ev;
    clearSkeleton(titleEl, () => {
      titleEl.textContent = ev.year ? `${ev.year} 年 · 历史上的今天` : "历史上的今天";
    });
    clearSkeleton(textEl, () => {
      const txt = (ev.text || "").slice(0, 300);
      textEl.textContent = txt + ((ev.text || "").length > 300 ? "…" : "");
    });
    buildWikiIndex(evs);
  }
  async function loadNews() {
    const list = $("wn-list");
    if (!list) return;
    showSkeleton(list, 4);
    try {
      const j = await fetchJSON("https://60s.viki.moe/v2/60s", 6000);
      const news = (j && j.data && j.data.news) || [];
      clearSkeleton(list, () => {
        if (!news.length) { list.innerHTML = `<p class="wn-loading">暂无热点新闻</p>`; return; }
        list.innerHTML = news.slice(0, 8).map((s, i) => {
          const q = encodeURIComponent(String(s).trim());
          return `<a class="wn-item" data-q="${q}" href="https://www.bing.com/search?q=${q}" target="_blank" rel="noopener">` +
            `<span class="wn-i">${i + 1}</span><span class="wn-t">${esc(s)}</span></a>`;
        }).join("");
      });
    } catch (e) {
      /* 失败态必须可恢复（Nielsen：帮助用户识别、诊断并从错误中恢复）；空态不给重试 */
      clearSkeleton(list, () => {
        list.innerHTML = `<p class="wn-loading">热点新闻加载失败 <button type="button" class="wn-retry">重试</button></p>`;
      });
    }
  }
  function openWikiDrawer(ev) {
    if (!ev) return;
    const page = ev.pages && ev.pages[0];
    $("wiki-sheet-title").textContent = (page && page.title) ? page.title : "历史上的今天";
    $("wiki-body").textContent = (ev.text || "") + (ev.year ? `\n\n—— ${ev.year} 年` : "");
    const img = $("wiki-img");
    if (page && page.thumbnail && page.thumbnail.source) { img.src = page.thumbnail.source; img.hidden = false; }
    else img.hidden = true;
    const link = $("wiki-link");
    const href = (page && page.content_urls && page.content_urls.desktop && page.content_urls.desktop.page) || ev.link || "";
    if (href) { link.href = href; link.hidden = false; } else link.hidden = true;
    openSheet("wiki");
  }

  /* ============================================================
     6 · 搜索（Fuse.js + 键盘导航 + 搜索引擎小窗）
     ============================================================ */
  const TERMS_CN = ["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"];
  const HOLIDAYS_CN = ["元旦","春节","清明节","劳动节","端午节","中秋节","国庆节","元宵节","重阳节","情人节","儿童节","妇女节","青年节","教师节","植树节","建军节","建党节","抗战胜利日","母亲节","父亲节"];
  const CITIES = ["北京","上海","广州","深圳","成都","杭州","西安","武汉","南京","重庆","天津","苏州","长沙","青岛","厦门","香港","台北","哈尔滨","昆明","大连"];

  let searchItems = [], fuse = null, lastResults = [], hlIndex = -1;
  function buildBaseIndex() {
    searchItems = [
      { type: "weather", key: "温度", label: "实时气温", action: "pulse" },
      { type: "weather", key: "天气", label: "当前天气状况", action: "pulse" },
      { type: "weather", key: "体感", label: "体感温度", action: "pulse" },
      { type: "weather", key: "风速", label: "风速 / 风力", action: "pulse" },
      ...TERMS_CN.map((t) => ({ type: "calendar", key: t, label: "节气 · " + t, action: "openCalendar" })),
      ...HOLIDAYS_CN.map((t) => ({ type: "calendar", key: t, label: "节日 · " + t, action: "openCalendar" })),
      ...CITIES.map((c) => ({ type: "city", key: c, label: "城市天气 · " + c, action: "loadCity" }))
    ];
  }
  function buildWikiIndex(evs) {
    evs.slice(0, 40).forEach((ev) => {
      const page = ev.pages && ev.pages[0];
      if (!page) return;
      searchItems.push({
        type: "wiki", key: page.title, label: page.title,
        snippet: (ev.text || "").slice(0, 60), action: "openWiki", ev
      });
    });
    rebuildFuse();
  }
  function rebuildFuse() {
    if (typeof Fuse === "undefined") {
      /* Fuse 缺失时不再隐藏整个搜索框：保留输入框，仅改提示文案 */
      const inp = $("search-input");
      if (inp) inp.placeholder = "搜索暂不可用";
      return;
    }
    fuse = new Fuse(searchItems, { keys: ["key", "label", "snippet"], threshold: 0.4, ignoreLocation: true });
  }
  const typeLabel = (t) => (t === "weather" ? "天气" : t === "calendar" ? "日历" : t === "city" ? "城市" : "百科");
  function renderSearchResults(q) {
    const box = $("search-results");
    clearHighlight();
    if (!q) {
      box.innerHTML = `<p class="search-empty">输入关键词，实时检索天气、节气与百科</p>`;
      lastResults = []; announce(""); return;
    }
    if (!fuse) {
      box.innerHTML = `<p class="search-empty">搜索暂不可用</p>`;
      lastResults = []; announce("搜索暂不可用"); return;
    }
    const res = fuse.search(q).slice(0, 8);
    if (!res.length) {
      box.innerHTML = `<p class="search-empty">未找到匹配结果</p>`;
      lastResults = []; announce("未找到匹配结果"); return;
    }
    lastResults = res.map((r) => r.item);
    box.innerHTML = lastResults.map((it, i) => {
      const tc = it.type === "calendar" ? "cal" : it.type === "wiki" ? "wiki" : "";
      return `<div class="search-item" id="si-${i}" data-i="${i}" role="option" aria-selected="false">
        <span class="si-bar" aria-hidden="true"></span>
        <span class="si-type ${tc}">${typeLabel(it.type)}</span>
        <span class="si-label">${esc(it.label)}</span>
        ${it.snippet ? `<span class="si-snippet">${esc(it.snippet)}</span>` : ""}
      </div>`;
    }).join("");
    announce(`找到 ${lastResults.length} 条结果`);
  }
  /* —— 键盘高亮：↑↓ 循环；高亮含左侧竖条（非颜色线索）；hover 不改写 aria-selected —— */
  function setHighlight(i) {
    const items = Array.prototype.slice.call($("search-results").querySelectorAll(".search-item"));
    if (!items.length) { clearHighlight(); return; }
    hlIndex = ((i % items.length) + items.length) % items.length;
    items.forEach((el, k) => {
      const on = k === hlIndex;
      el.classList.toggle("hl", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("search-input").setAttribute("aria-activedescendant", "si-" + hlIndex);
    if (items[hlIndex].scrollIntoView) items[hlIndex].scrollIntoView({ block: "nearest" });
  }
  function clearHighlight() {
    hlIndex = -1;
    const items = $("search-results").querySelectorAll(".search-item.hl, .search-item[aria-selected='true']");
    Array.prototype.forEach.call(items, (el) => {
      el.classList.remove("hl");
      el.setAttribute("aria-selected", "false");
    });
    $("search-input").removeAttribute("aria-activedescendant");
  }
  function onSearchSelect(it) {
    if (!it) return;
    if (it.type === "weather") pulseWeather();
    else if (it.type === "calendar") openCalendarToTerm(it.key);
    else if (it.type === "city") loadCityWeather(it.key);
    else if (it.type === "wiki" && it.ev) openWikiDrawer(it.ev);
    closeSearch();
  }
  function openCalendarToTerm(name) {
    const cd = window.chineseDays, y = new Date().getFullYear();
    let target = null;
    if (cd) {
      const t = cd.getSolarTerms(new Date(y, 0, 1), new Date(y, 11, 31)).find((x) => x.name === name);
      if (t) target = t.date;
    }
    if (target) { highlightIso = target; const [yy, mm] = target.split("-").map(Number); renderCalendarSheet(new Date(yy, mm - 1, 1)); }
    else { highlightIso = null; renderCalendarSheet(new Date()); }
    openSheet("cal");
  }
  function pulseWeather() {
    const w = $("weather");
    w.classList.remove("pulse"); void w.offsetWidth; w.classList.add("pulse");
    setTimeout(() => w.classList.remove("pulse"), 700);
  }
  async function loadCityWeather(city) {
    try {
      const g = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&language=zh&count=1&format=json`, 5000);
      const r = g.results && g.results[0];
      if (!r) return;
      $("w-city").textContent = r.name + (r.country ? " · " + r.country : "");
      $("w-ip").textContent = `城市 · ${r.name}`;
      fetchWeather(r.latitude, r.longitude);
    } catch (e) {}
  }
  function openSearch() {
    $("search").classList.add("open");
    $("search-input").setAttribute("aria-expanded", "true");
  }
  function closeSearch() {
    $("search").classList.remove("open");
    $("search-input").setAttribute("aria-expanded", "false");
    clearHighlight();
  }
  /* 在搜索引擎打开结果；移动端改同标签跳转（popup 在移动端体验差） */
  let _lastOpenUrl = "", _lastOpenAt = 0;
  function openSearchEngine(q, engine) {
    q = (q || "").trim();
    if (!q) return;
    const u = engine === "baidu"
      ? `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`
      : engine === "news"
        ? `https://www.baidu.com/s?wd=${encodeURIComponent(q)}&tn=news`
        : `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
    const now = Date.now();
    if (u === _lastOpenUrl && now - _lastOpenAt < 600) return; /* 去抖，避免单次手势重复弹窗 */
    _lastOpenUrl = u; _lastOpenAt = now;
    if (MQ.mobile.matches || MQ.coarse.matches) { window.location.href = u; return; }
    const w = window.open(u, "_blank", "popup,noopener,width=520,height=780,left=240,top=80");
    if (!w) window.open(u, "_blank", "noopener"); /* 弹窗被拦截时退回新标签页 */
  }

  /* ============================================================
     7 · 访问统计 + 曲线
     ============================================================ */
  /* —— 数字滚动：--e-expo；reduced-motion / 无效值直接赋值 —— */
  function countTo(el, to, ms) {
    if (!el) return;
    const n = Number(to);
    if (!Number.isFinite(n)) { el.textContent = "—"; return; }
    const parsed = parseFloat(String(el.textContent).replace(/[^0-9.\-]/g, ""));
    const from = Number.isFinite(parsed) ? parsed : 0;
    if (MQ.reduce.matches || !ms || ms <= 0 || from === n) {
      cancelAnimationFrame(+(el.dataset.raf || 0));
      el.textContent = Math.round(n).toLocaleString();
      return;
    }
    cancelAnimationFrame(+(el.dataset.raf || 0));
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 4);            /* --e-expo */
      el.textContent = Math.round(from + (n - from) * e).toLocaleString();
      if (p < 1) el.dataset.raf = requestAnimationFrame(step);
      else { el.textContent = Math.round(n).toLocaleString(); el.dataset.raf = ""; }
    };
    el.dataset.raf = requestAnimationFrame(step);
  }

  let chartIO = null, lastTs = [], lastChartW = 0;
  function armChart(svg) {
    if (!svg) return;
    if (MQ.reduce.matches || !("IntersectionObserver" in window)) { svg.classList.add("go"); return; }
    if (!chartIO) {
      chartIO = new IntersectionObserver((ents) => {
        ents.forEach((en) => {
          /* 尚未进入主页时先不播，等 enterHome 里补播，避免动画在欢迎页背后空跑 */
          if (en.isIntersecting && document.body.dataset.ready === "1") {
            en.target.classList.add("go");
            chartIO.unobserve(en.target);
          }
        });
      }, { threshold: 0.25 });
    }
    chartIO.observe(svg);
  }
  /* 进入主页时补播：曲线若已在视口内则立即生长 */
  function flushChart() {
    const svg = document.querySelector(".vc-svg");
    if (!svg || svg.classList.contains("go")) return;
    const r = svg.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) svg.classList.add("go");
  }
  /* 修正原 preserveAspectRatio="none" 导致的描边/文字拉伸：
     viewBox 宽高比按实际渲染尺寸计算 + non-scaling-stroke + 日期标签移出 SVG */
  function renderVisitChart(ts, animate) {
    const box = $("visit-chart");
    if (!box) return;
    lastTs = ts || [];
    if (!lastTs.length) {
      box.innerHTML = `<p class="wn-loading">暂无访问记录</p>`;
      box.setAttribute("aria-label", "最近 7 天访问记录，暂无数据");
      return;
    }
    const days = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(d.getDate() - i);
      days.push({ key: d.getTime(), label: `${d.getMonth() + 1}/${d.getDate()}`, full: `${d.getMonth() + 1}月${d.getDate()}日`, count: 0 });
    }
    const map = new Map(days.map((x) => [x.key, x]));
    lastTs.forEach((t) => {
      const k = new Date(t); k.setHours(0, 0, 0, 0);
      const c = map.get(k.getTime()); if (c) c.count++;
    });
    const counts = days.map((x) => x.count);
    const max = Math.max(1, ...counts);
    const min = Math.min(...counts);
    const hiIdx = counts.indexOf(max), loIdx = counts.indexOf(min);

    /* viewBox 与渲染盒同比例 → 无需 preserveAspectRatio="none" 也不变形 */
    const cw = Math.max(240, Math.round(box.clientWidth || 300));
    const plotH = parseFloat(getComputedStyle(box).getPropertyValue("--plot-h")) || 48;
    const chh = Math.max(40, plotH);
    const H = 84;
    const W = Math.round(H * cw / chh);
    lastChartW = cw;

    const pad = 8, n = counts.length, bw = (W - pad * 2) / n;
    const xy = (i) => [pad + bw * i + bw / 2, H - pad - (counts[i] / max) * (H - pad * 2 - 10)];
    const pts = counts.map((_, i) => xy(i));
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = line + ` L ${pts[n - 1][0].toFixed(1)} ${H - pad} L ${pts[0][0].toFixed(1)} ${H - pad} Z`;
    const bars = counts.map((c, i) => {
      const x = pad + bw * i + bw * 0.2, w = bw * 0.6;
      const y = H - pad - (c / max) * (H - pad * 2 - 10);
      return `<rect class="vc-bar" style="--n:${i}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, H - pad - y).toFixed(1)}" rx="2"/>`;
    }).join("");
    /* 半径按 viewBox 单位给足：绘图区实际只有 ~48–68px，缩放后仍 >2px */
    const nodes = pts.map((p, i) => `<circle class="vc-node" style="--n:${i}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.6"/>`).join("");
    const axis = days.map((d) => `<span>${d.label}</span>`).join("");

    box.innerHTML =
      `<svg class="vc-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">` +
        `<defs><linearGradient class="vc-grad" id="vcg" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0%" stop-opacity="0.30"/>` +
          `<stop offset="100%" stop-opacity="0.02"/>` +
        `</linearGradient></defs>` +
        `${bars}<path class="vc-area" d="${area}"/>` +
        `<path class="vc-line" d="${line}" vector-effect="non-scaling-stroke"/>${nodes}` +
      `</svg><div class="vc-axis">${axis}</div>`;

    box.setAttribute("role", "img");
    box.setAttribute("aria-label",
      `最近 7 天访问记录，${days[hiIdx].full}最高 ${max} 次，${days[loIdx].full}最低 ${min} 次`);

    const svg = box.querySelector(".vc-svg");
    const path = box.querySelector(".vc-line");
    try { svg.style.setProperty("--len", path.getTotalLength().toFixed(1)); } catch (e) {}
    if (animate === false) svg.classList.add("go");
    else armChart(svg);
  }
  async function updateVisit() {
    const numEl = $("visit-num"), localEl = $("visit-local-num"), subEl = $("visit-sub");
    const local = (parseInt(localStorage.getItem("tiaqi_visits") || "0", 10) + 1);
    localStorage.setItem("tiaqi_visits", local);
    countTo(localEl, local, 520);                  /* 首屏 520ms */
    let ts = [];
    try { ts = JSON.parse(localStorage.getItem("tiaqi_visits_ts") || "[]"); } catch (e) {}
    ts.push(Date.now());
    if (ts.length > 200) ts = ts.slice(-200);
    localStorage.setItem("tiaqi_visits_ts", JSON.stringify(ts));
    const last = new Date(ts[ts.length - 1]);
    subEl.textContent = `最近访问 ${pad2(last.getHours())}:${pad2(last.getMinutes())}`;
    renderVisitChart(ts, true);
    try {
      const j = await fetchJSON("https://abacus.jasoncameron.dev/hit/tiaqi/visits", 5000);
      if (j && typeof j.value === "number") countTo(numEl, j.value, 520);
      else numEl.textContent = "—";
    } catch (e) { numEl.textContent = "—"; }
  }

  /* ============================================================
     8 · 抽屉
     ============================================================ */
  const INERT_OK = typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype;
  let lastFocused = null;
  function setInert(on) {
    if (!INERT_OK) return;
    [$("home"), document.querySelector(".topbar")].forEach((el) => {
      if (!el) return;
      if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert");
    });
  }
  function openSheet(which) {
    const sheet = which === "cal" ? $("cal-sheet") : $("wiki-sheet");
    if (!sheet || activeSheet === sheet) return;
    settleEntrance();                                  /* 入场立即落终态，避免与舞台后退打架 */
    lastFocused = document.activeElement;
    if (which === "cal") $("cal-card").setAttribute("aria-expanded", "true");
    else $("wiki-card").setAttribute("aria-expanded", "true");
    sheet.hidden = false;
    setInert(true);
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("open")));
    document.body.classList.add("sheet-open");
    activeSheet = sheet;
    const focusTarget = sheet.querySelector(".close-btn") || sheet;
    setTimeout(() => { try { focusTarget.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function closeSheet() {
    if (!activeSheet) return;
    const s = activeSheet; activeSheet = null; highlightIso = null;
    s.classList.remove("open", "dragging");
    s.style.setProperty("--drag", "0px");
    document.body.classList.remove("sheet-open");
    $("cal-card").setAttribute("aria-expanded", "false");
    $("wiki-card").setAttribute("aria-expanded", "false");
    setInert(false);
    setTimeout(() => { s.hidden = true; }, 420);
    if (lastFocused && lastFocused.focus) {
      try { lastFocused.focus({ preventScroll: true }); } catch (e) {}
    }
    lastFocused = null;
  }
  /* —— 拖拽：只写 --drag 变量；桌面端禁用；阈值改绝对像素 —— */
  function bindDrag(sheet) {
    if (!sheet) return;
    let startY = 0, dy = 0, dragging = false, lastY = 0, lastT = 0, v = 0, fromGrab = false;

    const down = (e) => {
      if (!MQ.mobile.matches) return;                       /* 桌面端禁用拖拽 */
      if (e.target.closest("button, a, input, textarea")) return;
      fromGrab = !!e.target.closest(".sheet-grab, .sheet-head");
      /* 仅在「内容已置顶」或按在手柄/标题栏上才启动，避免抢 sheet 内滚动 */
      if (!fromGrab && sheet.scrollTop > 0) return;
      dragging = true; startY = e.clientY; dy = 0;
      lastY = e.clientY; lastT = performance.now(); v = 0;
      sheet.classList.add("dragging");
      try { sheet.setPointerCapture(e.pointerId); } catch (_) {}
    };
    const move = (e) => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      const now = performance.now(), dt = now - lastT || 16;
      v = (e.clientY - lastY) / dt; lastY = e.clientY; lastT = now;
      sheet.style.setProperty("--drag", dy + "px");
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("dragging");                   /* 先恢复过渡，再回弹 */
      if (dy > 96 || (dy > 48 && v > 0.45)) closeSheet();    /* 绝对像素阈值 */
      else sheet.style.setProperty("--drag", "0px");
      dy = 0;
    };
    const attach = () => {
      sheet.addEventListener("pointerdown", down);
      sheet.addEventListener("pointermove", move);
      sheet.addEventListener("pointerup", up);
      sheet.addEventListener("pointercancel", up);
    };
    const detach = () => {
      sheet.removeEventListener("pointerdown", down);
      sheet.removeEventListener("pointermove", move);
      sheet.removeEventListener("pointerup", up);
      sheet.removeEventListener("pointercancel", up);
      sheet.style.setProperty("--drag", "0px");
    };
    const sync = () => { MQ.mobile.matches ? attach() : detach(); };
    attach();
    if (!MQ.mobile.matches) detach();
    if (MQ.mobile.addEventListener) MQ.mobile.addEventListener("change", () => { detach(); sync(); });
    else if (MQ.mobile.addListener) MQ.mobile.addListener(() => { detach(); sync(); });
  }

  /* ============================================================
     9 · 特效
     ============================================================ */
  /* —— 入场落终态：打开抽屉前调用，避免与舞台后退的 transform 打架 —— */
  function settleEntrance() {
    const els = document.querySelectorAll(".enter");
    if (!els.length) return;
    Array.prototype.forEach.call(els, (el) => {
      el.style.transition = "none";
      el.style.opacity = "1";
      el.style.transform = "none";
    });
    requestAnimationFrame(() => {
      Array.prototype.forEach.call(els, (el) => {
        el.style.transition = ""; el.style.opacity = ""; el.style.transform = "";
      });
    });
  }
  /* —— 性能档位：低端设备移除 .aura-b 与指针天光 —— */
  function initPerf() {
    const cores = navigator.hardwareConcurrency || 8;
    if (cores <= 4) document.documentElement.dataset.perf = "eco";
    /* 后台标签页暂停动画 */
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) document.documentElement.dataset.paused = "1";
      else delete document.documentElement.dataset.paused;
    });
  }
  /* —— L2 指针天光：rAF 节流 + lerp 0.12 平滑跟随 —— */
  function initSky() {
    const glow = document.querySelector(".glow");
    if (!glow) return;
    if (!MQ.hover.matches || !MQ.wide.matches || MQ.reduce.matches || isEco()) return;
    let tx = window.innerWidth * 0.5, ty = window.innerHeight * 0.26;
    let cx = tx, cy = ty, raf = 0;
    const frame = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      glow.style.setProperty("--mx", cx.toFixed(1) + "px");
      glow.style.setProperty("--my", cy.toFixed(1) + "px");
      raf = (Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5) ? requestAnimationFrame(frame) : 0;
    };
    document.addEventListener("pointermove", (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      tx = e.clientX; ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
  }
  /* —— 按压涟漪：pointerdown 触发，并发 ≤3，pointer-events:none —— */
  function bindRipple() {
    const SCOPE = ".card, .enter-btn, .close-btn, .cal-nav, .se-chip";
    document.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      if (MQ.reduce.matches) return;
      const host = e.target.closest && e.target.closest(SCOPE);
      if (!host) return;
      /* 表单控件与留言列表内不产生涟漪，避免打字时满卡水波纹 */
      if (e.target.closest("input, textarea, select, .msg-list")) return;
      if (host.querySelectorAll(".ripple").length >= 3) return;
      const r = host.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 1.35;
      const sp = document.createElement("span");
      sp.className = "ripple";
      sp.style.width = size + "px";
      sp.style.height = size + "px";
      sp.style.left = (e.clientX - r.left - size / 2) + "px";
      sp.style.top = (e.clientY - r.top - size / 2) + "px";
      host.classList.add("rp");
      sp.addEventListener("animationend", () => {
        sp.remove();
        if (!host.querySelector(".ripple")) host.classList.remove("rp");
      });
      host.appendChild(sp);
    }, { passive: true });
  }
  /* —— 骨架流光：延迟 300ms 出现，最短显示 240ms —— */
  const SK = new Map();
  function showSkeleton(host, lines) {
    if (!host) return;
    const st = SK.get(host) || {};
    if (st.on || st.timer) return;
    st.timer = setTimeout(() => {
      st.on = true; st.at = performance.now();
      const ws = ["w-100", "w-80", "w-60", "w-100"];
      host.dataset.sk = "1";
      host.innerHTML = `<div class="sk-wrap">` +
        Array.from({ length: lines }, (_, i) => `<span class="sk ${ws[i % ws.length]}"></span>`).join("") +
        `</div>`;
    }, 300);
    SK.set(host, st);
  }
  function clearSkeleton(host, done) {
    const next = () => { if (typeof done === "function") done(); };
    const st = SK.get(host);
    if (!st) { next(); return; }
    clearTimeout(st.timer); st.timer = 0;
    if (!st.on) { SK.delete(host); next(); return; }
    const wait = Math.max(0, 240 - (performance.now() - st.at));
    setTimeout(() => {
      delete host.dataset.sk;
      st.on = false; SK.delete(host); next();
    }, wait);
  }

  /* ============================================================
     10 · 留言板（localStorage 本机保存 + 预留远程接口）
     ============================================================ */
  const MSG_KEY = "tiaqi_msgs", NICK_KEY = "tiaqi_nick";
  const MSG_MAX = 60, DM_MAX = 8, DM_GAP = 3600, AMB_GAP = 8200;
  /* 想升级为「全网共享」：填入后端地址即可（GET 返回留言数组，POST 追加 {u,t,ts}）。
     留空 = 仅保存在本机浏览器，无需任何密钥与注册。 */
  const MSG_ENDPOINT = "";
  const MSG_TINTS = ["c1", "c2", "c3", "c4", "c5"];
  let msgs = [], dmOn = true, ambOn = true, dmTimer = 0, ambTimer = 0, dmIdx = 0, ambIdx = 0;

  /* 昵称 → 稳定色彩身份（同一个人每次同色） */
  function msgTint(u) {
    let h = 0;
    for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) % 9973;
    return MSG_TINTS[h % MSG_TINTS.length];
  }
  function msgTime(ts) {
    const d = new Date(ts);
    return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  const readStore = () => {
    try { return JSON.parse(localStorage.getItem(MSG_KEY) || "[]"); } catch (e) { return []; }
  };
  const writeStore = (arr) => {
    try { localStorage.setItem(MSG_KEY, JSON.stringify(arr)); } catch (e) {}
  };

  /* —— 渲染留言列表：全程 textContent，用户输入不会被当作 HTML —— */
  function renderMsgs() {
    const list = $("msg-list"), cnt = $("msg-count");
    if (cnt) cnt.textContent = msgs.length ? `共 ${msgs.length} 条` : "还没有留言";
    if (!list) return;
    list.textContent = "";
    if (!msgs.length) {
      const li = document.createElement("li");
      li.className = "msg-empty";
      li.textContent = "写第一条留言，它会化作弹幕飘过天光";
      list.appendChild(li);
      return;
    }
    msgs.slice(-24).reverse().forEach((m) => {
      const li = document.createElement("li");
      li.className = "msg-item";
      const u = document.createElement("span");
      u.className = "mu " + msgTint(m.u);
      u.textContent = m.u;
      const t = document.createElement("span");
      t.className = "mt";
      t.textContent = m.t;
      const s = document.createElement("span");
      s.className = "mtime";
      s.textContent = msgTime(m.ts);
      li.append(u, t, s);
      list.appendChild(li);
    });
  }

  /* —— 远程同步：MSG_ENDPOINT 留空时自动跳过，纯本机运行 —— */
  async function pullRemote() {
    if (!MSG_ENDPOINT) return;
    try {
      const arr = await fetchJSON(MSG_ENDPOINT, 5000);
      if (!Array.isArray(arr)) return;
      const seen = new Set(msgs.map((m) => m.u + "|" + m.t + "|" + m.ts));
      const add = arr
        .filter((m) => m && m.t && !seen.has(String(m.u || "") + "|" + m.t + "|" + m.ts))
        .map((m) => ({ u: String(m.u || "").slice(0, 12) || "匿名旅人", t: String(m.t).slice(0, 60), ts: +m.ts || Date.now() }));
      if (!add.length) return;
      msgs = msgs.concat(add).sort((a, b) => a.ts - b.ts).slice(-MSG_MAX);
      writeStore(msgs);
      renderMsgs();
    } catch (e) { /* 远程不可用 → 静默保持本机数据 */ }
  }
  function pushRemote(m) {
    if (!MSG_ENDPOINT) return;
    fetch(MSG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m)
    }).catch(() => {});
  }

  function addMsg(rawU, rawT) {
    const u = String(rawU || "").trim().slice(0, 12) || "匿名旅人";
    const t = String(rawT || "").trim().slice(0, 60);
    if (!t) { toast("留言内容不能为空"); return false; }
    const m = { u, t, ts: Date.now() };
    msgs.push(m);
    if (msgs.length > MSG_MAX) msgs = msgs.slice(-MSG_MAX);
    writeStore(msgs);
    renderMsgs();
    pushRemote(m);
    spawnDanmaku(m);            /* 即时反馈：自己刚发的这条立刻飘出 */
    spawnAmbient(m);            /* 同步浮现为背景大字，不必等到下一个轮询 */
    return true;
  }

  /* —— 弹幕：单条生成；越长漂得越慢保证可读；同屏并发 ≤ DM_MAX —— */
  function spawnDanmaku(m) {
    const layer = $("msgfx-dm");
    if (!layer || MQ.reduce.matches || document.hidden) return;
    if (layer.querySelectorAll(".dm-item").length >= DM_MAX) return;
    const el = document.createElement("span");
    el.className = "dm-item " + msgTint(m.u);
    const b = document.createElement("b");
    b.className = "dm-u";
    b.textContent = m.u;
    el.append(b, document.createTextNode("：" + m.t));
    el.style.setProperty("--dur", Math.max(9, Math.min(18, 9 + m.t.length * 0.16)).toFixed(1) + "s");
    el.style.top = (12 + Math.random() * 62).toFixed(1) + "%";
    el.addEventListener("animationend", () => el.remove());
    layer.appendChild(el);
  }
  function tickDanmaku() {
    if (!msgs.length) return;
    spawnDanmaku(msgs[dmIdx++ % msgs.length]);
  }

  /* —— 背景大字：留言与排班共用同一氛围层。随机锚点浮现，6.4s 后淡出，同屏 ≤2 —— */
  function spawnAmbient(m) { spawnAmbientText(m.t, msgTint(m.u)); }
  function spawnAmbientText(str, tint) {
    const layer = $("msgfx-amb");
    if (!layer || MQ.reduce.matches || document.hidden) return;
    if (layer.querySelectorAll(".amb-item").length >= 2) return;
    if (!str) return;
    const el = document.createElement("span");
    el.className = "amb-item " + (tint || "c1");
    el.textContent = str;
    el.style.left = (3 + Math.random() * 26).toFixed(1) + "%";
    el.style.top = (10 + Math.random() * 48).toFixed(1) + "%";
    layer.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 1700);
    }, 6400);
  }
  /* 统一内容池：最近留言 + 未完成的排班，二者轮流浮现于背景 */
  function ambientPool() {
    const pool = [];
    msgs.slice(-20).forEach((m) => pool.push({ str: m.t, tint: msgTint(m.u) }));
    plans.filter((p) => !p.done && p.t).forEach((p) => pool.push({ str: planDisplay(p), tint: "plan" }));
    return pool;
  }
  function tickAmbient() {
    const pool = ambientPool();
    if (!pool.length) return;
    const it = pool[ambIdx++ % pool.length];
    spawnAmbientText(it.str, it.tint);
  }

  function startMsgFx() {
    if (MQ.reduce.matches) return;
    if (dmOn && !dmTimer) { tickDanmaku(); dmTimer = setInterval(tickDanmaku, DM_GAP); }
    if (ambOn && !ambTimer) { tickAmbient(); ambTimer = setInterval(tickAmbient, AMB_GAP); }
  }
  function stopMsgFx() {
    clearInterval(dmTimer); dmTimer = 0;
    clearInterval(ambTimer); ambTimer = 0;
  }
  function setFx(which, on) {
    const save = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) {} };
    if (which === "dm") {
      dmOn = on; save("tiaqi_dm", on);
      clearInterval(dmTimer); dmTimer = 0;
      const l = $("msgfx-dm"); if (l) l.textContent = "";
      if (on && !MQ.reduce.matches) { tickDanmaku(); dmTimer = setInterval(tickDanmaku, DM_GAP); }
    } else {
      ambOn = on; save("tiaqi_amb", on);
      clearInterval(ambTimer); ambTimer = 0;
      const l = $("msgfx-amb"); if (l) l.textContent = "";
      if (on && !MQ.reduce.matches) { tickAmbient(); ambTimer = setInterval(tickAmbient, AMB_GAP); }
    }
    syncFxUI();
  }
  function syncFxUI() {
    const a = $("tg-dm"), b = $("tg-amb");
    if (a) { a.setAttribute("aria-pressed", dmOn ? "true" : "false"); a.textContent = "弹幕 · " + (dmOn ? "开" : "关"); }
    if (b) { b.setAttribute("aria-pressed", ambOn ? "true" : "false"); b.textContent = "背景大字 · " + (ambOn ? "开" : "关"); }
  }

  function initMsg() {
    msgs = readStore()
      .filter((m) => m && m.t)
      .map((m) => ({
        u: String(m.u || "匿名旅人").slice(0, 12),
        t: String(m.t).slice(0, 60),
        ts: +m.ts || Date.now()
      }))
      .sort((a, b) => a.ts - b.ts).slice(-MSG_MAX);
    try {
      dmOn = localStorage.getItem("tiaqi_dm") !== "0";
      ambOn = localStorage.getItem("tiaqi_amb") !== "0";
      const nick = localStorage.getItem(NICK_KEY);
      if (nick && $("msg-nick")) $("msg-nick").value = nick;
    } catch (e) {}
    syncFxUI();
    renderMsgs();
    pullRemote();
    /* 后台标签页停表，回到前台再续 */
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopMsgFx();
      else if (document.body.dataset.ready === "1") startMsgFx();
    });
    if ($("msg-tip")) $("msg-tip").textContent = MSG_ENDPOINT ? "留言已联网共享" : "留言保存在本机浏览器";
  }

  /* ============================================================
     10.5 · 排班板（localStorage 本机保存，事项共用背景氛围层）
     ============================================================ */
  const PLAN_KEY = "tiaqi_plans", PLAN_MAX = 60;
  let plans = [];

  const readPlans = () => { try { return JSON.parse(localStorage.getItem(PLAN_KEY) || "[]"); } catch (e) { return []; } };
  const writePlans = (arr) => { try { localStorage.setItem(PLAN_KEY, JSON.stringify(arr)); } catch (e) {} };

  /* 背景大字里展示的内容：有时间就带时间前缀 */
  function planDisplay(p) {
    return (p.when ? p.when + " " : "") + p.t;
  }
  function renderPlans() {
    const list = $("plan-list"), cnt = $("plan-count");
    if (cnt) cnt.textContent = plans.length ? `共 ${plans.length} 项` : "还没有安排";
    if (!list) return;
    list.textContent = "";
    if (!plans.length) {
      const li = document.createElement("li");
      li.className = "plan-empty";
      li.textContent = "添加第一项安排，它会浮现在天光背景里";
      list.appendChild(li);
      return;
    }
    /* 按时间排序：有时间的在前，无时间的置后 */
    const sorted = plans.slice().sort((a, b) => (a.when || "99:99").localeCompare(b.when || "99:99"));
    sorted.forEach((p) => {
      const li = document.createElement("li");
      li.className = "plan-item" + (p.done ? " done" : "");
      const tm = document.createElement("button");       /* 点击标记完成/恢复 */
      tm.type = "button"; tm.className = "plan-toggle"; tm.setAttribute("aria-label", p.done ? "标记为未完成" : "标记为完成");
      tm.textContent = p.done ? "✓" : "";
      const tx = document.createElement("span");
      tx.className = "plan-tx";
      const w = document.createElement("span"); w.className = "plan-when"; w.textContent = p.when || "";
      const t = document.createElement("span"); t.className = "plan-t"; t.textContent = p.t;
      tx.append(w, t);
      const del = document.createElement("button");
      del.type = "button"; del.className = "plan-del"; del.setAttribute("aria-label", "删除"); del.textContent = "×";
      li.append(tm, tx, del);
      tm.addEventListener("click", () => togglePlan(p.ts));
      del.addEventListener("click", () => delPlan(p.ts));
      list.appendChild(li);
    });
  }
  function addPlan(rawWhen, rawT) {
    const t = String(rawT || "").trim().slice(0, 40);
    if (!t) { toast("排班事项不能为空"); return false; }
    const p = { when: String(rawWhen || "").trim(), t, ts: Date.now(), done: false };
    plans.push(p);
    if (plans.length > PLAN_MAX) plans = plans.slice(-PLAN_MAX);
    writePlans(plans);
    renderPlans();
    if (!p.done) spawnAmbientText(planDisplay(p), "plan");   /* 即时浮现背景，与留言同一氛围层 */
    return true;
  }
  function togglePlan(ts) {
    const p = plans.find((x) => x.ts === ts);
    if (!p) return;
    p.done = !p.done;
    writePlans(plans); renderPlans();
  }
  function delPlan(ts) {
    plans = plans.filter((x) => x.ts !== ts);
    writePlans(plans); renderPlans();
  }
  function clearPlans() {
    if (!plans.length) { toast("还没有安排可清空"); return; }
    if (!confirm(`确定清空全部 ${plans.length} 项排班？此操作不可撤销。`)) return;
    plans = []; writePlans(plans); renderPlans(); toast("排班已清空");
  }
  function initPlan() {
    plans = readPlans()
      .filter((p) => p && p.t)
      .map((p) => ({ when: String(p.when || ""), t: String(p.t).slice(0, 40), ts: +p.ts || Date.now(), done: !!p.done }))
      .sort((a, b) => (a.when || "99:99").localeCompare(b.when || "99:99"));
    renderPlans();
    const form = $("plan-form");
    if (form) form.addEventListener("submit", (e) => {
      e.preventDefault();
      const when = ($("plan-when") || {}).value || "";
      const text = ($("plan-text") || {}).value || "";
      if (addPlan(when, text)) { if ($("plan-text")) $("plan-text").value = ""; announce("已添加排班"); }
    });
    const clr = $("plan-clear");
    if (clr) clr.addEventListener("click", clearPlans);
  }

  /* ============================================================
     11 · 欢迎页与初始化
     ============================================================ */
  function enterHome() {
    if (document.body.dataset.ready === "1") return;
    document.body.dataset.ready = "1";
    flushChart();                                /* 曲线若已在视口内，此刻开始生长 */
    startMsgFx();                                /* 留言弹幕与背景大字自此刻起流动 */
    const w = $("welcome");
    w.classList.add("leave");                    /* 与进入同曲线同长同路径：只 translateY */
    setTimeout(() => {
      w.dataset.phase = "gone";
      w.setAttribute("aria-hidden", "true");
      if (INERT_OK) w.inert = true;
      w.style.display = "none";
      /* 焦点交还：桌面给搜索框，移动端给主页容器（避免弹出软键盘） */
      try {
        if (MQ.hover.matches) {
          const inp = $("search-input");
          inp.focus({ preventScroll: true });
          closeSearch();
        } else {
          $("home").focus({ preventScroll: true });
        }
      } catch (e) {}
    }, 420);
  }

  function bind() {
    /* —— 欢迎页：整页可点击 —— */
    $("welcome").addEventListener("click", () => enterHome());

    /* —— 搜索 —— */
    const input = $("search-input");
    const toggleEngine = (q) => {
      const eng = $("search-engine");
      if (q) { $("se-q").textContent = q; eng.hidden = false; }
      else eng.hidden = true;
    };
    let composing = false, sTimer = 0;
    const runSearch = () => {
      const q = input.value.trim();
      renderSearchResults(q);
      toggleEngine(q);
    };
    /* 中文输入法组词期间不检索 + 120ms 去抖 */
    const scheduleSearch = () => {
      clearTimeout(sTimer);
      sTimer = setTimeout(() => { if (!composing) runSearch(); }, 120);
    };
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; scheduleSearch(); });
    input.addEventListener("input", scheduleSearch);
    input.addEventListener("focus", openSearch);
    input.addEventListener("blur", () => setTimeout(closeSearch, 300));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!lastResults.length) return;
        e.preventDefault();
        setHighlight(e.key === "ArrowDown" ? hlIndex + 1 : hlIndex - 1);
        return;
      }
      if (e.key === "Enter") {
        const q = input.value.trim();
        if (hlIndex >= 0 && lastResults[hlIndex]) onSearchSelect(lastResults[hlIndex]);
        else if (q) openSearchEngine(q, "bing");
        return;
      }
      if (e.key === "Escape") {
        /* Esc 三级：清高亮 → 关面板 → 清空；阻止冒泡避免误关抽屉 */
        e.stopPropagation();
        if (hlIndex >= 0) { clearHighlight(); return; }
        if ($("search").classList.contains("open")) { closeSearch(); return; }
        if (input.value) {
          input.value = "";
          renderSearchResults("");
          toggleEngine("");
          announce("");
        }
      }
    });
    /* pointerdown 在 blur 之前触发，避免 iOS 上点击结果被 blur→closeSearch 吞掉 */
    $("search-results").addEventListener("pointerdown", (e) => {
      const el = e.target.closest(".search-item");
      if (el) { e.preventDefault(); onSearchSelect(lastResults[+el.dataset.i]); }
    });
    $("search-engine").addEventListener("click", (e) => {
      const chip = e.target.closest(".se-chip");
      if (!chip) return;
      openSearchEngine(input.value.trim(), chip.dataset.engine);
    });

    /* —— 热点新闻：只拦截普通左键，放行 Ctrl/Cmd/Shift/中键；失败态支持重试 —— */
    $("wn-list").addEventListener("click", (e) => {
      const retry = e.target.closest(".wn-retry");
      if (retry) {
        e.preventDefault();
        if (retry.disabled) return;
        retry.disabled = true; retry.textContent = "重试中…";
        loadNews();
        return;
      }
      const a = e.target.closest(".wn-item");
      if (!a) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      openSearchEngine(a.dataset.q, "bing");
    });

    /* —— 卡片：点击 + 键盘 Enter/Space —— */
    const cardActivate = (el, fn) => {
      el.addEventListener("click", fn);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); fn(); }
      });
    };
    cardActivate($("cal-card"), () => {
      highlightIso = null; renderCalendarSheet(new Date()); openSheet("cal");
    });
    cardActivate($("wiki-card"), () => {
      if (wikiCurrent) openWikiDrawer(wikiCurrent);
      else toast("百科内容暂时无法加载");            /* 失败时点卡片不再静默无反应 */
    });

    $("cal-close").addEventListener("click", closeSheet);
    $("wiki-close").addEventListener("click", closeSheet);
    $("backdrop").addEventListener("click", closeSheet);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

    const parseTitle = () => {
      const [yy, mm] = $("cal-title").textContent.replace("月", "").split("年");
      return new Date(+yy, +mm - 1, 1);
    };
    $("cal-prev").addEventListener("click", () => { const d = parseTitle(); d.setMonth(d.getMonth() - 1); renderCalendarSheet(d); });
    $("cal-next").addEventListener("click", () => { const d = parseTitle(); d.setMonth(d.getMonth() + 1); renderCalendarSheet(d); });

    /* —— 留言板：发送 / 开关 / 清空 —— */
    const mform = $("msg-form");
    if (mform) {
      mform.addEventListener("submit", (e) => {
        e.preventDefault();
        const uEl = $("msg-nick"), tEl = $("msg-text");
        if (addMsg(uEl.value, tEl.value)) {
          try { localStorage.setItem(NICK_KEY, String(uEl.value).trim().slice(0, 12)); } catch (er) {}
          tEl.value = "";
          announce("留言已发送");
          if (!MQ.coarse.matches) tEl.focus({ preventScroll: true });
        }
      });
    }
    $("tg-dm").addEventListener("click", () => setFx("dm", !dmOn));
    $("tg-amb").addEventListener("click", () => setFx("amb", !ambOn));
    $("msg-clear").addEventListener("click", () => {
      if (!msgs.length) { toast("还没有留言可清空"); return; }
      if (!confirm(`确定清空全部 ${msgs.length} 条留言？此操作不可撤销。`)) return;
      msgs = []; writeStore(msgs); renderMsgs(); stopMsgFx(); startMsgFx();
      toast("留言已清空");
    });

    bindDrag($("cal-sheet"));
    bindDrag($("wiki-sheet"));
    bindRipple();
  }

  async function init() {
    initPerf();
    bind();
    initSky();
    buildBaseIndex();
    rebuildFuse();
    renderCalendarCard();
    renderCalendarSheet(new Date());

    /* 骨架先占位（延迟 300ms 才出现），数据到达后撤下 */
    showSkeleton($("wiki-title"), 1);
    showSkeleton($("wiki-text"), 4);   /* 4 行 ≈ 真实 4 行文本高度 */
    initMsg();
    initPlan();
    updateVisit();
    loadWiki();
    loadNews();

    /* 窗口尺寸变化后按新比例重绘曲线（不重播动画） */
    window.addEventListener("resize", debounce(() => {
      const box = $("visit-chart");
      if (!box || !lastTs.length) return;
      if (Math.abs(box.clientWidth - lastChartW) < 12) return;
      renderVisitChart(lastTs, false);
    }, 200));

    /* 欢迎页按钮自动聚焦 */
    setTimeout(() => { try { $("enter").focus({ preventScroll: true }); } catch (e) {} }, 60);

    const geo = await getGeo();
    $("w-ip").textContent = geo.ip ? `IP ${geo.ip} · ${geo.city}` : `IP · ${geo.city}`;
    $("w-city").textContent = geo.city;
    if (geo.lat != null && geo.lon != null) fetchWeather(geo.lat, geo.lon);
    else { $("w-desc").textContent = "位置未知"; $("w-ico").style.opacity = ".3"; $("w-err").hidden = false; }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
