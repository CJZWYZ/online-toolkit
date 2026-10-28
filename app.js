/* ============================================================
   液态玻璃 · 天气 / 日历 / 百科 / 搜索
   纯前端 · 免费开源 API · 无密钥
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const tz = () => (Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai");

  /* ---------- 通用：带超时的 fetch（默认 5s） ---------- */
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
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- WMO 天气码 → 中文 + 图标 ---------- */
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
  function weatherSVG(type) {
    const cloud = `<path d="M13 28 a8 8 0 0 1 1 -16 a11 11 0 0 1 21 2 a7 7 0 0 1 1 14 Z" fill="rgba(255,255,255,0.12)" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`;
    const sun = `<circle cx="16" cy="16" r="6" fill="#ffd166" stroke="currentColor" stroke-width="3"/><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M16 4 V8"/><path d="M5 16 H9"/><path d="M8 8 L11 11"/><path d="M24 8 L21 11"/></g>`;
    const O = `<svg viewBox="0 0 48 48" width="54" height="54">`, C = `</svg>`;
    switch (type) {
      case "sun": return `${O}<circle cx="24" cy="24" r="9" fill="#ffd166" stroke="currentColor" stroke-width="3"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M24 6 V11"/><path d="M24 37 V42"/><path d="M6 24 H11"/><path d="M37 24 H42"/><path d="M11 11 L15 15"/><path d="M33 33 L37 37"/><path d="M37 11 L33 15"/><path d="M15 33 L11 37"/></g>${C}`;
      case "suncloud": return `${O}${sun}${cloud}${C}`;
      case "cloud": return `${O}${cloud}${C}`;
      case "fog": return `${O}${cloud}<g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 38 H34"/><path d="M16 43 H30"/></g>${C}`;
      case "rain": return `${O}${cloud}<g stroke="#0a84ff" stroke-width="3" stroke-linecap="round"><path d="M17 32 L15 39"/><path d="M25 32 L23 39"/><path d="M33 32 L31 39"/></g>${C}`;
      case "snow": return `${O}${cloud}<g fill="#0a84ff"><circle cx="17" cy="36" r="1.8"/><circle cx="25" cy="39" r="1.8"/><circle cx="33" cy="36" r="1.8"/></g>${C}`;
      case "thunder": return `${O}${cloud}<path d="M25 30 L20 40 L25 40 L22 47" fill="#ffd166" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${C}`;
      default: return `${O}${cloud}${C}`;
    }
  }

  /* ---------- 24 节气 / 节日中文名（搜索索引用） ---------- */
  const TERMS_CN = ["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"];
  const HOLIDAYS_CN = ["元旦","春节","清明节","劳动节","端午节","中秋节","国庆节","元宵节","重阳节","情人节","儿童节","妇女节","青年节","教师节","植树节","建军节","建党节","抗战胜利日","母亲节","父亲节"];
  const CITIES = ["北京","上海","广州","深圳","成都","杭州","西安","武汉","南京","重庆","天津","苏州","长沙","青岛","厦门","香港","台北","哈尔滨","昆明","大连"];

  /* ============================================================
     IP 定位（ipwho.is → ipapi.co → 搜狐/太平洋 script 注入 → 城市转坐标）
     国内网络下 ipapi.co / geo.kamero.ai 常不可达，
     搜狐 pv.sohu.com 与 whois.pconline.com.cn 为国内稳定源（script 注入免 CORS）。
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
  /* 城市名 → 坐标（Open-Meteo 免费地理编码） */
  async function geocodeCity(name) {
    try {
      const j = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&language=zh&count=1&format=json`, 5000);
      const r = j && j.results && j.results[0];
      if (r && r.latitude != null) return { lat: r.latitude, lon: r.longitude, tz: r.timezone || tz() };
    } catch (e) {}
    return null;
  }
  async function getGeo() {
    /* 1) ipwho.is（CORS 开放，含经纬度） */
    try {
      const d = await fetchJSON("https://ipwho.is/", 5000);
      if (d && d.success !== false && d.latitude != null) {
        const city = [d.city, d.country].filter(Boolean).join(" · ") || "未知位置";
        return { lat: +d.latitude, lon: +d.longitude, city, ip: d.ip || "",
                 tz: (d.timezone && d.timezone.id) || tz() };
      }
    } catch (e) {}
    /* 2) ipapi.co（规格指定兜底） */
    try {
      const d = await fetchJSON("https://ipapi.co/json/", 5000);
      if (d && d.latitude != null) {
        const city = [d.city, d.country_name].filter(Boolean).join(" · ") || "未知位置";
        return { lat: +d.latitude, lon: +d.longitude, city, ip: d.ip || "", tz: d.timezone || tz() };
      }
    } catch (e) {}
    /* 3) 搜狐 cityjson（script 注入，返回 returnCitySN = {cip, cname}） */
    try {
      await loadScript("https://pv.sohu.com/cityjson?ie=utf-8", 5000);
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
        setTimeout(() => rej(new Error("timeout")), 5000);
      });
      await loadScript(`https://whois.pconline.com.cn/ipJson.jsp?callback=${cb}`, 5000);
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

  /* ============================================================
     天气（Open-Meteo，免密钥、CORS 开放）
     ============================================================ */
  async function fetchWeather(lat, lon) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
      const j = await fetchJSON(url, 5000);
      const c = j.current;
      const info = WMO[c.weather_code] || { d: "未知", i: "cloud" };
      $("w-ico").innerHTML = weatherSVG(info.i);
      $("w-temp").textContent = Math.round(c.temperature_2m);
      $("w-desc").textContent = info.d;
      $("w-feel").textContent = Math.round(c.apparent_temperature);
      $("w-wind").textContent = Math.round(c.wind_speed_10m) + " km/h";
      $("w-err").hidden = true;
    } catch (e) {
      $("w-desc").textContent = "天气暂不可用";
      $("w-ico").style.opacity = ".3";
      $("w-err").hidden = false;
    }
  }

  /* ============================================================
     日历 / 农历 / 节气 / 节假日（chinese-days，CDN UMD）
     ============================================================ */
  const WK = ["日","一","二","三","四","五","六"];
  function renderCalendarCard() {
    const cd = window.chineseDays;
    const now = new Date();
    const wd = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"][now.getDay()];
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
    let monthTerms = {};
    if (cd) {
      cd.getSolarTerms(new Date(y, 0, 1), new Date(y, 11, 31))
        .forEach((t) => {
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
     百科 · 历史上的今天（国内源优先，Wikipedia 兜底，免密钥）
     ============================================================ */
  let wikiCurrent = null, wikiAvailable = true;
  /* 容错解析：在任意 JSON 中找到事件数组，统一为 {year, text, pages} */
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
    /* 国内可达源优先：60s API（实测稳定）→ 韩小韩 → oioweb → Wikipedia */
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
    if (!evs.length) { wikiFail(); return; }
    const pool = evs.slice(0, 24);
    const ev = pool[Math.floor(Math.random() * pool.length)];
    wikiCurrent = ev;
    $("wiki-title").textContent = ev.year ? `${ev.year} 年 · 历史上的今天` : "历史上的今天";
    const txt = (ev.text || "").slice(0, 300);
    $("wiki-text").textContent = txt + ((ev.text || "").length > 300 ? "…" : "");
    buildWikiIndex(evs);
  }
  function wikiFail() {
    wikiAvailable = false;
    $("wiki-title").textContent = "暂无内容";
    $("wiki-text").textContent = "百科内容暂时无法加载";
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
     搜索（Fuse.js v7，CDN）
     ============================================================ */
  let searchItems = [], fuse = null, lastResults = [];
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
        type: "wiki", key: page.title, label: page.title, snippet: (ev.text || "").slice(0, 60),
        action: "openWiki", ev
      });
    });
    rebuildFuse();
  }
  function rebuildFuse() {
    const box = document.querySelector(".search");
    if (typeof Fuse === "undefined") { box.style.display = "none"; return; }
    fuse = new Fuse(searchItems, { keys: ["key", "label", "snippet"], threshold: 0.4, ignoreLocation: true });
  }
  const typeLabel = (t) => (t === "weather" ? "天气" : t === "calendar" ? "日历" : t === "city" ? "城市" : "百科");
  function renderSearchResults(q) {
    const box = $("search-results");
    if (!q) { box.innerHTML = `<p class="search-empty">输入关键词，实时检索天气、节气与百科</p>`; return; }
    if (!fuse) { box.innerHTML = `<p class="search-empty">搜索暂不可用</p>`; return; }
    const res = fuse.search(q).slice(0, 8);
    if (!res.length) { box.innerHTML = `<p class="search-empty">未找到匹配结果</p>`; return; }
    lastResults = res.map((r) => r.item);
    box.innerHTML = lastResults.map((it, i) => {
      const tc = it.type === "calendar" ? "cal" : it.type === "wiki" ? "wiki" : "";
      return `<div class="search-item" data-i="${i}">
        <span class="si-type ${tc}">${typeLabel(it.type)}</span>
        <span class="si-label">${esc(it.label)}</span>
        ${it.snippet ? `<span class="si-snippet">${esc(it.snippet)}</span>` : ""}
      </div>`;
    }).join("");
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
  function closeSearch() { document.getElementById("search").classList.remove("open"); }

  /* ============================================================
     访问量统计（Abacus 免费免密钥计数 API + localStorage 兜底）
     ============================================================ */
  async function updateVisit() {
    const el = $("visit");
    const local = (parseInt(localStorage.getItem("tiaqi_visits") || "0", 10) + 1);
    localStorage.setItem("tiaqi_visits", local);
    el.textContent = `访问量 ${local.toLocaleString()}（本机）`;
    try {
      const j = await fetchJSON("https://abacus.jasoncameron.dev/hit/tiaqi/visits", 5000);
      if (j && typeof j.value === "number") el.textContent = `全站访问量 ${j.value.toLocaleString()}`;
    } catch (e) { /* 保持本机计数 */ }
  }

  /* ============================================================
     抽屉（bottom sheet）+ 跟手下滑关闭（速度感知）
     ============================================================ */
  let activeSheet = null, highlightIso = null;
  function openSheet(which) {
    const sheet = which === "cal" ? $("cal-sheet") : $("wiki-sheet");
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add("open"));
    document.body.classList.add("sheet-open");
    activeSheet = sheet;
  }
  function closeSheet() {
    if (!activeSheet) return;
    const s = activeSheet; activeSheet = null; highlightIso = null;
    s.classList.remove("open");
    s.style.transform = "";
    document.body.classList.remove("sheet-open");
    setTimeout(() => { s.hidden = true; }, 420);
  }
  function enableDrag(sheet) {
    let startY = 0, dy = 0, dragging = false, lastY = 0, lastT = 0, v = 0;
    const down = (e) => {
      if (e.target.closest(".cal-grid")) return;
      dragging = true; startY = e.clientY; dy = 0; lastY = e.clientY; lastT = performance.now(); v = 0;
      sheet.classList.add("dragging");
      try { sheet.setPointerCapture(e.pointerId); } catch (_) {}
    };
    const move = (e) => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      const now = performance.now(), dt = now - lastT || 16;
      v = (e.clientY - lastY) / dt; lastY = e.clientY; lastT = now;
      sheet.style.transform = `translateY(${dy}px)`;
    };
    const up = () => {
      if (!dragging) return; dragging = false; sheet.classList.remove("dragging");
      const h = sheet.offsetHeight;
      if (dy > h * 0.4 || v > 0.6) closeSheet();
      else { sheet.style.transform = ""; sheet.classList.add("open"); }
    };
    sheet.addEventListener("pointerdown", down);
    sheet.addEventListener("pointermove", move);
    sheet.addEventListener("pointerup", up);
    sheet.addEventListener("pointercancel", up);
  }

  /* ============================================================
     欢迎页 → 主页流转
     ============================================================ */
  function enterHome() {
    const w = $("welcome");
    w.classList.add("leave");
    document.body.dataset.ready = "1";
    setTimeout(() => { w.style.display = "none"; }, 600);
  }

  /* ============================================================
     事件绑定
     ============================================================ */
  function bind() {
    $("welcome").addEventListener("click", (e) => {
      if (e.target.id === "enter" || e.target.id === "welcome" ||
          e.target.classList.contains("welcome-panel") || e.target.classList.contains("welcome-greet"))
        enterHome();
    });
    const input = $("search-input");
    input.addEventListener("focus", () => document.getElementById("search").classList.add("open"));
    input.addEventListener("input", () => renderSearchResults(input.value.trim()));
    /* pointerdown 在 blur 之前触发，避免 iOS 上点击结果被 blur→closeSearch 吞掉 */
    input.addEventListener("blur", () => setTimeout(closeSearch, 300));
    $("search-results").addEventListener("pointerdown", (e) => {
      const el = e.target.closest(".search-item");
      if (el) { e.preventDefault(); onSearchSelect(lastResults[+el.dataset.i]); }
    });

    $("cal-card").addEventListener("click", () => { highlightIso = null; renderCalendarSheet(new Date()); openSheet("cal"); });
    $("wiki-card").addEventListener("click", () => { if (wikiCurrent) openWikiDrawer(wikiCurrent); });
    $("cal-close").addEventListener("click", closeSheet);
    $("wiki-close").addEventListener("click", closeSheet);
    $("backdrop").addEventListener("click", closeSheet);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
    const parseTitle = () => { const [yy, mm] = $("cal-title").textContent.replace("月", "").split("年"); return new Date(+yy, +mm - 1, 1); };
    $("cal-prev").addEventListener("click", () => { const d = parseTitle(); d.setMonth(d.getMonth() - 1); renderCalendarSheet(d); });
    $("cal-next").addEventListener("click", () => { const d = parseTitle(); d.setMonth(d.getMonth() + 1); renderCalendarSheet(d); });
    enableDrag($("cal-sheet"));
    enableDrag($("wiki-sheet"));
  }

  /* ============================================================
     初始化（首屏骨架不依赖任何 API 成功）
     ============================================================ */
  async function init() {
    bind();
    buildBaseIndex();
    rebuildFuse();
    renderCalendarCard();
    renderCalendarSheet(new Date());
    updateVisit();
    loadWiki();
    const geo = await getGeo();
    $("w-ip").textContent = geo.ip ? `IP ${geo.ip} · ${geo.city}` : `IP · ${geo.city}`;
    $("w-city").textContent = geo.city;
    if (geo.lat != null && geo.lon != null) fetchWeather(geo.lat, geo.lon);
    else { $("w-desc").textContent = "位置未知"; $("w-ico").style.opacity = ".3"; $("w-err").hidden = false; }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
