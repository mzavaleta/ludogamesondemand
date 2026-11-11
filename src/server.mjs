import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { createGameStore, hashCreatorToken } from "./store.mjs";
import { createPreviewStore } from "./previews.mjs";
import {
  PROVIDER_PRESETS,
  buildDynamicTemplateGame,
  generateOrModifyGame,
  redactSecrets,
} from "./prompt-engine.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/** @param {any} res @param {number} status @param {any} payload @returns {void} */
function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

const MAX_BODY_BYTES = 6 * 1024 * 1024;

/** @param {any} req @returns {Promise<any>} */
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const err = new Error("Request body too large.");
      /** @type {any} */ (err).status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

/** @param {any} provided @param {any} expected @returns {boolean} */
function safeCompareSecret(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const MODEL_LIST_TIMEOUT_MS = 6000;
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const ENVELOPE_FORMAT = "ludogame";
const ENVELOPE_VERSION = 1;

// Injected into every served game so the parent app can ask it for one frame
// over postMessage. It runs inside the sandboxed document (opaque origin), so it
// can read its own canvas/SVG while the app still cannot touch the game DOM.
const CAPTURE_HELPER = `<script data-ludo-capture="1">
(function () {
  if (window.__ludoCaptureInstalled) return;
  window.__ludoCaptureInstalled = true;

  function cssText() {
    var out = [];
    try {
      for (var i = 0; i < document.styleSheets.length; i++) {
        var rules = null;
        try { rules = document.styleSheets[i].cssRules; } catch (e) { rules = null; }
        if (!rules) continue;
        for (var j = 0; j < rules.length; j++) out.push(rules[j].cssText);
      }
    } catch (e) {}
    return out.join("\\n");
  }

  function biggest(tag) {
    var best = null, area = 0;
    var nodes = document.getElementsByTagName(tag);
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      var a = r.width * r.height;
      if (a > area) { area = a; best = nodes[i]; }
    }
    return best;
  }

  function isFlat(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement("canvas");
          c.width = 24;
          c.height = 24;
          var ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, 24, 24);
          var px = ctx.getImageData(0, 0, 24, 24).data;
          var r0 = px[0], g0 = px[1], b0 = px[2], a0 = px[3];
          for (var i = 4; i < px.length; i += 4) {
            if (Math.abs(px[i] - r0) > 6 || Math.abs(px[i + 1] - g0) > 6 ||
                Math.abs(px[i + 2] - b0) > 6 || Math.abs(px[i + 3] - a0) > 6) {
              return resolve(false);
            }
          }
          resolve(true);
        } catch (e) { resolve(true); }
      };
      img.onerror = function () { resolve(true); };
      img.src = dataUrl;
    });
  }

  function svgToDataUrl(svg) {
    return new Promise(function (resolve) {
      try {
        var rect = svg.getBoundingClientRect();
        var w = Math.max(1, Math.round(rect.width || svg.clientWidth || 360));
        var h = Math.max(1, Math.round(rect.height || svg.clientHeight || 640));
        var clone = svg.cloneNode(true);
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", String(w));
        clone.setAttribute("height", String(h));
        var style = document.createElementNS("http://www.w3.org/2000/svg", "style");
        style.textContent = cssText();
        clone.insertBefore(style, clone.firstChild);
        var xml = new XMLSerializer().serializeToString(clone);
        var img = new Image();
        img.onload = function () {
          try {
            var c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            c.getContext("2d").drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL("image/webp", 0.72));
          } catch (e) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      } catch (e) { resolve(null); }
    });
  }

  function grab() {
    var canvas = biggest("canvas");
    if (canvas) {
      try {
        var shot = canvas.toDataURL("image/webp", 0.72);
        if (shot) return isFlat(shot).then(function (flat) { return flat ? null : shot; });
      } catch (e) {}
    }
    var svg = biggest("svg");
    if (svg) return svgToDataUrl(svg);
    return Promise.resolve(null);
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "ludo:capture-request") return;
    grab().then(function (shot) {
      try {
        event.source.postMessage({ type: "ludo:capture-result", data: shot || null }, "*");
      } catch (e) {}
    });
  });
})();
</script>`;

/** @param {string} html @returns {string} */
function withCaptureHelper(html) {
  if (!html || html.includes('data-ludo-capture="1"')) return html;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return `${html}${CAPTURE_HELPER}`;
  return `${html.slice(0, idx)}${CAPTURE_HELPER}${html.slice(idx)}`;
}

/** @param {any} title @returns {string} */
function slugify(title) {
  return (
    String(title || "game")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "game"
  );
}

/** @param {any} text @returns {string} */
function sha256Hex(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

/** @param {any} sha256 @param {any} exportKey @returns {string} */
function signEnvelope(sha256, exportKey) {
  if (!exportKey) return "";
  return createHmac("sha256", exportKey).update(sha256).digest("hex");
}

/** @param {any} game @param {any} exportKey @returns {any} */
function buildEnvelope(game, exportKey) {
  const sha256 = sha256Hex(game.html);
  return {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    exportedAt: new Date().toISOString(),
    game: {
      title: game.title,
      prompt: game.prompt,
      provider: game.provider,
      model: game.model,
    },
    html: game.html,
    sha256,
    hmac: signEnvelope(sha256, exportKey),
  };
}

/** Validates an imported envelope. Returns { ok, error } or { ok:true, value }. */
/** @param {any} payload @param {any} exportKey @returns {any} */
function verifyEnvelope(payload, exportKey) {
  if (!payload || typeof payload !== "object") return { ok: false, error: "Empty or invalid package." };
  if (payload.format !== ENVELOPE_FORMAT) {
    return { ok: false, error: `Not a ${ENVELOPE_FORMAT} package.` };
  }
  if (!Number.isInteger(payload.version) || payload.version > ENVELOPE_VERSION) {
    return { ok: false, error: `Unsupported package version: ${payload.version}` };
  }
  if (typeof payload.html !== "string" || !payload.html.trim()) {
    return { ok: false, error: "Package has no HTML." };
  }
  if (!/<html|<!doctype/i.test(payload.html)) {
    return { ok: false, error: "Package HTML does not look like a document." };
  }
  if (Buffer.byteLength(payload.html, "utf8") > IMPORT_MAX_BYTES) {
    return { ok: false, error: "Game HTML exceeds the 5 MB limit." };
  }

  const actual = sha256Hex(payload.html);
  if (!payload.sha256 || actual !== payload.sha256) {
    return { ok: false, error: "Integrity check failed (sha256 mismatch)." };
  }

  if (exportKey) {
    const expected = signEnvelope(actual, exportKey);
    const provided = String(payload.hmac || "");
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: "Signature verification failed." };
    }
  }

  return { ok: true, value: payload };
}

/** Redacts credentials from an error before it is logged or returned to a client. */
/** @param {any} err @param {any} apiKey @returns {string} */
function sanitizeError(err, apiKey) {
  return redactSecrets(err?.message || err || "Unknown error", apiKey);
}

/** Normalizes OpenAI-compatible, Ollama and bare-array model payloads into a flat id list. */
/** @param {any} payload @returns {string[]} */
function normalizeModels(payload) {
  /** @type {any[]} */
  const out = [];
  const push = (/** @type {any} */ candidate) => {
    const id = typeof candidate === "string" ? candidate : candidate?.id || candidate?.name || candidate?.model;
    if (id && typeof id === "string") out.push(id);
  };

  if (Array.isArray(payload?.data)) payload.data.forEach(push);
  else if (Array.isArray(payload?.models)) payload.models.forEach(push);
  else if (Array.isArray(payload)) payload.forEach(push);

  return [...new Set(out)];
}

const NON_CHAT_PATTERN =
  /embed|whisper|tts|dall-e|moderation|transcri|rerank|text-to-speech|realtime|computer-use|image-|audio/i;

/** Provider catalogues also list embeddings/audio/image models; keep chat-capable ids when meaningful. */
/** @param {any} models @param {any} provider @returns {any} */
function filterChatModels(models, provider) {
  // Custom endpoints expose arbitrary names the user controls — never second-guess them.
  if (provider === "openai-compatible" || provider === "template") return models;
  const filtered = models.filter((/** @type {any} */ id) => !NON_CHAT_PATTERN.test(String(id)));
  return filtered.length > 0 ? filtered : models;
}

export function createAppServer({
  dbPath = process.env.LUDO_DB_PATH || resolve(__dirname, "../data/ludo.db"),
  adminKey = process.env.LUDO_ADMIN_KEY || "ludo-admin",
  exportKey = process.env.LUDO_EXPORT_KEY || "",
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  const store = createGameStore(dbPath);
  const previews = createPreviewStore(dbPath);

  /** @param {any} game @returns {any} */
  function withPreviewMeta(game) {
    const info = previews.stat(game.id);
    if (!info) return { ...game, previewUrl: null, previewStale: false };
    const latestRevision = Array.isArray(game.revisions) ? game.revisions[0] : null;
    const served = Date.parse(latestRevision?.created_at || "");
    return {
      ...game,
      previewUrl: `/api/games/${game.id}/preview?v=${info.version}`,
      previewStale: Number.isFinite(served) ? info.mtimeMs < served : false,
    };
  }

  /**
   * Prints a provider failure to the server console as a single copy-pasteable line.
   * The API key is redacted before it ever reaches the log.
   * @param {any} opts
   * @returns {string}
   */
  function logAiFailure({ endpoint, provider, model, baseUrl, err, apiKey, status }) {
    const line = [
      `[ai-error] ${new Date().toISOString()}`,
      `endpoint=${endpoint}`,
      status ? `status=${status}` : null,
      `provider=${provider || "unknown"}`,
      `model=${model || "unknown"}`,
      baseUrl ? `baseUrl=${baseUrl}` : null,
      `message=${redactSecrets(err?.message || err, apiKey)}`,
    ]
      .filter(Boolean)
      .join(" ");
    logger.error(line);
    return line;
  }

  /**
   * Lists models for the caller's ephemeral provider config.
   * Credentials are forwarded only for this single request and never persisted or echoed back.
   * @param {any} [cfg]
   * @returns {Promise<any>}
   */
  async function listProviderModels(cfg = {}) {
    const provider = cfg.provider || "ollama";

    if (provider === "template") {
      return {
        ok: true,
        models: ["built-in-arcade-engine"],
        source: "builtin",
        message: "Built-in Instant Generator is ready (offline mode).",
      };
    }

    const preset = PROVIDER_PRESETS[/** @type {keyof typeof PROVIDER_PRESETS} */ (provider)] || PROVIDER_PRESETS["openai-compatible"];
    const baseUrl = (cfg.baseUrl || preset.baseUrl || "http://localhost:11434/v1").replace(/\/+$/, "");

    // Some providers serve their catalogue outside the chat prefix (e.g. OpenCode Go).
    const usingPresetUrl =
      !cfg.baseUrl || cfg.baseUrl.replace(/\/+$/, "") === (preset.baseUrl || "").replace(/\/+$/, "");
    const modelsUrl = usingPresetUrl && (/** @type {any} */ (preset)).modelsUrl ? (/** @type {any} */ (preset)).modelsUrl : `${baseUrl}/models`;

    const headers = {};
    if (cfg.apiKey) {
      if (provider === "anthropic") {
        headers["x-api-key"] = cfg.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers.Authorization = `Bearer ${cfg.apiKey}`;
      }
    }

    const attempts = [{ url: modelsUrl, source: "openai" }];
    const isLocalHost = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(baseUrl);
    if (provider === "ollama" || (provider === "openai-compatible" && isLocalHost)) {
      // Ollama's canonical listing lives outside the /v1 compatibility surface.
      attempts.push({ url: `${baseUrl.replace(/\/v1$/, "")}/api/tags`, source: "ollama" });
    }
    // OpenCode serves its catalog outside the chat prefix, so a manually typed
    // /inference/go/openai/v1 URL 404s on /models. Derive the real one from the origin.
    if (baseUrl.includes("opencode.ai")) {
      try {
        attempts.push({
          url: `${new URL(baseUrl).origin}/inference/go/v1/models`,
          source: "openai",
        });
      } catch {
        /* malformed baseUrl: nothing to derive */
      }
    }

    let lastError = "";
    for (const attempt of attempts) {
      try {
        const res = await fetchImpl(attempt.url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
        });

        if (!res.ok) {
          lastError = `Endpoint responded with HTTP ${res.status}`;
          continue;
        }

        const payload = await res.json();
        const found = filterChatModels(normalizeModels(payload), provider);
        // Defense in depth: never relay a model id that would echo the caller's own credential back.
        const models = cfg.apiKey ? found.filter((/** @type {any} */ id) => !String(id).includes(cfg.apiKey)) : found;

        if (models.length > 0) {
          return { ok: true, models, source: attempt.source, message: `${models.length} models found` };
        }
        lastError = "Endpoint returned no models";
      } catch (err) {
        logAiFailure({
          endpoint: `GET ${attempt.url}`,
          provider,
          model: cfg.model,
          baseUrl,
          apiKey: cfg.apiKey,
          err,
        });
        lastError = sanitizeError(err, cfg.apiKey);
      }
    }

    return {
      ok: false,
      models: [],
      source: "none",
      message: lastError || "Could not list models",
    };
  }

  /** @param {any} req @returns {{ viewerHash: string, isAdmin: boolean }} */
  function extractCallerAuth(req) {
    const rawToken = req.headers["x-creator-token"] || "";
    const rawAdmin = req.headers["x-admin-key"] || "";
    const viewerHash = hashCreatorToken(rawToken);
    const isAdmin = safeCompareSecret(rawAdmin, adminKey);
    return { viewerHash, isAdmin };
  }

  const rateLimitMap = new Map();
  /** @param {any} ip @returns {boolean} */
  function isRateLimited(ip) {
    const now = Date.now();
    const windowMs = 60000;
    const limit = 60;
    let entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitMap.set(ip, entry);
    }
    entry.count += 1;
    return entry.count > limit;
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const { pathname } = url;
      const method = req.method || "GET";
      const auth = extractCallerAuth(req);

      const isWrite = method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
      if (isWrite && pathname.startsWith("/api/")) {
        const ip = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
        if (isRateLimited(ip)) {
          res.setHeader("Retry-After", "60");
          return sendJson(res, 429, { error: "Too many requests. Please slow down." });
        }
      }

      // Health check
      if (pathname === "/api/health" && method === "GET") {
        return sendJson(res, 200, { status: "ok" });
      }

      // Verify Admin Key endpoint
      if (pathname === "/api/auth/verify-admin" && method === "POST") {
        return sendJson(res, 200, { isAdmin: auth.isAdmin });
      }

      // Dedicated standalone game runner route (/play/:id) — Playable by everyone
      const playRouteMatch = pathname.match(/^\/play\/([^/]+)$/);
      if (playRouteMatch && method === "GET") {
        const gameId = decodeURIComponent(playRouteMatch[1]);
        const game = store.getGame(gameId, auth);
        if (!game) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("Game not found");
        }
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          // A game is untrusted code: it may render, but it must never reach the network or the app.
          "Content-Security-Policy": [
            "default-src 'none'",
            "script-src 'unsafe-inline' 'unsafe-eval'",
            "style-src 'unsafe-inline'",
            "img-src data: blob:",
            "media-src data: blob:",
            "font-src data:",
            "connect-src 'none'",
            "form-action 'none'",
            "base-uri 'none'",
          ].join("; "),
        });
        return res.end(withCaptureHelper(game.html));
      }

      // Public static presets catalog ONLY — personal AI settings/keys NEVER live on the server
      if ((pathname === "/api/presets" || pathname === "/api/settings") && method === "GET") {
        return sendJson(res, 200, {
          presets: PROVIDER_PRESETS,
        });
      }

      // Stateless AI connection probe using only the caller's request body
      if (pathname === "/api/settings/test" && method === "POST") {
        const cfg = await readJsonBody(req);
        const provider = cfg.provider || "ollama";
        const result = await listProviderModels(cfg);
        return sendJson(res, 200, {
          ok: result.ok,
          models: result.models,
          message: result.ok
            ? `Connected to ${provider} (${result.models.length} models)`
            : result.message,
        });
      }

      // Stateless model catalogue for the AI Setup picker — credentials are never persisted
      if (pathname === "/api/models" && method === "POST") {
        const cfg = await readJsonBody(req);
        const result = await listProviderModels(cfg);
        return sendJson(res, 200, result);
      }

      // Import a .ludogame package — admin only (option B): it injects foreign code into the library.
      if (pathname === "/api/games/import" && method === "POST") {
        if (!auth.isAdmin) {
          return sendJson(res, 403, {
            error: "Forbidden: only an Admin can import game packages.",
          });
        }
        const payload = await readJsonBody(req);
        const verified = verifyEnvelope(payload, exportKey);
        if (!verified.ok) {
          return sendJson(res, 400, { error: verified.error });
        }
        const pkg = verified.value;
        const targetId =
          typeof payload.targetId === "string" && payload.targetId.trim()
            ? payload.targetId.trim()
            : "";

        // Upsert path used by the authoring loop: replace an existing game in place so the
        // review URL stays stable and the previous HTML is kept as a revision.
        if (targetId) {
          const existing = store.getGame(targetId, auth);
          if (!existing) return sendJson(res, 404, { error: "Game not found." });

          // Only fields the package actually carries are replaced; undefined preserves the current value.
          const text = (/** @type {any} */ value, /** @type {any} */ max = undefined) => {
            if (typeof value !== "string") return undefined;
            const trimmed = value.trim();
            if (!trimmed) return undefined;
            return max ? trimmed.slice(0, max) : trimmed;
          };

          const updated = store.updateGame(
            targetId,
            {
              title: text(pkg.game?.title, 200),
              prompt: text(pkg.game?.prompt),
              html: pkg.html,
              provider: text(pkg.game?.provider),
              model: text(pkg.game?.model),
            },
            auth
          );
          return sendJson(res, 200, {
            game: updated,
            signed: Boolean(exportKey),
            integrity: "sha256 ok",
            updated: true,
          });
        }

        const game = store.createGame(
          {
            title: String(pkg.game?.title || "Imported Game").slice(0, 200),
            prompt: String(pkg.game?.prompt || "Imported package"),
            html: pkg.html,
            provider: String(pkg.game?.provider || "imported"),
            model: String(pkg.game?.model || "imported"),
            ownerHash: auth.viewerHash || "admin",
          },
          auth
        );
        return sendJson(res, 201, {
          game,
          signed: Boolean(exportKey),
          integrity: "sha256 ok",
        });
      }

      // List all games (includes per-caller canEdit / isOwner flags)
      if (pathname === "/api/games" && method === "GET") {
        return sendJson(res, 200, {
          games: store.listGames(auth).map(withPreviewMeta),
          isAdmin: auth.isAdmin,
        });
      }

      // Manual create from raw HTML — admin only: arbitrary code injection is an operator action.
      if (pathname === "/api/games" && method === "POST") {
        if (!auth.isAdmin) {
          return sendJson(res, 403, {
            error: "Forbidden: only an Admin can create a game from raw HTML. Use a prompt instead.",
          });
        }
        const body = await readJsonBody(req);
        if (!body.title || !body.html) {
          return sendJson(res, 400, { error: "Both title and html are required." });
        }
        const game = store.createGame(
          {
            title: body.title,
            prompt: body.prompt || "Manual HTML game",
            html: body.html,
            provider: body.provider || "manual",
            model: body.model || "custom",
            ownerHash: auth.viewerHash || "anonymous",
          },
          auth
        );
        return sendJson(res, 201, { game });
      }

      // AI Generate new game using ONLY the caller's ephemeral settings in body.settings
      if (pathname === "/api/games/generate" && method === "POST") {
        const body = await readJsonBody(req);
        if (!body.prompt || !String(body.prompt).trim()) {
          return sendJson(res, 400, { error: "Game prompt is required." });
        }

        const activeSettings = body.settings || {
          provider: "ollama",
          baseUrl: "http://localhost:11434/v1",
          model: "qwen2.5-coder:7b",
          fallbackToTemplate: true,
        };
        let generated;
        let usedProvider = activeSettings.provider || "ollama";
        let usedModel = activeSettings.model || "default";
        let fallbackNote = null;

        try {
          generated = await generateOrModifyGame({
            mode: "create",
            prompt: body.prompt,
            settings: activeSettings,
            sessionId: randomUUID(),
            fetchImpl,
          });
        } catch (err) {
          logAiFailure({
            endpoint: "POST /api/games/generate",
            provider: activeSettings.provider,
            model: activeSettings.model,
            baseUrl: activeSettings.baseUrl,
            apiKey: activeSettings.apiKey,
            err,
          });

          if (activeSettings.fallbackToTemplate !== false) {
            generated = buildDynamicTemplateGame(body.prompt, body.title || "");
            usedProvider = "template";
            usedModel = "built-in-fallback";
            fallbackNote = `AI provider unreachable (${(/** @type {any} */ (err))?.message || err}); created with Built-in Instant Generator.`;
          } else {
            return sendJson(res, 502, { error: redactSecrets((/** @type {any} */ (err))?.message || err, activeSettings.apiKey) });
          }
        }

        const finalTitle = body.title?.trim() || generated.title;
        const game = store.createGame(
          {
            title: finalTitle,
            prompt: body.prompt.trim(),
            html: generated.html,
            provider: usedProvider,
            model: usedModel,
            ownerHash: auth.viewerHash || "anonymous",
          },
          auth
        );

        return sendJson(res, 201, { game, fallbackNote });
      }

      // Match /api/games/:id and sub-actions
      const gameRouteMatch = pathname.match(/^\/api\/games\/([^/]+)(?:\/([^/]+))?$/);
      if (gameRouteMatch) {
        const gameId = decodeURIComponent(gameRouteMatch[1]);
        const subAction = gameRouteMatch[2] || "";

        if (!subAction && method === "GET") {
          const game = store.getGame(gameId, auth);
          if (!game) return sendJson(res, 404, { error: "Game not found." });
          return sendJson(res, 200, { game });
        }

        // Clone game: open to ANY user, assigns ownership of the clone to the caller
        if (subAction === "clone" && method === "POST") {
          const body = await readJsonBody(req);
          const cloned = store.cloneGame(
            gameId,
            {
              ownerHash: auth.viewerHash || "anonymous",
              newTitle: body.title,
            },
            auth
          );
          if (!cloned) return sendJson(res, 404, { error: "Game not found." });
          return sendJson(res, 201, { game: cloned });
        }

        // Preview is public: the library already shows it to everyone.
        if (subAction === "preview" && method === "GET") {
          const found = previews.read(gameId);
          if (!found) return sendJson(res, 404, { error: "Preview not found." });
          if (req.headers["if-none-match"] === found.etag) {
            res.writeHead(304, { ETag: found.etag });
            return res.end();
          }
          res.writeHead(200, {
            "Content-Type": found.type,
            "Content-Length": found.body.length,
            "Cache-Control": "public, max-age=31536000, immutable",
            ETag: found.etag,
            "X-Content-Type-Options": "nosniff",
          });
          return res.end(found.body);
        }

        if (subAction === "export" && method === "GET") {
          // Export is available to everyone: the game HTML is already public via GET /play/:id.
          const game = store.getGame(gameId, auth);
          if (!game) return sendJson(res, 404, { error: "Game not found." });
          const envelope = buildEnvelope(game, exportKey);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Disposition": `attachment; filename="${slugify(game.title)}.ludogame.json"`,
          });
          return res.end(JSON.stringify(envelope, null, 2));
        }

        // All mutating operations below require creator ownership OR admin passkey
        const existing = store.getGame(gameId, auth);
        if (!existing) {
          return sendJson(res, 404, { error: "Game not found." });
        }
        if (!store.canModifyGame(gameId, auth)) {
          return sendJson(res, 403, {
            error:
              "Forbidden: Only the creator of this game or an Admin can edit or delete it. Clone the game to make your own version!",
          });
        }

        if (!subAction && method === "PUT") {
          const body = await readJsonBody(req);
          const updated = store.updateGame(
            gameId,
            {
              title: body.title,
              prompt: body.prompt,
              html: body.html,
            },
            auth
          );
          return sendJson(res, 200, { game: updated });
        }

        if (!subAction && method === "DELETE") {
          store.deleteGame(gameId);
          previews.remove(gameId);
          return sendJson(res, 200, { deleted: true, id: gameId });
        }

        // The owner or an admin pins the frame that represents this game.
        if (subAction === "preview" && method === "POST") {
          const body = await readJsonBody(req);
          const saved = previews.save(gameId, body.image);
          if (!saved.ok) return sendJson(res, 400, { error: saved.error });
          const info = previews.stat(gameId);
          return sendJson(res, 200, {
            previewUrl: `/api/games/${gameId}/preview?v=${info?.version || Date.now()}`,
            previewStale: false,
          });
        }

        if (subAction === "modify" && method === "POST") {
          const body = await readJsonBody(req);
          if (!body.prompt || !String(body.prompt).trim()) {
            return sendJson(res, 400, { error: "Modification prompt is required." });
          }

          const activeSettings = body.settings || {
            provider: "ollama",
            baseUrl: "http://localhost:11434/v1",
            model: "qwen2.5-coder:7b",
            fallbackToTemplate: true,
          };
          let modifiedPayload;
          let usedProvider = activeSettings.provider || existing.provider;
          let usedModel = activeSettings.model || existing.model;
          let fallbackNote = null;

          try {
            modifiedPayload = await generateOrModifyGame({
              mode: "modify",
              prompt: body.prompt,
              currentHtml: existing.html,
              currentTitle: existing.title,
              history: (Array.isArray(existing.revisions) ? existing.revisions : [])
                .slice(1)
                .map((/** @type {any} */ r) => r && r.prompt)
                .filter(Boolean)
                .reverse()
                .slice(-6)
                .filter((/** @type {any} */ p) => String(p).trim() !== String(body.prompt || "").trim()),
              settings: activeSettings,
              // Stable per conversation: every edit of the same game reuses the routing session.
              sessionId: gameId,
              fetchImpl,
            });
          } catch (err) {
            // Editing is all-or-nothing. Falling back to the template generator here would silently
            // replace the user's game with a different one, so the failure must surface instead.
            logAiFailure({
              endpoint: `POST /api/games/${gameId}/modify`,
              provider: activeSettings.provider,
              model: activeSettings.model,
              baseUrl: activeSettings.baseUrl,
              apiKey: activeSettings.apiKey,
              err,
            });
            return sendJson(res, 502, { error: redactSecrets((/** @type {any} */ (err))?.message || err, activeSettings.apiKey) });
          }

          const updated = store.updateGame(
            gameId,
            {
              title: body.title?.trim() || modifiedPayload.title || existing.title,
              prompt: body.prompt.trim(),
              html: modifiedPayload.html,
              provider: usedProvider,
              model: usedModel,
            },
            auth
          );

          return sendJson(res, 200, { game: updated, fallbackNote });
        }

        if (subAction === "restore" && method === "POST") {
          const body = await readJsonBody(req);
          if (!body.revisionId) {
            return sendJson(res, 400, { error: "revisionId is required." });
          }
          const restored = store.restoreRevision(gameId, body.revisionId, auth);
          if (!restored) return sendJson(res, 404, { error: "Game or revision not found." });
          return sendJson(res, 200, { game: restored });
        }
      }

      // Serve static files from /public
      const cleanPath = pathname === "/" ? "/index.html" : pathname;
      const targetFile = resolve(PUBLIC_DIR, `.${cleanPath}`);
      if (!targetFile.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end("Forbidden");
      }

      try {
        const content = await readFile(targetFile);
        const ext = extname(targetFile);
        res.writeHead(200, {
          "Content-Type": MIME_TYPES[/** @type {keyof typeof MIME_TYPES} */ (ext)] || "application/octet-stream",
          // The app ships from a local server and changes often; never let the browser hold a stale copy.
          "Cache-Control": "no-cache",
        });
        return res.end(content);
      } catch {
        // SPA fallback to index.html for non-API routes
        if (!pathname.startsWith("/api/")) {
          const indexContent = await readFile(join(PUBLIC_DIR, "index.html"));
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          return res.end(indexContent);
        }
        return sendJson(res, 404, { error: "Not found" });
      }
    } catch (err) {
      return sendJson(res, 500, { error: redactSecrets((/** @type {any} */ (err))?.message || err, "") || "Internal server error" });
    }
  });

  return { server, store };
}

// Run directly when executed as main entrypoint
const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  const adminKey = process.env.LUDO_ADMIN_KEY || "ludo-admin";
  const { server } = createAppServer({ adminKey });
  server.listen(port, host, () => {
    console.log(`🎮 Ludo Game-On-Demand running at http://localhost:${port}`);
    console.log(`🔑 Admin Passkey: ${adminKey} (override with LUDO_ADMIN_KEY env var)`);
  });
}
