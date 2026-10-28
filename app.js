/* ============================================================
   赛博气象终端 - 逻辑
   首页：自动显示当天日期 + 实时天气（按 IP 定位）+ 农历黄历简略
   侧边栏（第二页）：点按钮滑出，显示完整日历 + 详细农历黄历
   欢迎页：粒子场，点击后向外消散
   背景：JS 生成赛博城市天际线
   ============================================================ */

/* ---------- 自动显示当天日期 ---------- */
function renderDate() {
  const now = new Date();
  const wd = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  document.getElementById("big-date").textContent = `${now.getMonth() + 1}月${now.getDate()}日`;
  document.getElementById("date-sub").textContent = `${now.getFullYear()}年 · ${wd[now.getDay()]}`;
}
renderDate();

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
  const wd = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"];
  document.getElementById("cal-hint").textContent =
    `已选 ${selY}年${selM + 1}月${selD}日 · ${wd[selDate.getDay()]}`;
});

initCal();
renderCalendar();
renderAlmanac(new Date());
renderBrief(new Date());

/* ============================================================
   侧边栏开关
   ============================================================ */
function openSidebar() { document.body.classList.add("sidebar-open"); }
function closeSidebar() { document.body.classList.remove("sidebar-open"); }

document.getElementById("menu-open").addEventListener("click", openSidebar);
document.getElementById("open-detail").addEventListener("click", openSidebar);
document.getElementById("menu-close").addEventListener("click", closeSidebar);
document.getElementById("backdrop").addEventListener("click", closeSidebar);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });

/* ============================================================
   实时天气（Open-Meteo，免费免密钥，支持浏览器跨域）
   默认按访问者 IP 定位显示当地天气；可手动搜索城市
   ============================================================ */
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const FC_API = "https://api.open-meteo.com/v1/forecast";

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
  const cloud = `<path d="M13 28 a8 8 0 0 1 1 -16 a11 11 0 0 1 21 2 a7 7 0 0 1 1 14 Z" fill="rgba(0,240,255,0.10)" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`;
  const sun = `<circle cx="16" cy="16" r="6" fill="#ffd166" stroke="currentColor" stroke-width="3"/><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M16 4 V8"/><path d="M5 16 H9"/><path d="M8 8 L11 11"/><path d="M24 8 L21 11"/></g>`;
  const open = `<svg viewBox="0 0 48 48" width="52" height="52">`;
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
      return `${open}${cloud}<g stroke="#00f0ff" stroke-width="3" stroke-linecap="round"><path d="M17 32 L15 39"/><path d="M25 32 L23 39"/><path d="M33 32 L31 39"/></g>${close}`;
    case "snow":
      return `${open}${cloud}<g fill="#00f0ff"><circle cx="17" cy="36" r="1.8"/><circle cx="25" cy="39" r="1.8"/><circle cx="33" cy="36" r="1.8"/></g>${close}`;
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
    const w = await fetch(`${FC_API}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day&timezone=auto`);
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

/* 按访问者 IP 定位 */
async function detectLocation() {
  try {
    const r = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      if (d && d.latitude && d.longitude) {
        return { lat: d.latitude, lon: d.longitude, city: d.city || "", country: d.country_name || "" };
      }
    }
  } catch (e) { /* 忽略，尝试兜底 */ }
  try {
    const r = await fetch("https://ipinfo.io/json", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      const [lat, lon] = (d.loc || "").split(",").map(Number);
      if (lat && lon) return { lat, lon, city: d.city || "", country: d.country || "" };
    }
  } catch (e) { /* 忽略 */ }
  return null;
}

async function initLocation() {
  const loc = await detectLocation();
  if (loc && loc.lat && loc.lon) {
    const label = [loc.city, loc.country].filter(Boolean).join(" · ");
    await renderWeather(loc.lat, loc.lon, label || "当前位置");
  } else {
    // 兜底：固定城市
    loadWeather("北京");
  }
}
initLocation();

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

// 定时刷新（用已知坐标或城市）
setInterval(() => {
  if (currentLat != null && currentLon != null) renderWeather(currentLat, currentLon, currentLabel);
  else loadWeather(currentCity);
}, 10 * 60 * 1000);

/* ============================================================
   赛博城市天际线（JS 生成霓虹楼宇 SVG）
   ============================================================ */
(function buildCity() {
  const svg = document.getElementById("cyber-city");
  if (!svg) return;
  const W = 1440, H = 360;
  const neon = ["#00f0ff", "#ff2bd6", "#9d4edd", "#ffd166"];
  let html = "";
  let x = 0;
  while (x < W) {
    const bw = 26 + Math.random() * 46;
    const bh = 70 + Math.random() * 250;
    const y = H - bh;
    const color = neon[Math.floor(Math.random() * neon.length)];
    html += `<rect class="bld" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" stroke="${color}" stroke-width="1.2" style="filter:drop-shadow(0 0 4px ${color})"/>`;
    // 窗户
    const cols = Math.max(1, Math.floor(bw / 12));
    const rows = Math.max(1, Math.floor(bh / 18));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.45) {
          const wx = x + 5 + c * 12;
          const wy = y + 8 + r * 18;
          if (wx + 4 < x + bw && wy + 4 < H) {
            html += `<rect class="win" x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="4" height="4" fill="${color}" color="${color}" opacity="${(0.5 + Math.random() * 0.5).toFixed(2)}"/>`;
          }
        }
      }
    }
    x += bw + 4 + Math.random() * 16;
  }
  // 地面霓虹线
  html += `<line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="#00f0ff" stroke-width="2" style="filter:drop-shadow(0 0 6px #00f0ff)"/>`;
  svg.innerHTML = html;
})();

/* ============================================================
   欢迎页：粒子场 + 点击消散
   ============================================================ */
(function welcome() {
  const overlay = document.getElementById("welcome");
  const canvas = document.getElementById("welcome-canvas");
  if (!overlay || !canvas) return;

  // 已在本会话进入过则直接隐藏
  if (sessionStorage.getItem("cyber_welcomed")) {
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
    const n = Math.min(170, Math.floor((innerWidth * innerHeight) / 8500));
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.35 * dpr,
        vy: (Math.random() - 0.5) * 0.35 * dpr,
        r: (Math.random() * 1.6 + 0.6) * dpr,
        color: Math.random() < 0.5 ? "0,240,255" : "255,43,214",
        a: Math.random() * 0.5 + 0.3
      });
    }
  }
  size();
  seed();

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const linkDist = 92 * dpr;
    // 连线
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const dist = Math.hypot(dx, dy);
        if (dist < linkDist) {
          ctx.strokeStyle = `rgba(0,240,255,${(0.14 * (1 - dist / linkDist) * p.a).toFixed(3)})`;
          ctx.lineWidth = dpr;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    }
    // 粒子
    for (const p of particles) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.color},${p.a.toFixed(3)})`;
      ctx.shadowColor = `rgba(${p.color},${p.a.toFixed(3)})`;
      ctx.shadowBlur = 8 * dpr;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    raf = requestAnimationFrame(step);
  }
  function step() {
    ctx.clearRect(0, 0, W, H);
    const linkDist = 92 * dpr;
    for (const p of particles) {
      if (!dissipating) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      } else {
        p.x += p.vx * 9; p.y += p.vy * 9; p.a *= 0.95;
      }
    }
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (dissipating) continue;
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const dist = Math.hypot(dx, dy);
        if (dist < linkDist) {
          ctx.strokeStyle = `rgba(0,240,255,${(0.14 * (1 - dist / linkDist) * p.a).toFixed(3)})`;
          ctx.lineWidth = dpr;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    }
    for (const p of particles) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.color},${p.a.toFixed(3)})`;
      ctx.shadowColor = `rgba(${p.color},${p.a.toFixed(3)})`;
      ctx.shadowBlur = 8 * dpr;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (dissipating && particles.every((p) => p.a < 0.04)) { end(); return; }
    raf = requestAnimationFrame(step);
  }

  function start() {
    if (dissipating) return;
    dissipating = true;
    const cx = W / 2, cy = H / 2;
    for (const p of particles) {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const sp = 4 + Math.random() * 5;
      p.vx = (dx / d) * sp; p.vy = (dy / d) * sp;
    }
    overlay.classList.add("dissolve");
  }
  function end() {
    cancelAnimationFrame(raf);
    overlay.style.display = "none";
    sessionStorage.setItem("cyber_welcomed", "1");
  }

  overlay.addEventListener("click", start);
  document.getElementById("welcome-enter").addEventListener("click", (e) => { e.stopPropagation(); start(); });
  window.addEventListener("resize", () => { if (!dissipating) { size(); seed(); } });

  draw();
})();
