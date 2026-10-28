/* ============================================================
   在线小工具箱 - 纯前端交互逻辑
   ============================================================ */

/* ---------- Tab 切换 ---------- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => {
      const active = t === tab;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active);
    });
    document.querySelectorAll(".panel").forEach((p) => {
      const show = p.id === target;
      p.classList.toggle("active", show);
      p.hidden = !show;
    });
  });
});

/* ---------- 复制工具 ---------- */
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const old = btn.textContent;
      btn.textContent = "已复制";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = old;
        btn.classList.remove("copied");
      }, 1200);
    }
  });
}
document.querySelectorAll(".btn-copy[data-copy]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const el = document.getElementById(btn.dataset.copy);
    copyText(el.textContent, btn);
  });
});

/* ============================================================
   1. 密码生成器
   ============================================================ */
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUM = "0123456789";
const SYM = "!@#$%^&*()-_=+[]{};:,.<>?";

const pwOutput = document.getElementById("pw-output");
const pwLen = document.getElementById("pw-len");
const pwLenVal = document.getElementById("pw-len-val");
const pwStrength = document.getElementById("pw-strength");

pwLen.addEventListener("input", () => (pwLenVal.textContent = pwLen.value));

function generatePassword() {
  const len = +pwLen.value;
  let pool = "";
  if (document.getElementById("opt-lower").checked) pool += LOWER;
  if (document.getElementById("opt-upper").checked) pool += UPPER;
  if (document.getElementById("opt-num").checked) pool += NUM;
  if (document.getElementById("opt-sym").checked) pool += SYM;
  if (!pool) {
    pwOutput.value = "";
    pwStrength.textContent = "强度：请至少选择一种字符";
    pwStrength.style.color = "var(--danger)";
    return;
  }
  let pwd = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) pwd += pool[arr[i] % pool.length];
  pwOutput.value = pwd;
  rateStrength(pwd, pool);
}

function rateStrength(pwd, pool) {
  let score = pwd.length >= 12 ? 1 : 0;
  if (pwd.length >= 16) score++;
  if (pool.length >= 26 + 10) score++;
  if (pool.length >= 26 + 10 + 10) score++;
  const map = [
    ["弱", "var(--danger)"],
    ["中", "var(--warn)"],
    ["强", "var(--ok)"],
    ["极强", "var(--ok)"],
  ];
  const [label, color] = map[Math.min(score, 3)];
  pwStrength.textContent = `强度：${label}`;
  pwStrength.style.color = color;
}

document.getElementById("pw-gen").addEventListener("click", generatePassword);
document.getElementById("pw-copy").addEventListener("click", (e) =>
  copyText(pwOutput.value, e.currentTarget)
);
generatePassword();

/* ============================================================
   2. 单位换算
   ============================================================ */
const UNITS = {
  length: {
    name: "长度",
    base: "m",
    factors: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, mi: 1609.34 },
  },
  weight: {
    name: "重量",
    base: "kg",
    factors: { mg: 0.000001, g: 0.001, kg: 1, t: 1000, lb: 0.453592, oz: 0.0283495 },
  },
  temp: { name: "温度", special: true },
};

const convType = document.getElementById("conv-type");
const convFrom = document.getElementById("conv-from");
const convFromUnit = document.getElementById("conv-from-unit");
const convTo = document.getElementById("conv-to");
const convToUnit = document.getElementById("conv-to-unit");

function fillUnits() {
  const t = convType.value;
  if (t === "temp") {
    const arr = ["°C", "°F", "K"];
    [convFromUnit, convToUnit].forEach((sel) => {
      sel.innerHTML = arr.map((u) => `<option>${u}</option>`).join("");
    });
    convToUnit.selectedIndex = 1;
  } else {
    const keys = Object.keys(UNITS[t].factors);
    [convFromUnit, convToUnit].forEach((sel, i) => {
      sel.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join("");
      sel.selectedIndex = i === 1 ? 1 : 0;
    });
  }
  convert();
}

function convert() {
  const t = convType.value;
  const v = parseFloat(convFrom.value);
  if (isNaN(v)) {
    convTo.value = "";
    return;
  }
  let result;
  if (t === "temp") {
    result = convertTemp(v, convFromUnit.value, convToUnit.value);
  } else {
    const f = UNITS[t].factors;
    const inBase = v * f[convFromUnit.value];
    result = inBase / f[convToUnit.value];
  }
  convTo.value = Number(result.toFixed(6)).toString();
}

function convertTemp(v, from, to) {
  let c;
  if (from === "°C") c = v;
  else if (from === "°F") c = ((v - 32) * 5) / 9;
  else c = v - 273.15;
  if (to === "°C") return c;
  if (to === "°F") return (c * 9) / 5 + 32;
  return c + 273.15;
}

convType.addEventListener("change", fillUnits);
[convFrom, convFromUnit, convToUnit].forEach((el) =>
  el.addEventListener("input", convert)
);
fillUnits();

/* ============================================================
   3. 番茄钟
   ============================================================ */
const WORK = 25 * 60;
const BREAK = 5 * 60;
let remaining = WORK;
let timer = null;
let mode = "work";

const clock = document.getElementById("clock");
const pomoState = document.getElementById("pomo-state");
const pomoToggle = document.getElementById("pomo-toggle");

function fmt(s) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}
function renderClock() {
  clock.textContent = fmt(remaining);
  document.title = `${fmt(remaining)} · ${mode === "work" ? "专注" : "休息"}`;
}

function tick() {
  remaining--;
  if (remaining < 0) {
    clearInterval(timer);
    timer = null;
    mode = mode === "work" ? "break" : "work";
    remaining = mode === "work" ? WORK : BREAK;
    pomoState.textContent = mode === "work" ? "专注时间到，开始休息 🌿" : "休息结束，开始专注 💪";
    renderClock();
    return;
  }
  renderClock();
}

pomoToggle.addEventListener("click", () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    pomoToggle.textContent = "继续";
    pomoState.textContent = "已暂停";
  } else {
    timer = setInterval(tick, 1000);
    pomoToggle.textContent = "暂停";
    pomoState.textContent = mode === "work" ? "专注中…" : "休息中…";
  }
});
document.getElementById("pomo-reset").addEventListener("click", () => {
  clearInterval(timer);
  timer = null;
  mode = "work";
  remaining = WORK;
  pomoToggle.textContent = "开始";
  pomoState.textContent = "准备就绪";
  renderClock();
});
renderClock();

/* ============================================================
   4. 日历（替换原颜色工具）
   ============================================================ */
let calY, calM;
function renderCalendar() {
  const now = new Date();
  if (calY === undefined) {
    calY = now.getFullYear();
    calM = now.getMonth();
  }
  const first = new Date(calY, calM, 1);
  const startDay = first.getDay();
  const days = new Date(calY, calM + 1, 0).getDate();
  const isCur = calY === now.getFullYear() && calM === now.getMonth();
  document.getElementById("cal-title").textContent = `${calY}年${calM + 1}月`;
  const wk = ["日", "一", "二", "三", "四", "五", "六"];
  let html = wk.map((w) => `<div class="cal-wk">${w}</div>`).join("");
  for (let i = 0; i < startDay; i++) html += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const cls = isCur && d === now.getDate() ? "cal-cell today" : "cal-cell";
    html += `<div class="${cls}">${d}</div>`;
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
renderCalendar();

/* ============================================================
   5. 实时天气（Open-Meteo，免费免密钥，支持浏览器跨域）
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

let currentCity = "北京";

function setWeatherError(msg) {
  document.getElementById("w-desc").textContent = msg;
  document.getElementById("w-temp").textContent = "--";
  document.getElementById("weather").classList.add("error");
}

async function loadWeather(city) {
  try {
    const g = await fetch(`${GEO_API}?name=${encodeURIComponent(city)}&language=zh&count=1&format=json`);
    const gj = await g.json();
    if (!gj.results || !gj.results.length) {
      setWeatherError(`未找到城市：${city}`);
      return;
    }
    const loc = gj.results[0];
    const w = await fetch(`${FC_API}?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
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

// 启动时加载默认城市，并每 10 分钟自动刷新
loadWeather("北京");
setInterval(() => loadWeather(currentCity), 10 * 60 * 1000);
