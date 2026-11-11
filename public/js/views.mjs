import { state } from "./state.mjs";
import { t, getEffectiveLang, applyThemeAndColors } from "./theme.mjs";
import { saveLocalBrowserSettings, generateRandomCreatorToken } from "./storage.mjs";
import { api } from "./api.mjs";
import { showToast, gameIdFromPath, gamePath, switchView } from "./navigation.mjs";
import { mountGameIframe, schedulePlayerFrameHeight, requestFrameCapture } from "./player.mjs";
import { CUSTOM_MODEL, renderProviderBadge, syncModelFields, renderModelOptions, getSelectedModel, setModelHint, renderModelHint } from "./settings.mjs";

let els = null;

export function initViews(elsRef) {
  els = elsRef;
}

export function renderAdminBadge() {
  if (!els?.adminStatusBadge) return;
  els.adminStatusBadge.textContent = state.isAdmin
    ? t("setup.adminActive")
    : t("setup.adminInactive");
  els.adminStatusBadge.style.color = state.isAdmin
    ? "var(--md-sys-color-primary)"
    : "var(--md-sys-color-on-surface-variant)";

  els.importBtn.classList.toggle("hidden", !state.isAdmin);
}

export function applyTranslations() {
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

  const customOption = els.modelSelect?.querySelector(`option[value="${CUSTOM_MODEL}"]`);
  if (customOption) customOption.textContent = t("setup.customModelOption");
  renderModelHint();
}

export function updatePlayerToolbarState() {
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
    els.setPreviewBtn.classList.toggle("hidden", !state.currentGame.canEdit);
    syncPlayerActionLayout();
    renderRevisions(state.currentGame);
  } else {
    els.playingTitle.textContent = t("play.selectGame");
    els.playingDescription.textContent = "";
    els.modifyCurrentBtn.classList.add("hidden");
    els.setPreviewBtn.classList.add("hidden");
    syncPlayerActionLayout();
  }
  schedulePlayerFrameHeight();
}

export function syncPlayerActionLayout() {
  if (!els.playerActions) return;
  const visible = Array.from(els.playerActions.children).filter(
    (btn) => !btn.classList.contains("hidden")
  ).length;
  els.playerActions.classList.toggle("is-odd", visible % 2 === 1);
}

export function renderLibrary() {
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
      <div class="game-card-media"></div>
      <div class="game-card-body">
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
      </div>
    `;
    card.querySelector("h3").textContent = game.title;
    card.querySelector(".game-prompt-preview").textContent = game.prompt;
    renderCardPreview(card, game);

    card.querySelector(".btn-play").addEventListener("click", () => openGameInNewTab(game));
    card.querySelector(".btn-clone").addEventListener("click", () => handleCloneGame(game));
    card.querySelector(".btn-export").addEventListener("click", () => handleExportGame(game));

    if (game.canEdit) {
      card.querySelector(".btn-modify").addEventListener("click", async () => {
        try {
          const { game: full } = await api(state, `/api/games/${game.id}`);
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

function renderCardPreview(card, game) {
  const media = card.querySelector(".game-card-media");
  if (!media) return;
  media.dataset.initial = (game.title.trim()[0] || "★").toUpperCase();

  // The thumbnail opens the in-app player, which is where the owner pins the
  // frame that represents the game. "Play" keeps its own-tab behaviour.
  const openInApp = () => openGameInPlayer(game);
  media.setAttribute("role", "button");
  media.tabIndex = 0;
  media.title = t("library.previewOpen");
  media.addEventListener("click", openInApp);
  media.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openInApp();
    }
  });

  if (game.previewUrl) {
    const img = document.createElement("img");
    img.className = "game-preview";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = t("library.previewAlt", { title: game.title });
    img.src = game.previewUrl;
    img.addEventListener("error", () => {
      img.remove();
      media.classList.add("is-empty");
    });
    media.appendChild(img);
  } else {
    media.classList.add("is-empty");
  }

  if (game.previewStale && game.canEdit) {
    const stale = document.createElement("span");
    stale.className = "game-preview-stale";
    stale.textContent = t("library.previewStale");
    media.appendChild(stale);
  }
}

// Capture the frame the author is looking at, not a guessed moment.
export async function handleSetPreview() {
  const game = state.currentGame;
  if (!game) return;
  const shot = await requestFrameCapture(els.gameIframe);
  if (!shot) {
    showToast(t("library.previewCaptureFailed"), 6000);
    els.previewFileInput.click();
    return;
  }
  await saveGamePreview(game, shot);
}

export async function handlePreviewFile(file) {
  const game = state.currentGame;
  if (!file || !game) return;
  try {
    await saveGamePreview(game, await downscaleImage(file, 720, 1280));
  } catch {
    showToast(t("library.previewInvalidToast"), 6000);
  }
}

async function saveGamePreview(game, dataUrl) {
  try {
    await api(state, `/api/games/${game.id}/preview`, {
      method: "POST",
      body: JSON.stringify({ image: dataUrl }),
    });
    await refreshGames(game.id);
    showToast(t("library.previewSavedToast"), 4000);
  } catch (err) {
    showToast(err.message, 6000);
  }
}

// Keeps uploads bounded without an image library on the server.
function downscaleImage(file, maxWidth, maxHeight) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/webp", 0.72));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

export function openGameInNewTab(game) {
  if (!game) return;
  window.open(gamePath(game), "_blank", "noopener");
}

export function openGameInPlayer(game, updateUrl = true) {
  state.currentGame = game;
  updatePlayerToolbarState();
  switchView("view-play", updateUrl);
  mountGameIframe(game, true);
}

export function setCreateMode() {
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

export function openGameInEditor(game) {
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

export async function copyPromptText(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(text);
  } catch {
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

export function reusePromptAsBase(text) {
  els.gamePromptInput.value = text;
  switchView("view-create");
  els.gamePromptInput.focus();
  els.gamePromptInput.scrollIntoView({ block: "center", behavior: "smooth" });
  showToast(t("prompt.promptReusedToast"));
}

export async function handleExportGame(game) {
  const link = document.createElement("a");
  link.href = `/api/games/${game.id}/export`;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast(t("library.exportedToast", { name: `${game.title}.ludogame.json` }));
}

export async function handleImportFile(file) {
  try {
    const text = await file.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      showToast(t("library.importInvalid", { reason: "not valid JSON" }), 6000);
      return;
    }

    const { game } = await api(state, "/api/games/import", {
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

export async function handleCloneGame(game) {
  try {
    const { game: cloned } = await api(state, `/api/games/${game.id}/clone`, {
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

export function renderRevisions(game) {
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
        const { game: restored } = await api(state, `/api/games/${game.id}/restore`, {
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

export async function handleDeleteGame(game) {
  if (!window.confirm(t("library.deleteConfirm", { title: game.title }))) return;
  try {
    await api(state, `/api/games/${game.id}`, { method: "DELETE" });
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

export async function refreshGames(selectId = null) {
  const { games, isAdmin } = await api(state, "/api/games");
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

export function updateLocalSettings(partial, showConfirmToast = false) {
  state.settings = { ...state.settings, ...partial };
  saveLocalBrowserSettings(state);
  applyThemeAndColors(els);
  applyTranslations();
  if (showConfirmToast) {
    showToast(t("setup.savedToast"));
  }
}

export async function loadModelsForProvider({ announce = false } = {}) {
  els.loadModelsBtn.disabled = true;
  setModelHint("setup.modelsLoading");

  try {
    const result = await api(state, "/api/models", {
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

// initApp logic moved to a function
export async function initApp() {
  try {
    const { presets } = await api(state, "/api/presets");
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

  applyThemeAndColors(els);
  applyTranslations();
  await refreshGames();

  loadModelsForProvider();

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
    switchView("view-admin", false);
  }
}

export function initViewsAll(elsRef) {
  initViews(elsRef);
  wireEvents();
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if ((state.settings?.theme || "auto") === "auto") {
        applyThemeAndColors(els);
      }
    });
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
}
export function wireEvents() {
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

  els.setPreviewBtn.addEventListener("click", () => handleSetPreview());

  els.previewFileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await handlePreviewFile(file);
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
    applyThemeAndColors(els);
  });

  els.accentColorPicker.addEventListener("change", (e) => {
    updateLocalSettings({ accentColor: e.target.value }, true);
  });

  els.creatorTokenInput.addEventListener("change", async () => {
    const nextToken = els.creatorTokenInput.value.trim() || generateRandomCreatorToken();
    state.creatorToken = nextToken;
    els.creatorTokenInput.value = nextToken;
    saveLocalBrowserSettings(state);
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
    saveLocalBrowserSettings(state);
    try {
      const { isAdmin } = await api(state, "/api/auth/verify-admin", { method: "POST" });
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
    saveLocalBrowserSettings(state);
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
      const { game, fallbackNote } = await api(state, endpoint, {
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
      const { game } = await api(state, `/api/games/${editingId}`, {
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
    saveLocalBrowserSettings(state);
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
      const res = await api(state, "/api/settings/test", {
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
}
