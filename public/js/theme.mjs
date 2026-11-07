import { I18N } from "./i18n/index.js";
import { state } from "./state.mjs";

export function detectBrowserLanguage() {
  const navLang =
    (Array.isArray(navigator.languages) && navigator.languages[0]) ||
    navigator.language ||
    "en";
  return String(navLang).toLowerCase().startsWith("es") ? "es" : "en";
}

export function getEffectiveLang() {
  const pref = state.settings?.language || "auto";
  if (pref === "es" || pref === "en") return pref;
  return detectBrowserLanguage();
}

export function t(key, vars = {}) {
  const lang = getEffectiveLang();
  const dict = I18N[lang] || I18N.en;
  let str = dict[key] || I18N.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

export function detectBrowserTheme() {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export function getEffectiveTheme() {
  const pref = state.settings?.theme || "auto";
  if (pref === "light" || pref === "dark") return pref;
  return detectBrowserTheme();
}

export function hexToRgb(hex) {
  const clean = String(hex || "#00c896").replace("#", "");
  if (clean.length !== 6) return { r: 0, g: 200, b: 150 };
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function applyThemeAndColors(els) {
  const effectiveTheme = getEffectiveTheme();
  document.documentElement.setAttribute("data-theme", effectiveTheme);

  const accent = state.settings?.accentColor || "#00c896";
  const { r, g, b } = hexToRgb(accent);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const onPrimary = luminance > 0.62 ? "#090d16" : "#ffffff";

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--md-sys-color-primary", accent);
  rootStyle.setProperty("--md-sys-color-on-primary", onPrimary);
  rootStyle.setProperty(
    "--md-sys-color-primary-container",
    `rgba(${r}, ${g}, ${b}, ${effectiveTheme === "light" ? 0.16 : 0.22})`
  );

  els.accentColorPicker.value = accent;
  els.accentColorHex.textContent = accent.toLowerCase();
  els.colorSwatches.forEach((sw) => {
    sw.classList.toggle("active", sw.dataset.color.toLowerCase() === accent.toLowerCase());
  });
}