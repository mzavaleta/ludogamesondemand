import { initPlayer } from "./js/player.mjs";
import { initNavigation } from "./js/navigation.mjs";
import { initSettings } from "./js/settings.mjs";
import { initViews, initViewsAll, initApp } from "./js/views.mjs";

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

initPlayer(els);
initNavigation(els);
initSettings(els);
initViews(els);
initViewsAll(els);

initApp();