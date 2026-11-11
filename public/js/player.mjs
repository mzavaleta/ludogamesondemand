import { state } from "./state.mjs";

let els = null;

export function initPlayer(elsRef) {
  els = elsRef;
}

export function buildGameIframe(game) {
  const iframe = document.createElement("iframe");
  iframe.id = "gameIframe";
  iframe.title = "Playable HTML5 Game Sandbox";
  iframe.setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-modals");
  iframe.setAttribute("allow", "fullscreen; autoplay");
  iframe.setAttribute("data-game-id", game.id);
  iframe.addEventListener("load", onGameFrameLoad);
  iframe.src = `/play/${game.id}?t=${Date.now()}`;
  return iframe;
}

export function mountGameIframe(game, forceReload = false) {
  if (!game || !els) return;
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

export function focusGameIframe() {
  if (!els) return;
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

// Asks the running game for one frame over postMessage. The game document is
// sandboxed without allow-same-origin, so this is the only channel available —
// and the only one we want, since it keeps untrusted HTML away from the app DOM.
export function requestFrameCapture(iframe, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const target = iframe?.contentWindow;
    if (!target) return resolve(null);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(value);
    };
    const onMessage = (event) => {
      if (event.source !== target) return;
      const data = event.data;
      if (!data || data.type !== "ludo:capture-result") return;
      finish(typeof data.data === "string" && data.data.startsWith("data:image/") ? data.data : null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    window.addEventListener("message", onMessage);
    try {
      target.postMessage({ type: "ludo:capture-request" }, "*");
    } catch {
      finish(null);
    }
  });
}
export function onGameFrameLoad() {
  focusGameIframe();
  if (els.playView && els.playView.classList.contains("active")) {
    syncPlayerFrameHeight();
    void els.iframeContainer.offsetHeight;
    schedulePlayerFrameHeight();
  }
}

export function syncPlayerFrameHeight() {
  if (!els) return;
  const container = els.iframeContainer;
  if (!container || !els.playView || !els.playView.classList.contains("active")) return;
  if (document.fullscreenElement) return;

  const navHeight = els.bottomNav ? els.bottomNav.getBoundingClientRect().height : 0;
  const top = container.getBoundingClientRect().top;
  const room = window.innerHeight - top - navHeight - 12;
  container.style.height = `${Math.max(0, Math.round(room))}px`;
}

export function schedulePlayerFrameHeight() {
  requestAnimationFrame(() => requestAnimationFrame(syncPlayerFrameHeight));
}

// Wire global listeners once.
if (typeof window !== "undefined") {
  window.addEventListener("resize", schedulePlayerFrameHeight);
  window.addEventListener("orientationchange", schedulePlayerFrameHeight);
  window.visualViewport?.addEventListener("resize", schedulePlayerFrameHeight);
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      if (els?.iframeContainer) els.iframeContainer.style.height = "";
    } else {
      schedulePlayerFrameHeight();
    }
  });
}