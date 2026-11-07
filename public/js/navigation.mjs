import { state } from "./state.mjs";
import { t } from "./theme.mjs";
import { mountGameIframe, schedulePlayerFrameHeight } from "./player.mjs";

let els = null;

export function initNavigation(elsRef) {
  els = elsRef;
}

export function showToast(msg, duration = 3200) {
  if (!els) return;
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.add("hidden"), duration);
}

export function gameIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/g\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function gamePath(game) {
  return `/g/${encodeURIComponent(game.id)}`;
}

export function syncUrlForView(viewId) {
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

  if (currentPath !== "/") window.history.replaceState({}, "", "/");
}

export function switchView(viewId, updateUrl = true) {
  if (!els) return;
  els.views.forEach((v) => v.classList.toggle("active", v.id === viewId));
  els.navTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.target === viewId));
  document.body.classList.toggle("is-playing", viewId === "view-play");

  if (updateUrl) syncUrlForView(viewId);

  if (viewId === "view-play" && state.currentGame) {
    mountGameIframe(state.currentGame, false);
  }
  schedulePlayerFrameHeight();
}