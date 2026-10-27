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
  if (pool.length >= 26 + 10) score++; // 含字母+数字
  if (pool.length >= 26 + 10 + 10) score++; // 再加符号
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
// 首次加载生成一次
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
   4. 颜色工具
   ============================================================ */
const picker = document.getElementById("color-picker");
const swatch = document.getElementById("color-swatch");
const cHex = document.getElementById("c-hex");
const cRgb = document.getElementById("c-rgb");
const cHsl = document.getElementById("c-hsl");

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function updateColor() {
  const hex = picker.value;
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  swatch.style.background = hex;
  cHex.textContent = hex.toUpperCase();
  cRgb.textContent = `rgb(${r}, ${g}, ${b})`;
  cHsl.textContent = `hsl(${h}, ${s}%, ${l}%)`;
}
picker.addEventListener("input", updateColor);
updateColor();
