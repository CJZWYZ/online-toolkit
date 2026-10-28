/* ============================================================
   今日 · 天气 · 黄历 - 纯前端逻辑
   首页：自动显示当天日期 + 实时天气 + 农历黄历简略信息
   侧边栏（第二页）：点按钮滑出，显示完整日历 + 详细农历黄历
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

/* 宜 / 忌（按建除十二神） */
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

/* 干支纪日：以 2000-01-01 = 戊午日(序号54) 为基准 */
const BASE_2000 = new Date(2000, 0, 1);
function ganzhiDay(date) {
  const days = Math.round((date - BASE_2000) / 86400000);
  const idx = (((54 + days) % 60) + 60) % 60;
  return { idx, gan: idx % 10, zhi: idx % 12 };
}

/* 三合煞方 */
function shaFang(zhiIdx) {
  const groups = [[0, 4, 8], [2, 6, 10], [3, 7, 11], [1, 5, 9]];
  const dirs = ["南", "北", "西", "东"];
  for (let i = 0; i < groups.length; i++) if (groups[i].includes(zhiIdx)) return dirs[i];
  return "";
}

/* 根据日期计算黄历全部字段（供简略卡 / 详细卡共用） */
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

/* 首页：农历黄历简略信息 */
function renderBrief(date) {
  const a = computeAlmanac(date);
  document.getElementById("b-lunar").textContent = a.lunarText;
  document.getElementById("b-ganzhi").textContent = a.ganzhiText;
  document.getElementById("b-yi").textContent = a.yi;
  document.getElementById("b-ji").textContent = a.ji;
}

/* 侧边栏：详细农历黄历 */
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
   侧边栏日历（可点击，联动黄历）
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
   侧边栏开关（默认收起，点按钮打开 / 第二页）
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
   显示在日期下方；背景随天气 / 昼夜联动
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
  const cloud = `<path d="M13 28 a8 8 0 0 1 1 -16 a11 11 0 0 1 21 2 a7 7 0 0 1 1 14 Z" fill="#e8e8ed" stroke="#1d1d1f" stroke-width="3" stroke-linejoin="round"/>`;
  const sun = `<circle cx="16" cy="16" r="6" fill="#ffd60a" stroke="#1d1d1f" stroke-width="3"/><g stroke="#1d1d1f" stroke-width="2.4" stroke-linecap="round"><path d="M16 4 V8"/><path d="M5 16 H9"/><path d="M8 8 L11 11"/><path d="M24 8 L21 11"/></g>`;
  const open = `<svg viewBox="0 0 48 48" width="52" height="52">`;
  const close = `</svg>`;
  switch (type) {
    case "sun":
      return `${open}<circle cx="24" cy="24" r="9" fill="#ffd60a" stroke="#1d1d1f" stroke-width="3"/><g stroke="#1d1d1f" stroke-width="3" stroke-linecap="round"><path d="M24 6 V11"/><path d="M24 37 V42"/><path d="M6 24 H11"/><path d="M37 24 H42"/><path d="M11 11 L15 15"/><path d="M33 33 L37 37"/><path d="M37 11 L33 15"/><path d="M15 33 L11 37"/></g>${close}`;
    case "suncloud":
      return `${open}${sun}${cloud}${close}`;
    case "cloud":
      return `${open}${cloud}${close}`;
    case "fog":
      return `${open}${cloud}<g stroke="#1d1d1f" stroke-width="3" stroke-linecap="round"><path d="M12 38 H34"/><path d="M16 43 H30"/></g>${close}`;
    case "rain":
      return `${open}${cloud}<g stroke="#0a84ff" stroke-width="3" stroke-linecap="round"><path d="M17 32 L15 39"/><path d="M25 32 L23 39"/><path d="M33 32 L31 39"/></g>${close}`;
    case "snow":
      return `${open}${cloud}<g fill="#0a84ff"><circle cx="17" cy="36" r="1.8"/><circle cx="25" cy="39" r="1.8"/><circle cx="33" cy="36" r="1.8"/></g>${close}`;
    case "thunder":
      return `${open}${cloud}<path d="M25 30 L20 40 L25 40 L22 47" fill="#ffd60a" stroke="#1d1d1f" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${close}`;
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

/* 地区风景背景：根据当前城市获取代表性实景图（维基百科，免费、支持跨域） */
const bgPhoto = document.getElementById("bg-photo");
const bgCaption = document.getElementById("bg-caption");
let bgCityLoaded = "";

async function loadCityImage(city) {
  if (!city || city === bgCityLoaded) return;
  const urls = [
    `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`,
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { accept: "application/json" } });
      if (!r.ok) continue;
      const d = await r.json();
      const src = (d.thumbnail ? d.thumbnail.source : "") || (d.originalimage ? d.originalimage.source : "");
      if (!src) continue;
      const big = src.replace(/\/[\d]+px-/, "/1280px-");
      bgPhoto.style.backgroundImage = `url("${big}")`;
      bgPhoto.classList.add("show");
      bgCaption.textContent = `${city} · 城市实景`;
      bgCaption.classList.add("show");
      bgCityLoaded = city;
      return;
    } catch (e) { /* 忽略，尝试下一个来源 */ }
  }
  // 未取到图片则保持天气渐变背景（优雅降级）
  bgPhoto.classList.remove("show");
  bgCaption.classList.remove("show");
}

function setWeatherError(msg) {
  document.getElementById("w-desc").textContent = msg;
  document.getElementById("w-temp").textContent = "--";
  document.getElementById("weather").classList.add("error");
}

async function loadWeather(city) {
  try {
    const g = await fetch(`${GEO_API}?name=${encodeURIComponent(city)}&language=zh&count=1&format=json`);
    const gj = await g.json();
    if (!gj.results || !gj.results.length) { setWeatherError(`未找到城市：${city}`); return; }
    const loc = gj.results[0];
    const w = await fetch(`${FC_API}?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day&timezone=auto`);
    const wj = await w.json();
    const c = wj.current;
    const info = WMO[c.weather_code] || { desc: "未知", icon: "cloud" };
    document.getElementById("w-ico").innerHTML = weatherSVG(info.icon);
    document.getElementById("w-temp").textContent = Math.round(c.temperature_2m);
    document.getElementById("w-desc").textContent = info.desc;
    const region = loc.country ? `, ${loc.country}` : (loc.admin1 ? `, ${loc.admin1}` : "");
    document.getElementById("w-city").textContent = `${loc.name}${region}`;
    document.getElementById("w-extra").textContent = `湿度 ${c.relative_humidity_2m}% · 风 ${Math.round(c.wind_speed_10m)} km/h`;
    document.getElementById("weather").classList.remove("error");
    currentCity = loc.name;
    applyTheme(info.icon, c.is_day);
    loadCityImage(currentCity);
  } catch (e) {
    setWeatherError("天气获取失败，请稍后重试");
  }
}

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

loadWeather("北京");
setInterval(() => loadWeather(currentCity), 10 * 60 * 1000);
