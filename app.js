/* ============================================================
   晴历 - 逻辑
   首页：自动日期 + 实时天气（按 IP 定位）+ 农历黄历简略
   侧栏：日历 + 详细农历黄历
   欢迎页：Apple 风柔光 + 轻缓粒子渐隐
   背景：昼夜自适应 + 夜间星点
   ============================================================ */

/* ---------- 自动显示当天日期 ---------- */
function renderDate() {
  const now = new Date();
  const wd = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"];
  document.getElementById("big-date").textContent = `${now.getMonth() + 1}月${now.getDate()}日`;
  document.getElementById("date-sub").textContent = `${now.getFullYear()}年 · ${wd[now.getDay()]}`;
}
renderDate();

// 进入天气加载前，先用本地时间设定昼夜基调
(function initTheme() {
  const h = new Date().getHours();
  document.body.dataset.time = (h >= 19 || h < 6) ? "night" : "day";
})();

/* ============================================================
   农历 / 黄历换算（纯算法，免依赖）
   ============================================================ */
const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
  0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
  0x0a2e0,0x0d2d4,0x0d4d0,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095a0,0x049b0,
  0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,
  0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,
  0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,
  0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0
];

const GAN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const ZHI = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const ZODIAC = ["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"];
const LM = ["正","二","三","四","五","六","七","八","九","十","冬","腊"];
const LD = ["初一","初二","初三","初四","初五","初六","初七","初八","初九","初十",
  "十一","十二","十三","十四","十五","十六","十七","十八","十九","二十",
  "廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"];
const JIANCHU = ["建","除","满","平","定","执","破","危","成","收","开","闭"];

const YI_JI = {
  "建": { yi: "出行、祈福、订盟、纳采、动土", ji: "开仓、掘井" },
  "除": { yi: "解除、沐浴、疗病、扫舍", ji: "求官、出行、移徙" },
  "满": { yi: "祭祀、祈福、开市、纳财", ji: "动土、安葬、破土" },
  "平": { yi: "修造、嫁娶、移徙、安床", ji: "栽种、词讼" },
  "定": { yi: "嫁娶、纳采、出行、会友", ji: "词讼、出行、医疗" },
  "执": { yi: "捕捉、修造、纳财、祭祀", ji: "开市、移徙、入宅" },
  "破": { yi: "破屋、坏垣、求医", ji: "诸事不宜、嫁娶、出行" },
  "危": { yi: "安床、祭祀、祈福", ji: "出行、登高、动工" },
  "成": { yi: "结婚、开市、入学、交易", ji: "词讼、诉讼" },
  "收": { yi: "嫁娶、纳财、入仓、捕捉", ji: "放债、出行、安葬" },
  "开": { yi: "开业、求财、祭祀、动土", ji: "安葬、出行" },
  "闭": { yi: "筑堤、埋穴、补垣、纳畜", ji: "开市、出行、疗病" }
};

function lYearDays(y) {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
  return sum + leapDays(y);
}
function leapDays(y) {
  if (leapMonth(y)) return ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29);
  return 0;
}
function leapMonth(y) { return LUNAR_INFO[y - 1900] & 0xf; }
function monthDays(y, m) { return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29; }

function solar2lunar(y, m, d) {
  const baseDate = new Date(1900, 0, 31);
  const objDate = new Date(y, m - 1, d);
  let offset = Math.round((objDate - baseDate) / 86400000);
  let temp = 0, lunarYear = 1900;
  for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
    temp = lYearDays(lunarYear);
    offset -= temp;
  }
  if (offset < 0) { offset += temp; lunarYear--; }
  const leap = leapMonth(lunarYear);
  let isLeap = false, lunarMonth;
  for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
    if (leap > 0 && lunarMonth === (leap + 1) && !isLeap) {
      --lunarMonth; isLeap = true; temp = leapDays(lunarYear);
    } else {
      temp = monthDays(lunarYear, lunarMonth);
    }
    if (isLeap && lunarMonth === (leap + 1)) isLeap = false;
    offset -= temp;
  }
  if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
    if (isLeap) isLeap = false; else { isLeap = true; --lunarMonth; }
  }
  if (offset < 0) { offset += temp; --lunarMonth; }
  return { year: lunarYear, month: lunarMonth, day: offset + 1, isLeap };
}

const BASE_2000 = new Date(2000, 0, 1);
function ganzhiDay(date) {
  const days = Math.round((date - BASE_2000) / 86400000);
  const idx = (((54 + days) % 60) + 60) % 60;
  return { idx, gan: idx % 10, zhi: idx % 12 };
}

function shaFang(zhiIdx) {
  const groups = [[0, 4, 8], [2, 6, 10], [3, 7, 11], [1, 5, 9]];
  const dirs = ["南", "北", "西", "东"];
  for (let i = 0; i < groups.length; i++) if (groups[i].includes(zhiIdx)) return dirs[i];
  return "";
}

function computeAlmanac(date) {
  const l = solar2lunar(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const yIdx = (l.year - 4) % 10;
  const zIdx = (l.year - 4) % 12;
  const yearGZ = GAN[yIdx] + ZHI[zIdx];
  const monthStr = (l.isLeap ? "闰" : "") + LM[l.month - 1] + "月";
  const dayStr = LD[l.day - 1];
  const gd = ganzhiDay(date);
  const dayGZ = GAN[gd.gan] + ZHI[gd.zhi];
  const firstMonthGan = (yIdx * 2 + 2) % 10;
  const monthGan = (firstMonthGan + (l.month - 1)) % 10;
  const monthZhi = (l.month + 1) % 12;
  const monthGZ = GAN[monthGan] + ZHI[monthZhi];
  const jc = JIANCHU[(l.day - 1) % 12];
  const yiji = YI_JI[jc];
  const chongZhi = (gd.zhi + 6) % 12;
  const chongAnimal = ZODIAC[chongZhi];
  return {
    lunarText: `农历 ${yearGZ}年 ${monthStr}${dayStr}`,
    ganzhiText: `${yearGZ}年 ${monthGZ}月 ${dayGZ}日`,
    zodiac: `生肖 ${ZODIAC[zIdx]}`,
    jianchu: `${jc}日`,
    yi: yiji.yi,
    ji: yiji.ji,
    chong: `冲${chongAnimal}(${ZHI[chongZhi]}) · 煞${shaFang(gd.zhi)}`
  };
}

function renderBrief(date) {
  const a = computeAlmanac(date);
  document.getElementById("b-lunar").textContent = a.lunarText;
  document.getElementById("b-ganzhi").textContent = a.ganzhiText;
  document.getElementById("b-yi").textContent = a.yi;
  document.getElementById("b-ji").textContent = a.ji;
}

function renderAlmanac(date) {
  const a = computeAlmanac(date);
  document.getElementById("al-lunar").textContent = a.lunarText;
  document.getElementById("al-ganzhi").textContent = a.ganzhiText;
  document.getElementById("al-zodiac").textContent = a.zodiac;
  document.getElementById("al-jianchu").textContent = a.jianchu;
  document.getElementById("al-yi").textContent = a.yi;
  document.getElementById("al-ji").textContent = a.ji;
  document.getElementById("al-chong").textContent = a.chong;
}

/* ============================================================
   侧边栏日历
   ============================================================ */
let calY, calM, selY, selM, selD;
const WK = ["日", "一", "二", "三", "四", "五", "六"];

function initCal() {
  const t = new Date();
  calY = selY = t.getFullYear();
  calM = selM = t.getMonth();
  selD = t.getDate();
}

function renderCalendar() {
  const now = new Date();
  const first = new Date(calY, calM, 1);
  const startDay = first.getDay();
  const days = new Date(calY, calM + 1, 0).getDate();
  const isCurMonth = calY === now.getFullYear() && calM === now.getMonth();
  const isSelMonth = calY === selY && calM === selM;

  document.getElementById("cal-title").textContent = `${calY}年${calM + 1}月`;
  let html = WK.map((w) => `<div class="cal-wk">${w}</div>`).join("");
  for (let i = 0; i < startDay; i++) html += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= days; d++) {
    let cls = "cal-cell";
    if (isCurMonth && d === now.getDate()) cls += " today";
    if (isSelMonth && d === selD) cls += " selected";
    html += `<div class="${cls}" data-day="${d}">${d}</div>`;
  }
  document.getElementById("cal-grid").innerHTML = html;
}

document.getElementById("cal-prev").addEventListener("click", () => {
  calM--;
  if (calM < 0) { calM = 11; calY--; }
  renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calM++;
  if (calM > 11) { calM = 0; calY++; }
  renderCalendar();
});
document.getElementById("cal-grid").addEventListener("click", (e) => {
  const cell = e.target.closest(".cal-cell");
  if (!cell || cell.classList.contains("empty")) return;
  const d = parseInt(cell.dataset.day, 10);
  selY = calY; selM = calM; selD = d;
  renderCalendar();
  const selDate = new Date(selY, selM, selD);
  renderAlmanac(selDate);
  document.getElementById("cal-lunar").textContent = computeAlmanac(selDate).lunarText;
  const wd = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"];
  document.getElementById("cal-hint").textContent =
    `已选 ${selY}年${selM + 1}月${selD}日 · ${wd[selDate.getDay()]}`;
});

initCal();
renderCalendar();
renderAlmanac(new Date());
renderBrief(new Date());
document.getElementById("cal-lunar").textContent = computeAlmanac(new Date()).lunarText;

/* ============================================================
   侧边栏开关
   ============================================================ */
function openSidebar() { document.body.classList.add("sidebar-open"); }
function closeSidebar() { document.body.classList.remove("sidebar-open"); }

document.getElementById("menu-open").addEventListener("click", openSidebar);
document.getElementById("open-detail").addEventListener("click", openSidebar);
document.getElementById("open-terms").addEventListener("click", openSidebar);
document.getElementById("menu-close").addEventListener("click", closeSidebar);
document.getElementById("backdrop").addEventListener("click", () => { closeSidebar(); closeNews(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSidebar(); closeNews(); } });

/* ============================================================
   实时天气（Open-Meteo，免费免密钥，支持浏览器跨域）
   ============================================================ */
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const FC_API = "https://api.open-meteo.com/v1/forecast";
const AIR_API = "https://air-quality-api.open-meteo.com/v1/air-quality";

const WMO = {
  0: { desc: "晴", icon: "sun" },
  1: { desc: "晴间多云", icon: "suncloud" },
  2: { desc: "多云", icon: "cloud" },
  3: { desc: "阴", icon: "cloud" },
  45: { desc: "雾", icon: "fog" }, 48: { desc: "雾凇", icon: "fog" },
  51: { desc: "毛毛雨", icon: "rain" }, 53: { desc: "毛毛雨", icon: "rain" }, 55: { desc: "毛毛雨", icon: "rain" },
  56: { desc: "冻毛毛雨", icon: "rain" }, 57: { desc: "冻毛毛雨", icon: "rain" },
  61: { desc: "小雨", icon: "rain" }, 63: { desc: "中雨", icon: "rain" }, 65: { desc: "大雨", icon: "rain" },
  66: { desc: "冻雨", icon: "rain" }, 67: { desc: "冻雨", icon: "rain" },
  71: { desc: "小雪", icon: "snow" }, 73: { desc: "中雪", icon: "snow" }, 75: { desc: "大雪", icon: "snow" }, 77: { desc: "雪粒", icon: "snow" },
  80: { desc: "阵雨", icon: "rain" }, 81: { desc: "阵雨", icon: "rain" }, 82: { desc: "强阵雨", icon: "rain" },
  85: { desc: "阵雪", icon: "snow" }, 86: { desc: "阵雪", icon: "snow" },
  95: { desc: "雷阵雨", icon: "thunder" }, 96: { desc: "雷阵雨伴冰雹", icon: "thunder" }, 99: { desc: "雷阵雨伴冰雹", icon: "thunder" },
};

function weatherSVG(type) {
  const cloud = `<path d="M13 28 a8 8 0 0 1 1 -16 a11 11 0 0 1 21 2 a7 7 0 0 1 1 14 Z" fill="rgba(255,255,255,0.12)" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`;
  const sun = `<circle cx="16" cy="16" r="6" fill="#ffd166" stroke="currentColor" stroke-width="3"/><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M16 4 V8"/><path d="M5 16 H9"/><path d="M8 8 L11 11"/><path d="M24 8 L21 11"/></g>`;
  const open = `<svg viewBox="0 0 48 48" width="56" height="56">`;
  const close = `</svg>`;
  switch (type) {
    case "sun":
      return `${open}<circle cx="24" cy="24" r="9" fill="#ffd166" stroke="currentColor" stroke-width="3"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M24 6 V11"/><path d="M24 37 V42"/><path d="M6 24 H11"/><path d="M37 24 H42"/><path d="M11 11 L15 15"/><path d="M33 33 L37 37"/><path d="M37 11 L33 15"/><path d="M15 33 L11 37"/></g>${close}`;
    case "suncloud":
      return `${open}${sun}${cloud}${close}`;
    case "cloud":
      return `${open}${cloud}${close}`;
    case "fog":
      return `${open}${cloud}<g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 38 H34"/><path d="M16 43 H30"/></g>${close}`;
    case "rain":
      return `${open}${cloud}<g stroke="#0a84ff" stroke-width="3" stroke-linecap="round"><path d="M17 32 L15 39"/><path d="M25 32 L23 39"/><path d="M33 32 L31 39"/></g>${close}`;
    case "snow":
      return `${open}${cloud}<g fill="#0a84ff"><circle cx="17" cy="36" r="1.8"/><circle cx="25" cy="39" r="1.8"/><circle cx="33" cy="36" r="1.8"/></g>${close}`;
    case "thunder":
      return `${open}${cloud}<path d="M25 30 L20 40 L25 40 L22 47" fill="#ffd166" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${close}`;
    default:
      return `${open}${cloud}${close}`;
  }
}

const WX_CLASS = { sun: "sun", suncloud: "suncloud", cloud: "cloud", fog: "fog", rain: "rain", snow: "snow", thunder: "thunder" };
function applyTheme(icon, isDay) {
  document.body.dataset.weather = WX_CLASS[icon] || "cloud";
  document.body.dataset.time = isDay === 1 ? "day" : "night";
  // 夜间天气图标改为冷蓝调
  document.getElementById("w-ico").style.color = isDay === 1 ? "#ffb02e" : "#9cc2ff";
}

let currentCity = "北京";
let currentLat = null, currentLon = null, currentLabel = "北京";

function setWeatherError(msg) {
  document.getElementById("w-desc").textContent = msg;
  document.getElementById("w-temp").textContent = "--";
  document.getElementById("weather").classList.add("error");
}

const WIND_DIRS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
function degToDir(deg) {
  if (deg === null || deg === undefined || isNaN(deg)) return "";
  return WIND_DIRS[Math.round(deg / 45) % 8];
}

async function renderWeather(lat, lon, label) {
  try {
    const w = await fetch(`${FC_API}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day,uv_index&hourly=temperature_2m&forecast_days=1&timezone=auto`);
    if (!w.ok) throw new Error("net");
    const wj = await w.json();
    const c = wj.current;
    const info = WMO[c.weather_code] || { desc: "未知", icon: "cloud" };
    document.getElementById("w-ico").innerHTML = weatherSVG(info.icon);
    document.getElementById("w-temp").textContent = Math.round(c.temperature_2m);
    document.getElementById("w-desc").textContent = info.desc;
    document.getElementById("w-city").textContent = label;
    document.getElementById("w-feel").textContent = Math.round(c.apparent_temperature);
    document.getElementById("w-hum").textContent = c.relative_humidity_2m;
    document.getElementById("w-wind").textContent = `${Math.round(c.wind_speed_10m)} km/h ${degToDir(c.wind_direction_10m)}`;
    document.getElementById("weather").classList.remove("error");
    applyTheme(info.icon, c.is_day);
    currentLat = lat; currentLon = lon; currentLabel = label;
    currentCity = label.split(" · ")[0];
    try { localStorage.setItem("tiaqi_last_city", JSON.stringify({ lat, lon, label })); } catch (e) {}
    const factEl = document.getElementById("wx-fact");
    if (factEl) factEl.textContent = FACTS[info.icon] || FACTS.cloud;
    renderIndices(c);
    renderTrend(wj);
    updateCityActive();
    fetchAQI(lat, lon).then(renderAQI).catch(() => {});
  } catch (e) {
    setWeatherError("天气获取失败，请稍后重试");
  }
}

async function loadWeather(city) {
  try {
    const g = await fetch(`${GEO_API}?name=${encodeURIComponent(city)}&language=zh&count=1&format=json`);
    const gj = await g.json();
    if (!gj.results || !gj.results.length) { setWeatherError(`未找到城市：${city}`); return; }
    const loc = gj.results[0];
    const region = loc.country ? ` · ${loc.country}` : (loc.admin1 ? ` · ${loc.admin1}` : "");
    const label = `${loc.name}${region}`;
    await renderWeather(loc.latitude, loc.longitude, label);
  } catch (e) {
    setWeatherError("天气获取失败，请稍后重试");
  }
}

/* ============================================================
   空气质量（Open-Meteo 免费，支持浏览器跨域）
   ============================================================ */
async function fetchAQI(lat, lon) {
  const r = await fetch(`${AIR_API}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10&timezone=auto`);
  if (!r.ok) throw new Error("aqi");
  return await r.json();
}
function aqiLevel(v) {
  if (v == null) return { t: "—", c: "var(--muted)" };
  if (v <= 50) return { t: "优", c: "#34c759" };
  if (v <= 100) return { t: "良", c: "#ffd60a" };
  if (v <= 150) return { t: "轻度污染", c: "#ff9f0a" };
  if (v <= 200) return { t: "中度污染", c: "#ff453a" };
  if (v <= 300) return { t: "重度污染", c: "#a21caf" };
  return { t: "严重污染", c: "#7a1fa2" };
}
function renderAQI(j) {
  const valEl = document.getElementById("w-aqi-val");
  const labEl = document.getElementById("w-aqi-label");
  const dotEl = document.getElementById("w-aqi-dot");
  if (!j || !j.current || j.current.us_aqi == null) {
    valEl.textContent = "--"; labEl.textContent = "—"; return;
  }
  const v = Math.round(j.current.us_aqi);
  const lv = aqiLevel(v);
  const pm = j.current.pm2_5 != null ? ` · PM2.5 ${Math.round(j.current.pm2_5)}` : "";
  valEl.textContent = v;
  labEl.textContent = lv.t + pm;
  dotEl.style.color = lv.c;
}

/* ============================================================
   生活指数（由实时数据推算）
   ============================================================ */
function renderIndices(c) {
  const ap = c.apparent_temperature;
  let dress;
  if (ap < 5) dress = "羽绒棉服";
  else if (ap < 11) dress = "厚外套";
  else if (ap < 17) dress = "夹克长袖";
  else if (ap < 23) dress = "薄长袖";
  else if (ap < 28) dress = "短袖单衣";
  else dress = "清凉夏装";
  const uv = c.uv_index != null ? c.uv_index : 0;
  let uvT;
  if (uv < 3) uvT = "弱";
  else if (uv < 6) uvT = "中等";
  else if (uv < 8) uvT = "强";
  else if (uv < 11) uvT = "很强";
  else uvT = "极强";
  const code = c.weather_code;
  let out;
  if (code >= 95) out = "不宜外出";
  else if (code >= 71 || (code >= 61 && code <= 67)) out = "带伞出行";
  else if (code >= 45) out = "注意防雾";
  else if (code <= 2) out = "适宜出行";
  else out = "正常出行";
  const arr = [
    { k: "穿衣", v: dress },
    { k: "紫外线", v: uvT },
    { k: "出行", v: out },
  ];
  document.getElementById("w-indices").innerHTML =
    arr.map((x) => `<span class="idx-chip"><b>${x.k}</b><span>${x.v}</span></span>`).join("");
}

/* ============================================================
   未来 24 小时温度趋势
   ============================================================ */
function renderTrend(wj) {
  const svg = document.getElementById("w-trend");
  const tempEl = document.getElementById("w-trend-temp");
  if (!svg || !wj || !wj.hourly) return;
  const times = wj.hourly.time, temps = wj.hourly.temperature_2m;
  if (!times || !temps) return;
  const nowH = new Date().getHours();
  const pad = String(nowH).padStart(2, "0");
  let idx = times.findIndex((t) => t.slice(11, 13) === pad);
  if (idx < 0) idx = 0;
  const slice = temps.slice(idx, idx + 24);
  if (slice.length < 2) return;
  const w = 320, h = 72, padX = 6, padY = 12;
  const min = Math.min(...slice), max = Math.max(...slice);
  const span = max - min || 1;
  const pts = slice.map((t, i) => {
    const x = padX + (i / (slice.length - 1)) * (w - padX * 2);
    const y = h - padY - ((t - min) / span) * (h - padY * 2);
    return [x, y];
  });
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
  tempEl.textContent = `${Math.round(min)}° ~ ${Math.round(max)}°`;
  svg.innerHTML =
    `<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="rgba(0,113,227,0.35)"/>
       <stop offset="100%" stop-color="rgba(0,113,227,0)"/>
     </linearGradient></defs>
     <path d="${area}" fill="url(#tg)"/>
     <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
}

/* ============================================================
   多城市快捷切换
   ============================================================ */
const CITIES = ["北京", "上海", "广州", "深圳", "成都", "杭州", "西安", "武汉"];
function renderCityBar() {
  const bar = document.getElementById("city-bar");
  if (!bar) return;
  bar.innerHTML = CITIES.map((c) => `<button class="city-chip" data-city="${c}">${c}</button>`).join("");
  bar.querySelectorAll(".city-chip").forEach((btn) => {
    btn.addEventListener("click", () => loadWeather(btn.dataset.city));
  });
  updateCityActive();
}
function updateCityActive() {
  const bar = document.getElementById("city-bar");
  if (!bar) return;
  bar.querySelectorAll(".city-chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.city === currentCity);
  });
}

/* ============================================================
   IP 地理定位（多层兜底，重点解决国内识别失败）
   顺序：ipapi.co(坐标) → ipinfo.io(坐标) → 太平洋电脑网 JSONP(城市名)
        → 兜底北京
   ============================================================ */
function fetchJSON(url, ms = 6000) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("http"); return r.json(); })
      .then((j) => { clearTimeout(t); resolve(j); })
      .catch((err) => { clearTimeout(t); reject(err); });
  });
}

// 太平洋电脑网：国内最稳，返回城市名（JSONP，可绕过 fetch 跨域限制）
function pconlineGeo() {
  return new Promise((resolve) => {
    const cb = "pc_geo_" + Date.now();
    const s = document.createElement("script");
    const to = setTimeout(() => { cleanup(); resolve(null); }, 7000);
    function cleanup() {
      clearTimeout(to);
      try { delete window[cb]; } catch (e) {}
      if (s.parentNode) s.parentNode.removeChild(s);
    }
    window[cb] = (d) => { cleanup(); resolve(d || null); };
    s.onerror = () => { cleanup(); resolve(null); };
    s.src = "https://whois.pconline.com.cn/ipJson.jsp?callback=" + cb;
    document.head.appendChild(s);
  });
}

async function detectLocation() {
  // 1) ipapi.co：含经纬度
  try {
    const d = await fetchJSON("https://ipapi.co/json/", 6000);
    if (d && d.latitude && d.longitude) {
      const label = [d.city, d.country_name].filter(Boolean).join(" · ");
      return { lat: +d.latitude, lon: +d.longitude, label: label || "当前位置" };
    }
  } catch (e) {}
  // 2) ipinfo.io：含经纬度
  try {
    const d = await fetchJSON("https://ipinfo.io/json", 6000);
    if (d && d.loc) {
      const [lat, lon] = d.loc.split(",").map(Number);
      if (lat && lon) {
        const label = [d.city, d.country].filter(Boolean).join(" · ");
        return { lat, lon, label: label || "当前位置" };
      }
    }
  } catch (e) {}
  // 3) 太平洋电脑网（仅城市名，国内可达）
  try {
    const d = await pconlineGeo();
    if (d && d.city) {
      const label = d.city;
      return { city: d.city, label };
    }
  } catch (e) {}
  return null;
}

async function initLocation() {
  // 0) 优先恢复上次查看的城市（修复刷新后搜索结果不保留）
  try {
    const saved = JSON.parse(localStorage.getItem("tiaqi_last_city") || "null");
    if (saved && saved.lat != null && saved.lon != null) {
      await renderWeather(saved.lat, saved.lon, saved.label || "上次城市");
      return;
    }
  } catch (e) {}
  const loc = await detectLocation();
  if (loc && loc.lat && loc.lon) {
    await renderWeather(loc.lat, loc.lon, loc.label || "当前位置");
  } else if (loc && loc.city) {
    // 只有城市名：用 Open-Meteo 地理编码取坐标
    loadWeather(loc.city);
  } else {
    loadWeather("北京");
  }
}
initLocation();
renderCityBar();

document.getElementById("w-search").addEventListener("click", () => {
  const v = document.getElementById("w-input").value.trim();
  if (v) loadWeather(v);
});
document.getElementById("w-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const v = e.target.value.trim();
    if (v) loadWeather(v);
  }
});
/* ============================================================
   搜索·热点抽屉（左上角按钮打开）
   ============================================================ */
function openNews() { document.body.classList.add("news-open"); }
function closeNews() { document.body.classList.remove("news-open"); }
document.getElementById("news-open").addEventListener("click", openNews);
document.getElementById("news-close").addEventListener("click", closeNews);

// 网页搜索：接入搜索引擎（Bing，免密钥，新窗口打开）
function webSearch() {
  const v = document.getElementById("web-input").value.trim();
  if (v) window.open("https://www.bing.com/search?q=" + encodeURIComponent(v), "_blank", "noopener");
}
document.getElementById("web-go").addEventListener("click", webSearch);
document.getElementById("web-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") webSearch();
});

// 热点新闻：60s API（免费已验证），点击跳转该新闻的来源检索页
async function loadNews() {
  const box = document.getElementById("news-list");
  if (!box) return;
  try {
    const r = await fetchJSON("https://60s.viki.moe/v2/60s", 8000);
    const items = r && r.data && r.data.news;
    if (!items || !items.length) throw new Error("empty");
    box.innerHTML = items.slice(0, 15).map((t, i) => {
      const url = "https://www.bing.com/search?q=" + encodeURIComponent(t.slice(0, 30));
      return `<a class="news-item" href="${url}" target="_blank" rel="noopener">
        <span class="hot">${String(i + 1).padStart(2, "0")}</span>${t}</a>`;
    }).join("");
  } catch (e) {
    box.innerHTML = `<p class="news-empty">热点加载失败，请稍后重试</p>`;
  }
}
loadNews();
setInterval(loadNews, 30 * 60 * 1000);

// 定时刷新（用已知坐标或城市）
setInterval(() => {
  if (currentLat != null && currentLon != null) renderWeather(currentLat, currentLon, currentLabel);
  else loadWeather(currentCity);
}, 10 * 60 * 1000);

/* ============================================================
   二十四节气（21 世纪寿星公式）+ 天气小百科
   ============================================================ */
const TERMS = [
  { n: "小寒", m: 1,  c: 5.4055, d: "天渐寒，尚未大冷，隆冬将至。" },
  { n: "大寒", m: 1,  c: 20.12,  d: "一年中最冷的时节，注意防寒保暖。" },
  { n: "立春", m: 2,  c: 3.87,   d: "春季开始，万物复苏，大地回暖。" },
  { n: "雨水", m: 2,  c: 18.73,  d: "降水渐增，冰雪融化，润物无声。" },
  { n: "惊蛰", m: 3,  c: 5.63,   d: "春雷始鸣，惊醒蛰伏的昆虫。" },
  { n: "春分", m: 3,  c: 20.646, d: "昼夜平分，莺飞草长，春意正浓。" },
  { n: "清明", m: 4,  c: 4.81,   d: "气清景明，踏青祭祖，慎终追远。" },
  { n: "谷雨", m: 4,  c: 20.1,   d: "雨生百谷，播种移苗的最佳时节。" },
  { n: "立夏", m: 5,  c: 5.52,   d: "夏季开始，万物繁茂，绿意渐浓。" },
  { n: "小满", m: 5,  c: 21.04,  d: "麦类等夏熟作物籽粒开始饱满。" },
  { n: "芒种", m: 6,  c: 5.678,  d: "有芒之谷可种，农忙时节到来。" },
  { n: "夏至", m: 6,  c: 21.37,  d: "白昼最长，盛夏将临，注意防暑。" },
  { n: "小暑", m: 7,  c: 7.108,  d: "暑气上升，尚未最热，茉莉飘香。" },
  { n: "大暑", m: 7,  c: 22.83,  d: "一年中最热，防暑降温是关键。" },
  { n: "立秋", m: 8,  c: 7.5,    d: "秋季开始，暑去凉来，一叶知秋。" },
  { n: "处暑", m: 8,  c: 23.13,  d: "暑气至此而止，秋意渐显。" },
  { n: "白露", m: 9,  c: 7.646,  d: "天气转凉，清晨草木凝露。" },
  { n: "秋分", m: 9,  c: 23.042, d: "昼夜再次平分，秋高气爽。" },
  { n: "寒露", m: 10, c: 8.318,  d: "露气寒冷，深秋将至，添衣保暖。" },
  { n: "霜降", m: 10, c: 23.438, d: "初霜出现，昼夜温差加大。" },
  { n: "立冬", m: 11, c: 7.438,  d: "冬季开始，万物收藏。" },
  { n: "小雪", m: 11, c: 22.36,  d: "初雪将至，北方渐寒。" },
  { n: "大雪", m: 12, c: 7.18,   d: "降雪增多，瑞雪兆丰年。" },
  { n: "冬至", m: 12, c: 21.94,  d: "白昼最短，数九寒天从此开始。" }
];
// 21 世纪通用：D = [Y×0.2422 + C] − L，L = (Y−1)/4
function termDate(year, t) {
  const y = year % 100;
  return Math.floor(y * 0.2422 + t.c) - Math.floor((y - 1) / 4);
}
const FACTS = {
  sun: "晴天地面散热快，昼夜温差往往更大，适合晾晒与户外活动。",
  suncloud: "云朵是天空的调温器：白天遮阳降温，夜间保温防冻。",
  cloud: "云由无数小水滴或冰晶组成，云越厚，颜色越显灰白。",
  fog: "雾其实是贴近地面的云——湿度接近饱和时水汽凝结而成。",
  rain: "雨滴由云中水汽凝结增长而成，夏天的雷阵雨多在午后出现。",
  snow: "雪花多为六角形，形状随温度与湿度千变万化。",
  thunder: "雷电是云内电荷的剧烈放电，雷声在空气中约每秒传播340米。"
};
function renderTerms() {
  const now = new Date();
  const y = now.getFullYear();
  const list = [];
  for (const yy of [y - 1, y, y + 1])
    for (const t of TERMS) list.push({ ...t, year: yy, day: termDate(yy, t) });
  let cur = null, next = null;
  for (const t of list) {
    const d = new Date(t.year, t.m - 1, t.day);
    if (d <= now) cur = t;
    else { next = t; break; }
  }
  if (!cur) return;
  const nameTxt = `${cur.n} · ${cur.m}月${cur.day}日`;
  const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setT("term-name", nameTxt);
  setT("h-term-name", nameTxt);
  setT("term-desc", cur.d);
  setT("h-term-desc", cur.d);
  if (next) {
    const diff = Math.ceil((new Date(next.year, next.m - 1, next.day) - now) / 86400000);
    const nextTxt = `下一节气：${next.n}（${next.m}月${next.day}日 · 还有 ${diff} 天）`;
    setT("term-next", nextTxt);
    setT("h-term-next", nextTxt);
  }
  const grid = document.getElementById("term-grid");
  if (grid) {
    grid.innerHTML = "";
  }
  const big = document.getElementById("term-big");
  if (big) {
    big.innerHTML = TERMS.map((t) => {
      const dd = termDate(y, t);
      const isCur = cur.year === y && cur.n === t.n;
      return `<div class="term-bigcell${isCur ? " cur" : ""}">
        <div class="n">${t.n}</div><div class="d">${t.m}月${dd}日</div>
        <div class="desc">${t.d}</div></div>`;
    }).join("");
  }
}
renderTerms();

/* ============================================================
   背景：夜间星点（柔和）
   ============================================================ */
(function stars() {
  const box = document.getElementById("bg-stars");
  if (!box) return;
  const n = 70;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i");
    s.style.left = (Math.random() * 100).toFixed(2) + "%";
    s.style.top = (Math.random() * 70).toFixed(2) + "%";
    s.style.opacity = (0.3 + Math.random() * 0.6).toFixed(2);
    s.style.transform = "scale(" + (0.5 + Math.random() * 1.3).toFixed(2) + ")";
    frag.appendChild(s);
  }
  box.appendChild(frag);
})();

/* ============================================================
   欢迎页：Apple 激活风 + 轻缓粒子渐隐
   ============================================================ */
(function welcome() {
  const overlay = document.getElementById("welcome");
  const canvas = document.getElementById("welcome-canvas");
  if (!overlay || !canvas) return;

  // 本会话已进入过则直接隐藏
  if (sessionStorage.getItem("ql_welcomed")) {
    overlay.style.display = "none";
    return;
  }

  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, particles = [], dissipating = false, raf = 0;

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.floor(innerWidth * dpr);
    H = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
  }
  function seed() {
    particles = [];
    const n = Math.min(90, Math.floor((innerWidth * innerHeight) / 16000));
    for (let i = 0; i < n; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vy: -(0.15 + Math.random() * 0.3) * dpr,   // 缓慢上浮
        r: (Math.random() * 1.4 + 0.8) * dpr,
        a: Math.random() * 0.4 + 0.2
      });
    }
  }
  size(); seed();

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.y += p.vy;
      if (!dissipating && p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      if (dissipating) p.a *= 0.95;
      ctx.beginPath();
      ctx.fillStyle = `rgba(0,113,227,${(dissipating ? p.a : p.a * 0.7).toFixed(3)})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (dissipating && particles.every((p) => p.a < 0.03)) { end(); return; }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (dissipating) return;
    dissipating = true;
    overlay.classList.add("leave");
  }
  function end() {
    cancelAnimationFrame(raf);
    overlay.style.display = "none";
    sessionStorage.setItem("ql_welcomed", "1");
  }

  overlay.addEventListener("click", start);
  document.getElementById("welcome-enter").addEventListener("click", (e) => { e.stopPropagation(); start(); });
  window.addEventListener("resize", () => { if (!dissipating) { size(); seed(); } });

  frame();
})();
