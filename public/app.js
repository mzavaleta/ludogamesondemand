import { I18N } from "./js/i18n/index.js";
const STORAGE_KEYS = {
  UI: "ludo_ui_settings_v1",
  AI: "ludo_ai_settings_v1",
  CREATOR_TOKEN: "ludo_creator_token_v1",
  ADMIN_KEY: "ludo_admin_key_v1",
};

function generateRandomCreatorToken() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `creator-${globalThis.crypto.randomUUID()}`;
  }
  return `creator-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function loadLocalBrowserState() {
  let ui = {};
  let ai = {};
  let creatorToken = "";
  let adminKey = "";
  try {
    ui = JSON.parse(localStorage.getItem(STORAGE_KEYS.UI) || "{}");
    ai = JSON.parse(localStorage.getItem(STORAGE_KEYS.AI) || "{}");
    creatorToken = localStorage.getItem(STORAGE_KEYS.CREATOR_TOKEN) || "";
    adminKey = localStorage.getItem(STORAGE_KEYS.ADMIN_KEY) || "";
  } catch {
    // Ignore storage read errors in restricted environments
  }
  if (!creatorToken) {
    creatorToken = generateRandomCreatorToken();
    try {
      localStorage.setItem(STORAGE_KEYS.CREATOR_TOKEN, creatorToken);
    } catch {}
  }

  return {
    settings: {
      provider: ai.provider || "ollama",
      baseUrl: ai.baseUrl !== undefined ? ai.baseUrl : "http://localhost:11434/v1",
      model: ai.model || "qwen2.5-coder:7b",
      apiKey: ai.apiKey || "",
      fallbackToTemplate: ai.fallbackToTemplate !== false,
      language: ui.language || "auto",
      theme: ui.theme || "auto",
      accentColor: ui.accentColor || "#00c896",
    },
    creatorToken,
    adminKey,
  };
}

const initialLocal = loadLocalBrowserState();

const state = {
  games: [],
  currentGame: null,
  settings: initialLocal.settings,
  creatorToken: initialLocal.creatorToken,
  adminKey: initialLocal.adminKey,
  isAdmin: false,
  presets: {},
  searchQuery: "",
};

function saveLocalBrowserSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.UI,
      JSON.stringify({
        language: state.settings.language,
        theme: state.settings.theme,
        accentColor: state.settings.accentColor,
      })
    );
    localStorage.setItem(
      STORAGE_KEYS.AI,
      JSON.stringify({
        provider: state.settings.provider,
        baseUrl: state.settings.baseUrl,
        model: state.settings.model,
        apiKey: state.settings.apiKey,
        fallbackToTemplate: state.settings.fallbackToTemplate,
      })
    );
    localStorage.setItem(STORAGE_KEYS.CREATOR_TOKEN, state.creatorToken);
    localStorage.setItem(STORAGE_KEYS.ADMIN_KEY, state.adminKey);
  } catch {
    // Ignore quota errors
  }
}

const els = {
  views: document.querySelectorAll(".view"),
  navTabs: document.querySelectorAll(".nav-tab"),
  activeProviderBadge: document.getElementById("activeProviderBadge"),
  quickCreateBtn: document.getElementById("quickCreateBtn"),
  searchInput: document.getElementById("searchInput"),
  importBtn: document.getElementById("importBtn"),
  importFileInput: document.getElementById("importFileInput"),
  libraryGrid: document.getElementById("libraryGrid"),
  promptForm: document.getElementById("promptForm"),
  promptFormTitle: document.getElementById("promptFormTitle"),
  promptFormSub: document.getElementById("promptFormSub"),
  promptLabelText: document.getElementById("promptLabelText"),
  resetPromptModeBtn: document.getElementById("resetPromptModeBtn"),
  editingGameId: document.getElementById("editingGameId"),
  gameTitleInput: document.getElementById("gameTitleInput"),
  gamePromptInput: document.getElementById("gamePromptInput"),
  submitPromptBtn: document.getElementById("submitPromptBtn"),
  codeEditorDetails: document.getElementById("codeEditorDetails"),
  promptHistoryBlock: document.getElementById("promptHistoryBlock"),
  rawHtmlInput: document.getElementById("rawHtmlInput"),
  savedPromptView: document.getElementById("savedPromptView"),
  copySavedPromptBtn: document.getElementById("copySavedPromptBtn"),
  reuseSavedPromptBtn: document.getElementById("reuseSavedPromptBtn"),
  saveRawHtmlBtn: document.getElementById("saveRawHtmlBtn"),
  revisionList: document.getElementById("revisionList"),
  playingTitle: document.getElementById("playingTitle"),
  playingDescription: document.getElementById("playingDescription"),
  playingMeta: document.getElementById("playingMeta"),
  gameIframe: document.getElementById("gameIframe"),
  iframeContainer: document.getElementById("iframeContainer"),
  playView: document.getElementById("view-play"),
  bottomNav: document.querySelector(".bottom-nav"),
  playerActions: document.querySelector(".player-actions"),
  reloadGameBtn: document.getElementById("reloadGameBtn"),
  cloneCurrentBtn: document.getElementById("cloneCurrentBtn"),
  modifyCurrentBtn: document.getElementById("modifyCurrentBtn"),
  fullscreenGameBtn: document.getElementById("fullscreenGameBtn"),
  langSelect: document.getElementById("langSelect"),
  themeSelect: document.getElementById("themeSelect"),
  colorSwatches: document.querySelectorAll(".color-swatch"),
  accentColorPicker: document.getElementById("accentColorPicker"),
  accentColorHex: document.getElementById("accentColorHex"),
  creatorTokenInput: document.getElementById("creatorTokenInput"),
  copyCreatorTokenBtn: document.getElementById("copyCreatorTokenBtn"),
  adminPortalForm: document.getElementById("adminPortalForm"),
  adminPortalKeyInput: document.getElementById("adminPortalKeyInput"),
  verifyAdminBtn: document.getElementById("verifyAdminBtn"),
  logoutAdminBtn: document.getElementById("logoutAdminBtn"),
  adminStatusBadge: document.getElementById("adminStatusBadge"),
  settingsForm: document.getElementById("settingsForm"),
  providerSelect: document.getElementById("providerSelect"),
  baseUrlInput: document.getElementById("baseUrlInput"),
  modelSelect: document.getElementById("modelSelect"),
  loadModelsBtn: document.getElementById("loadModelsBtn"),
  modelHint: document.getElementById("modelHint"),
  modelInput: document.getElementById("modelInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  fallbackToggle: document.getElementById("fallbackToggle"),
  testProviderBtn: document.getElementById("testProviderBtn"),
  toast: document.getElementById("toast"),
};

function detectBrowserLanguage() {
  const navLang =
    (Array.isArray(navigator.languages) && navigator.languages[0]) ||
    navigator.language ||
    "en";
  return String(navLang).toLowerCase().startsWith("es") ? "es" : "en";
}

function getEffectiveLang() {
  const pref = state.settings?.language || "auto";
  if (pref === "es" || pref === "en") return pref;
  return detectBrowserLanguage();
}

function t(key, vars = {}) {
  const lang = getEffectiveLang();
  const dict = I18N[lang] || I18N.en;
  let str = dict[key] || I18N.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

function detectBrowserTheme() {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

function getEffectiveTheme() {
  const pref = state.settings?.theme || "auto";
  if (pref === "light" || pref === "dark") return pref;
  return detectBrowserTheme();
}

function hexToRgb(hex) {
  const clean = String(hex || "#00c896").replace("#", "");
  if (clean.length !== 6) return { r: 0, g: 200, b: 150 };
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function applyThemeAndColors() {
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

function renderAdminBadge() {
  if (!els.adminStatusBadge) return;
  els.adminStatusBadge.textContent = state.isAdmin
    ? t("setup.adminActive")
    : t("setup.adminInactive");
  els.adminStatusBadge.style.color = state.isAdmin
    ? "var(--md-sys-color-primary)"
    : "var(--md-sys-color-on-surface-variant)";

  // Importing injects foreign code into the shared library: admin-only.
  els.importBtn.classList.toggle("hidden", !state.isAdmin);
}

function applyTranslations() {
  const lang = getEffectiveLang();
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  });

  if (els.editingGameId.value && state.currentGame) {
    els.promptFormTitle.textContent = t("prompt.modifyTitle", { title: state.currentGame.title });
    els.promptFormSub.textContent = t("prompt.modifySub");
    els.promptLabelText.textContent = t("prompt.questionModify");
    els.gamePromptInput.placeholder = t("prompt.questionPlaceholderModify");
    els.submitPromptBtn.textContent = t("prompt.modifyBtn");
  } else {
    els.promptFormTitle.textContent = t("prompt.createTitle");
    els.promptFormSub.textContent = t("prompt.createSub");
    els.promptLabelText.textContent = t("prompt.questionCreate");
    els.gamePromptInput.placeholder = t("prompt.questionPlaceholderCreate");
    els.submitPromptBtn.textContent = t("prompt.generateBtn");
  }

  renderProviderBadge();
  renderAdminBadge();
  renderLibrary();
  updatePlayerToolbarState();

  // The manual-entry option is created imperatively, so keep its label in sync with the language.
  const customOption = els.modelSelect?.querySelector(`option[value="${CUSTOM_MODEL}"]`);
  if (customOption) customOption.textContent = t("setup.customModelOption");
  renderModelHint();
}

function updatePlayerToolbarState() {
  if (state.currentGame) {
    const revCount = Array.isArray(state.currentGame.revisions)
      ? state.currentGame.revisions.length
      : 1;
    els.playingTitle.textContent = state.currentGame.title;
    els.playingDescription.textContent = state.currentGame.prompt || "";
    els.playingMeta.textContent = `${state.currentGame.provider} • ${t("play.revisions", {
      count: revCount,
    })}`;
    els.modifyCurrentBtn.classList.toggle("hidden", !state.currentGame.canEdit);
    syncPlayerActionLayout();
    renderRevisions(state.currentGame);
  } else {
    els.playingTitle.textContent = t("play.selectGame");
    els.playingDescription.textContent = "";
    els.modifyCurrentBtn.classList.add("hidden");
    syncPlayerActionLayout();
  }
  // The toolbar height depends on the text above; refit the game frame after it lays out.
  schedulePlayerFrameHeight();
}

/** With three visible actions, let the last one span the row instead of leaving a hole. */
function syncPlayerActionLayout() {
  if (!els.playerActions) return;
  const visible = Array.from(els.playerActions.children).filter(
    (btn) => !btn.classList.contains("hidden")
  ).length;
  els.playerActions.classList.toggle("is-odd", visible % 2 === 1);
}

if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if ((state.settings?.theme || "auto") === "auto") {
      applyThemeAndColors();
    }
  });
}

function showToast(msg, duration = 3200) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.add("hidden"), duration);
}

// Deep links use /g/:id so the app shell can open a game directly and the
// address bar carries a shareable link. /play/:id stays the raw game runner.
function gameIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/g\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function gamePath(game) {
  return `/g/${encodeURIComponent(game.id)}`;
}

function syncUrlForView(viewId) {
  const currentPath = window.location.pathname;

  if (viewId === "view-play" && state.currentGame) {
    const target = gamePath(state.currentGame);
    if (currentPath !== target) {
      window.history.pushState({ view: viewId, gameId: state.currentGame.id }, "", target);
    }
    return;
  }

  if (viewId === "view-admin") {
    if (currentPath !== "/admin") window.history.replaceState({}, "", "/admin");
    return;
  }

  // Leaving the game drops its deep link so the previous entry is not a stale game.
  if (currentPath !== "/") window.history.replaceState({}, "", "/");
}

function switchView(viewId, updateUrl = true) {
  els.views.forEach((v) => v.classList.toggle("active", v.id === viewId));
  els.navTabs.forEach((t) => t.classList.toggle("active", t.dataset.target === viewId));
  // Short screens let the header step aside while the game owns the viewport.
  document.body.classList.toggle("is-playing", viewId === "view-play");

  if (updateUrl) syncUrlForView(viewId);

  if (viewId === "view-play" && state.currentGame) {
    mountGameIframe(state.currentGame, false);
  }
  schedulePlayerFrameHeight();
}

// A brand-new frame loads its `src` without adding a session-history entry;
// changing the `src` of an existing frame adds one. Rebuilding the frame keeps
// the browser Back button returning to the library instead of stepping through
// every game load and restart.
function buildGameIframe(game) {
  const iframe = document.createElement("iframe");
  iframe.id = "gameIframe";
  iframe.title = "Playable HTML5 Game Sandbox";
  // Same containment as the markup: opaque origin, no allow-same-origin, so a
  // game can never read the AI credentials this browser stores.
  iframe.setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-modals");
  iframe.setAttribute("allow", "fullscreen; autoplay");
  iframe.setAttribute("data-game-id", game.id);
  iframe.addEventListener("load", onGameFrameLoad);
  // Set the source before inserting: the initial load of a new frame is not a
  // history navigation.
  iframe.src = `/play/${game.id}?t=${Date.now()}`;
  return iframe;
}

function mountGameIframe(game, forceReload = false) {
  if (!game) return;
  const currentId = els.gameIframe?.getAttribute("data-game-id");
  if (!forceReload && currentId === game.id && els.gameIframe?.getAttribute("src")) {
    focusGameIframe();
    return;
  }
  requestAnimationFrame(() => {
    const next = buildGameIframe(game);
    els.gameIframe.replaceWith(next);
    els.gameIframe = next;
  });
}

function focusGameIframe() {
  try {
    els.gameIframe.focus();
    const doc = els.gameIframe.contentDocument || els.gameIframe.contentWindow?.document;
    const canvas = doc?.querySelector("canvas");
    if (canvas) {
      canvas.focus();
    } else {
      els.gameIframe.contentWindow?.focus();
    }
  } catch {}
}

function onGameFrameLoad() {
  focusGameIframe();
  // The frame gets its height while the document is still loading. Chrome can
  // keep a stale composited region for that box: the game paints fine but its
  // hit-test area is offset, so taps land nowhere. Re-assert the box and force
  // a reflow once the document is in, and once more after it settles.
  if (els.playView && els.playView.classList.contains("active")) {
    syncPlayerFrameHeight();
    void els.iframeContainer.offsetHeight;
    schedulePlayerFrameHeight();
  }
}

/**
 * Fit the game frame into the space left between its own top edge and the fixed
 * bottom nav. A fixed dvh offset goes stale as soon as the toolbar wraps, and the
 * nav then covers the canvas — taps land on the nav instead of the game.
 */
function syncPlayerFrameHeight() {
  const container = els.iframeContainer;
  if (!container || !els.playView || !els.playView.classList.contains("active")) return;
  if (document.fullscreenElement) return;

  const navHeight = els.bottomNav ? els.bottomNav.getBoundingClientRect().height : 0;
  // The play view is a fixed layer, so the rect is already viewport-relative:
  // the room left below it is exactly what the nav does not cover.
  const top = container.getBoundingClientRect().top;
  const room = window.innerHeight - top - navHeight - 12;
  // No floor: a taller minimum would push the frame back under the fixed nav,
  // which is exactly what swallows the game's taps.
  container.style.height = `${Math.max(0, Math.round(room))}px`;
}

/** Wait for the toolbar text to lay out before measuring it. */
function schedulePlayerFrameHeight() {
  requestAnimationFrame(() => requestAnimationFrame(syncPlayerFrameHeight));
}

window.addEventListener("resize", schedulePlayerFrameHeight);
window.addEventListener("orientationchange", schedulePlayerFrameHeight);
window.visualViewport?.addEventListener("resize", schedulePlayerFrameHeight);
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) {
    els.iframeContainer.style.height = "";
  } else {
    schedulePlayerFrameHeight();
  }
});

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Creator-Token": state.creatorToken || "",
    ...(state.adminKey ? { "X-Admin-Key": state.adminKey } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(path, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function renderProviderBadge() {
  if (!state.settings) return;
  const p = state.settings.provider || "ollama";
  const m = state.settings.model || "default";
  els.activeProviderBadge.textContent = `AI: ${p} (${m})`;
}

function renderLibrary() {
  const q = state.searchQuery.toLowerCase().trim();
  const filtered = state.games.filter(
    (g) => !q || g.title.toLowerCase().includes(q) || g.prompt.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    els.libraryGrid.innerHTML = `<div class="card"><p class="muted">${t("library.empty")}</p></div>`;
    return;
  }

  els.libraryGrid.innerHTML = "";
  filtered.forEach((game) => {
    const card = document.createElement("article");
    card.className = "game-card";

    const revCount = Array.isArray(game.revisions) ? game.revisions.length : 1;
    const badgeLabel = game.isOwner
      ? t("library.ownerYou")
      : state.isAdmin
      ? t("library.ownerAdmin")
      : t("library.ownerShared");

    card.innerHTML = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <h3></h3>
          <span class="muted-xs" style="padding:2px 8px;border-radius:999px;border:1px solid var(--md-sys-color-outline);white-space:nowrap;">${badgeLabel}</span>
        </div>
        <p class="game-prompt-preview"></p>
      </div>
      <div>
        <div class="game-meta" style="margin-bottom: 10px;">
          <span>${t("library.model")}: ${game.provider || "local"}</span>
          <span>v${revCount}</span>
        </div>
        <div class="card-actions">
          <button class="btn-play" type="button">${t("library.playBtn")}</button>
          <button class="btn-edit btn-clone" type="button">${t("library.cloneBtn")}</button>
          <button class="btn-export" type="button" title="${t("library.exportBtn")}">⬇</button>
          ${
            game.canEdit
              ? `<button class="btn-edit btn-modify" type="button">${t("library.editBtn")}</button>
                 <button class="btn-delete" type="button" title="${t("library.deleteTitle")}">🗑️</button>`
              : ""
          }
        </div>
      </div>
    `;
    card.querySelector("h3").textContent = game.title;
    card.querySelector(".game-prompt-preview").textContent = game.prompt;

    card.querySelector(".btn-play").addEventListener("click", () => openGameInNewTab(game));
    card.querySelector(".btn-clone").addEventListener("click", () => handleCloneGame(game));
    card.querySelector(".btn-export").addEventListener("click", () => handleExportGame(game));

    if (game.canEdit) {
      card.querySelector(".btn-modify").addEventListener("click", async () => {
        try {
          const { game: full } = await api(`/api/games/${game.id}`);
          openGameInEditor(full);
        } catch (err) {
          showToast(err.message);
        }
      });
      card.querySelector(".btn-delete").addEventListener("click", () => handleDeleteGame(game));
    }

    els.libraryGrid.appendChild(card);
  });
}

// Library Play opens the shareable deep link in its own tab, leaving the library
// where it was. The inline player stays reachable from the bottom Play tab.
function openGameInNewTab(game) {
  if (!game) return;
  window.open(gamePath(game), "_blank", "noopener");
}

function openGameInPlayer(game, updateUrl = true) {
  state.currentGame = game;
  updatePlayerToolbarState();
  switchView("view-play", updateUrl);
  mountGameIframe(game, true);
}

function setCreateMode() {
  els.editingGameId.value = "";
  els.promptFormTitle.textContent = t("prompt.createTitle");
  els.promptFormSub.textContent = t("prompt.createSub");
  els.promptLabelText.textContent = t("prompt.questionCreate");
  els.gameTitleInput.value = "";
  els.gamePromptInput.value = "";
  els.gamePromptInput.placeholder = t("prompt.questionPlaceholderCreate");
  els.submitPromptBtn.textContent = t("prompt.generateBtn");
  els.resetPromptModeBtn.classList.add("hidden");
  els.codeEditorDetails.classList.add("hidden");
  els.codeEditorDetails.open = false;
  els.promptHistoryBlock.classList.add("hidden");
  els.savedPromptView.value = "";
  els.revisionList.innerHTML = "";
}

function openGameInEditor(game) {
  if (!game.canEdit) {
    handleCloneGame(game);
    return;
  }
  state.currentGame = game;
  els.editingGameId.value = game.id;
  els.promptFormTitle.textContent = t("prompt.modifyTitle", { title: game.title });
  els.promptFormSub.textContent = t("prompt.modifySub");
  els.promptLabelText.textContent = t("prompt.questionModify");
  els.gameTitleInput.value = game.title;
  els.gamePromptInput.value = "";
  els.gamePromptInput.placeholder = t("prompt.questionPlaceholderModify");
  els.submitPromptBtn.textContent = t("prompt.modifyBtn");
  els.resetPromptModeBtn.classList.remove("hidden");

  els.codeEditorDetails.classList.remove("hidden");
  els.promptHistoryBlock.classList.remove("hidden");
  els.rawHtmlInput.value = game.html;
  els.savedPromptView.value = game.prompt || "";
  renderRevisions(game);
  switchView("view-create");
}

// --- Read-only prompt viewer -------------------------------------------------

async function copyPromptText(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(text);
  } catch {
    // The Clipboard API needs a secure context; on plain-HTTP LAN it fails silently.
    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(scratch);
    scratch.select();
    try {
      document.execCommand("copy");
    } catch {
      /* selection is left in place so the user can copy manually */
    }
    scratch.remove();
  }
  showToast(t("prompt.promptCopiedToast"));
}

function reusePromptAsBase(text) {
  els.gamePromptInput.value = text;
  switchView("view-create");
  els.gamePromptInput.focus();
  els.gamePromptInput.scrollIntoView({ block: "center", behavior: "smooth" });
  showToast(t("prompt.promptReusedToast"));
}

async function handleExportGame(game) {
  // The server sets Content-Disposition, so a plain navigation downloads the package.
  const link = document.createElement("a");
  link.href = `/api/games/${game.id}/export`;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast(t("library.exportedToast", { name: `${game.title}.ludogame.json` }));
}

async function handleImportFile(file) {
  try {
    const text = await file.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      showToast(t("library.importInvalid", { reason: "not valid JSON" }), 6000);
      return;
    }

    const { game } = await api("/api/games/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await refreshGames(game.id);
    renderLibrary();
    showToast(t("library.importedToast", { title: game.title }));
  } catch (err) {
    showToast(t("library.importInvalid", { reason: err.message }), 7000);
  }
}

async function handleCloneGame(game) {
  try {
    const { game: cloned } = await api(`/api/games/${game.id}/clone`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await refreshGames(cloned.id);
    openGameInEditor(cloned);
    showToast(t("library.clonedToast", { title: cloned.title }));
  } catch (err) {
    showToast(err.message);
  }
}

function renderRevisions(game) {
  els.revisionList.innerHTML = "";
  if (!Array.isArray(game.revisions) || game.revisions.length === 0) return;

  const heading = document.createElement("div");
  heading.className = "muted-xs";
  heading.textContent = t("prompt.revisionHeading");
  els.revisionList.appendChild(heading);

  game.revisions.forEach((rev, index) => {
    const details = document.createElement("details");
    details.className = "revision-item";

    const summary = document.createElement("summary");
    const when = new Date(rev.created_at);
    const stamp = Number.isNaN(when.getTime()) ? "" : `${when.toLocaleString()} · `;
    summary.textContent = `v${game.revisions.length - index} · ${stamp}${rev.prompt.slice(0, 60)}`;

    const viewer = document.createElement("textarea");
    viewer.className = "prompt-view";
    viewer.rows = 3;
    viewer.readOnly = true;
    viewer.spellcheck = false;
    viewer.value = rev.prompt;

    const actions = document.createElement("div");
    actions.className = "setup-btn-row";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "ghost-btn";
    copyBtn.textContent = t("prompt.copyPromptBtn");
    copyBtn.addEventListener("click", () => copyPromptText(rev.prompt));

    const reuseBtn = document.createElement("button");
    reuseBtn.type = "button";
    reuseBtn.className = "ghost-btn";
    reuseBtn.textContent = t("prompt.reusePromptBtn");
    reuseBtn.addEventListener("click", () => reusePromptAsBase(rev.prompt));

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "ghost-btn";
    restoreBtn.textContent = t("prompt.restoreBtn");
    restoreBtn.addEventListener("click", async () => {
      try {
        const { game: restored } = await api(`/api/games/${game.id}/restore`, {
          method: "POST",
          body: JSON.stringify({ revisionId: rev.id }),
        });
        await refreshGames(restored.id);
        openGameInEditor(restored);
        showToast(t("prompt.restoredToast"));
      } catch (err) {
        showToast(err.message);
      }
    });

    actions.append(copyBtn, reuseBtn, restoreBtn);
    details.append(summary, viewer, actions);
    els.revisionList.appendChild(details);
  });
}

async function handleDeleteGame(game) {
  if (!window.confirm(t("library.deleteConfirm", { title: game.title }))) return;
  try {
    await api(`/api/games/${game.id}`, { method: "DELETE" });
    state.games = state.games.filter((g) => g.id !== game.id);
    if (state.currentGame?.id === game.id) {
      state.currentGame = state.games[0] || null;
      if (state.currentGame) {
        els.playingTitle.textContent = state.currentGame.title;
        els.gameIframe.removeAttribute("data-game-id");
        els.gameIframe.removeAttribute("src");
      } else {
        els.playingTitle.textContent = t("play.selectGame");
        els.gameIframe.removeAttribute("data-game-id");
        els.gameIframe.removeAttribute("src");
      }
    }
    renderLibrary();
    updatePlayerToolbarState();
    showToast(t("library.deletedToast", { title: game.title }));
  } catch (err) {
    showToast(err.message);
  }
}

async function refreshGames(selectId = null) {
  const { games, isAdmin } = await api("/api/games");
  state.games = games;
  state.isAdmin = Boolean(isAdmin);
  if (selectId) {
    const found = games.find((g) => g.id === selectId);
    if (found) state.currentGame = found;
  } else if (state.currentGame) {
    const updatedCurrent = games.find((g) => g.id === state.currentGame.id);
    state.currentGame = updatedCurrent || games[0] || null;
  } else if (games.length > 0) {
    state.currentGame = games[0];
  }
  renderAdminBadge();
  renderLibrary();
  updatePlayerToolbarState();
}

function updateLocalSettings(partial, showConfirmToast = false) {
  state.settings = { ...state.settings, ...partial };
  saveLocalBrowserSettings();
  applyThemeAndColors();
  applyTranslations();
  if (showConfirmToast) {
    showToast(t("setup.savedToast"));
  }
}

// ---------------------------------------------------------------------------
// AI Setup — provider model catalogue
// ---------------------------------------------------------------------------

const CUSTOM_MODEL = "__custom__";

/** Reflects the current <select> choice into the model state and toggles manual entry. */
function syncModelFields() {
  const isCustom = els.modelSelect.value === CUSTOM_MODEL;
  els.modelInput.classList.toggle("hidden", !isCustom);

  if (isCustom) {
    els.modelInput.value = state.settings.model || "";
    if (document.activeElement !== els.modelInput) els.modelInput.focus();
  } else if (els.modelSelect.value) {
    state.settings.model = els.modelSelect.value;
  }
}

/**
 * Rebuilds the model dropdown.
 *
 * With `authoritative` (a real catalogue came back) only provider-advertised models are shown — never a
 * fabricated entry, because an uninstalled model looks selectable but fails at generation time.
 * Without it (offline/degraded) the saved value is kept so the user does not lose their choice.
 *
 * Returns the saved model id when it was missing from the real catalogue.
 */
function renderModelOptions(models, currentModel, { authoritative = false } = {}) {
  const available = [...models].filter(Boolean);
  let selected = currentModel;
  let missing = null;

  if (authoritative) {
    if (selected && !available.includes(selected)) {
      missing = selected;
      selected = available[0] || "";
    }
  } else if (selected && !available.includes(selected)) {
    available.unshift(selected);
  }

  els.modelSelect.innerHTML = "";

  for (const id of available) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id;
    els.modelSelect.appendChild(option);
  }

  const customOption = document.createElement("option");
  customOption.value = CUSTOM_MODEL;
  customOption.textContent = t("setup.customModelOption");
  els.modelSelect.appendChild(customOption);

  els.modelSelect.value = selected && available.includes(selected) ? selected : available[0] || CUSTOM_MODEL;
  els.modelInput.value = selected || available[0] || "";
  syncModelFields();

  return missing;
}

/** Reads the model currently chosen, whether from the dropdown or the manual field. */
function getSelectedModel() {
  if (els.modelSelect.value === CUSTOM_MODEL) {
    return els.modelInput.value.trim();
  }
  return els.modelSelect.value.trim() || els.modelInput.value.trim() || state.settings.model || "";
}

// Hint under the model picker. Kept as a key + params so a language switch can re-render it.
let modelHintState = { key: "setup.modelHintAuto", vars: {}, suffix: "" };

function setModelHint(key, vars = {}, suffix = "") {
  modelHintState = { key, vars, suffix };
  els.modelHint.textContent = t(key, vars) + (suffix ? ` (${suffix})` : "");
}

function renderModelHint() {
  els.modelHint.textContent =
    t(modelHintState.key, modelHintState.vars) + (modelHintState.suffix ? ` (${modelHintState.suffix})` : "");
}

/** Asks the backend to list the provider's models using this browser's ephemeral credentials. */
async function loadModelsForProvider({ announce = false } = {}) {
  els.loadModelsBtn.disabled = true;
  setModelHint("setup.modelsLoading");

  try {
    const result = await api("/api/models", {
      method: "POST",
      body: JSON.stringify({
        provider: els.providerSelect.value,
        baseUrl: els.baseUrlInput.value.trim(),
        apiKey: els.apiKeyInput.value.trim(),
      }),
    });

    const models = result.ok && Array.isArray(result.models) ? result.models : [];

    if (models.length > 0) {
      const missing = renderModelOptions(models, state.settings.model, { authoritative: true });
      if (missing) {
        setModelHint("setup.modelNotInstalled", { missing, fallback: state.settings.model });
      } else {
        setModelHint("setup.modelHintAuto");
      }
      if (announce) showToast(t("setup.modelsLoadedToast", { count: models.length }));
    } else {
      renderModelOptions([], state.settings.model, { authoritative: false });
      // Keep the technical reason visible (401 vs connection refused) alongside the localized message.
      setModelHint("setup.modelsFailed", {}, result.message || "");
      if (announce) showToast(result.message || t("setup.modelsFailed"));
    }
  } catch (err) {
    renderModelOptions([], state.settings.model, { authoritative: false });
    setModelHint("setup.modelsFailed");
    if (announce) showToast(err.message);
  } finally {
    els.loadModelsBtn.disabled = false;
  }
}

async function initApp() {
  try {
    const { presets } = await api("/api/presets");
    state.presets = presets || {};
  } catch {}

  els.langSelect.value = state.settings.language || "auto";
  els.themeSelect.value = state.settings.theme || "auto";
  els.providerSelect.value = state.settings.provider || "ollama";
  els.baseUrlInput.value = state.settings.baseUrl || "";
  els.modelInput.value = state.settings.model || "";
  renderModelOptions([], state.settings.model, { authoritative: false });
  els.apiKeyInput.value = state.settings.apiKey || "";
  els.fallbackToggle.checked = state.settings.fallbackToTemplate !== false;
  els.creatorTokenInput.value = state.creatorToken;
  if (els.adminPortalKeyInput) {
    els.adminPortalKeyInput.value = state.adminKey;
  }

  applyThemeAndColors();
  applyTranslations();
  await refreshGames();

  // Refresh the provider catalogue in the background; a dead endpoint must never block startup.
  loadModelsForProvider();

  // Deep link: /g/:id opens that game in the player, with the URL already shareable.
  const deepLinkId = gameIdFromPath();
  if (deepLinkId) {
    const game = state.games.find((g) => g.id === deepLinkId);
    if (game) {
      openGameInPlayer(game, false);
    } else {
      showToast(t("play.notFoundToast"), 5000);
      window.history.replaceState({}, "", "/");
    }
  } else if (window.location.pathname === "/admin") {
    // If the user navigated directly to /admin, open the dedicated Admin Portal view
    switchView("view-admin", false);
  }
}

window.addEventListener("popstate", () => {
  const deepLinkId = gameIdFromPath();
  if (deepLinkId) {
    const game = state.games.find((g) => g.id === deepLinkId);
    if (game) {
      openGameInPlayer(game, false);
      return;
    }
    showToast(t("play.notFoundToast"), 5000);
    window.history.replaceState({}, "", "/");
  }
  if (window.location.pathname === "/admin") {
    switchView("view-admin", false);
    return;
  }
  switchView("view-library", false);
});

// Event Listeners
els.navTabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.target));
});

els.quickCreateBtn.addEventListener("click", () => {
  setCreateMode();
  switchView("view-create");
});

els.importBtn.addEventListener("click", () => els.importFileInput.click());

els.importFileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) await handleImportFile(file);
});

els.resetPromptModeBtn.addEventListener("click", () => setCreateMode());

els.searchInput.addEventListener("input", (e) => {
  state.searchQuery = e.target.value;
  renderLibrary();
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    els.gamePromptInput.value = chip.dataset.prompt;
  });
});

// Normal Setup controls: saved strictly in browser localStorage
els.langSelect.addEventListener("change", () => {
  updateLocalSettings({ language: els.langSelect.value }, true);
});

els.themeSelect.addEventListener("change", () => {
  updateLocalSettings({ theme: els.themeSelect.value }, true);
});

els.colorSwatches.forEach((swatch) => {
  swatch.addEventListener("click", () => {
    updateLocalSettings({ accentColor: swatch.dataset.color }, true);
  });
});

els.accentColorPicker.addEventListener("input", (e) => {
  state.settings.accentColor = e.target.value;
  applyThemeAndColors();
});

els.accentColorPicker.addEventListener("change", (e) => {
  updateLocalSettings({ accentColor: e.target.value }, true);
});

els.creatorTokenInput.addEventListener("change", async () => {
  const nextToken = els.creatorTokenInput.value.trim() || generateRandomCreatorToken();
  state.creatorToken = nextToken;
  els.creatorTokenInput.value = nextToken;
  saveLocalBrowserSettings();
  await refreshGames();
  showToast(t("setup.savedToast"));
});

els.copyCreatorTokenBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.creatorToken);
    showToast(t("setup.copiedToast"));
  } catch {
    els.creatorTokenInput.select();
    showToast(t("setup.copiedToast"));
  }
});

els.adminPortalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  state.adminKey = els.adminPortalKeyInput.value.trim();
  saveLocalBrowserSettings();
  try {
    const { isAdmin } = await api("/api/auth/verify-admin", { method: "POST" });
    state.isAdmin = Boolean(isAdmin);
    await refreshGames();
    if (state.isAdmin) {
      showToast(t("setup.adminActive"));
      switchView("view-library");
    } else {
      showToast(t("setup.adminInvalidToast"));
    }
  } catch (err) {
    showToast(err.message);
  }
});

els.logoutAdminBtn.addEventListener("click", async () => {
  state.adminKey = "";
  state.isAdmin = false;
  if (els.adminPortalKeyInput) els.adminPortalKeyInput.value = "";
  saveLocalBrowserSettings();
  await refreshGames();
  showToast(t("admin.loggedOutToast"));
  switchView("view-library");
});

els.promptForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const editingId = els.editingGameId.value;
  const prompt = els.gamePromptInput.value.trim();
  const title = els.gameTitleInput.value.trim();
  if (!prompt) return;

  els.submitPromptBtn.disabled = true;
  const prevText = els.submitPromptBtn.textContent;
  els.submitPromptBtn.textContent = t("prompt.generatingBtn");

  try {
    const endpoint = editingId ? `/api/games/${editingId}/modify` : "/api/games/generate";
    // Send this user's personal AI settings ephemerally in the request body
    const { game, fallbackNote } = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({
        prompt,
        title,
        settings: {
          provider: state.settings.provider,
          baseUrl: state.settings.baseUrl,
          model: state.settings.model,
          apiKey: state.settings.apiKey,
          fallbackToTemplate: state.settings.fallbackToTemplate,
        },
      }),
    });
    await refreshGames(game.id);
    openGameInPlayer(game);
    showToast(fallbackNote || t("play.readyToast", { title: game.title }));
  } catch (err) {
    // Full detail goes to the browser console so it can be copied without truncation.
    console.error("[ludo] AI request failed:", err.message);
    showToast(`Error: ${err.message}`, 9000);
  } finally {
    els.submitPromptBtn.disabled = false;
    els.submitPromptBtn.textContent = prevText;
  }
});

els.copySavedPromptBtn.addEventListener("click", () => {
  copyPromptText(els.savedPromptView.value);
});

els.reuseSavedPromptBtn.addEventListener("click", () => {
  reusePromptAsBase(els.savedPromptView.value);
});

els.saveRawHtmlBtn.addEventListener("click", async () => {
  const editingId = els.editingGameId.value;
  if (!editingId) return;
  try {
    const { game } = await api(`/api/games/${editingId}`, {
      method: "PUT",
      body: JSON.stringify({
        title: els.gameTitleInput.value.trim() || state.currentGame?.title,
        prompt: "Manual HTML source edit",
        html: els.rawHtmlInput.value,
      }),
    });
    await refreshGames(game.id);
    openGameInPlayer(game);
    showToast(t("prompt.savedCodeToast"));
  } catch (err) {
    showToast(err.message);
  }
});

els.reloadGameBtn.addEventListener("click", () => {
  if (state.currentGame) {
    mountGameIframe(state.currentGame, true);
    showToast(t("play.restartedToast"));
  }
});

els.cloneCurrentBtn.addEventListener("click", () => {
  if (state.currentGame) {
    handleCloneGame(state.currentGame);
  }
});

els.modifyCurrentBtn.addEventListener("click", () => {
  if (state.currentGame) {
    openGameInEditor(state.currentGame);
  }
});

els.fullscreenGameBtn.addEventListener("click", () => {
  if (els.iframeContainer.requestFullscreen) {
    els.iframeContainer.requestFullscreen();
  }
});

els.providerSelect.addEventListener("change", () => {
  const preset = state.presets[els.providerSelect.value];
  if (preset) {
    els.baseUrlInput.value = preset.baseUrl || "";
    state.settings.model = preset.defaultModel || "";
  }
  loadModelsForProvider();
});

els.loadModelsBtn.addEventListener("click", () => {
  loadModelsForProvider({ announce: true });
});

els.modelSelect.addEventListener("change", () => {
  syncModelFields();
  saveLocalBrowserSettings();
});

els.settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  updateLocalSettings(
    {
      provider: els.providerSelect.value,
      baseUrl: els.baseUrlInput.value.trim(),
      model: getSelectedModel(),
      apiKey: els.apiKeyInput.value.trim(),
      fallbackToTemplate: els.fallbackToggle.checked,
      language: els.langSelect.value,
      theme: els.themeSelect.value,
      accentColor: els.accentColorPicker.value,
    },
    true
  );
});

els.testProviderBtn.addEventListener("click", async () => {
  try {
    const res = await api("/api/settings/test", {
      method: "POST",
      body: JSON.stringify({
        provider: els.providerSelect.value,
        baseUrl: els.baseUrlInput.value.trim(),
        model: getSelectedModel(),
        apiKey: els.apiKeyInput.value.trim(),
        fallbackToTemplate: els.fallbackToggle.checked,
      }),
    });
    showToast(res.message);
  } catch (err) {
    showToast(err.message);
  }
});

initApp();
