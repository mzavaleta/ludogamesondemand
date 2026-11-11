import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../src/server.mjs";

test("REST API enforces creator ownership, admin override, game cloning, and never persists AI credentials", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ludo-api-"));
  const dbPath = join(dir, "api-test.db");
  const adminKey = "test-super-secret-admin";

  const { server, store } = createAppServer({ dbPath, adminKey });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const aliceHeaders = {
    "Content-Type": "application/json",
    "X-Creator-Token": "alice-browser-token-123",
  };
  const bobHeaders = {
    "Content-Type": "application/json",
    "X-Creator-Token": "bob-browser-token-456",
  };
  const adminHeaders = {
    "Content-Type": "application/json",
    "X-Creator-Token": "admin-browser-token",
    "X-Admin-Key": adminKey,
  };

  try {
    // 1. Verify /api/presets returns provider catalog ONLY (never personal API keys)
    const presetsRes = await fetch(`${base}/api/presets`);
    assert.equal(presetsRes.status, 200);
    const presetsPayload = await presetsRes.json();
    assert.ok(presetsPayload.presets.ollama);
    assert.equal(typeof presetsPayload.settings, "undefined", "Server must never store or return shared AI settings");

    // 1b. Test stateless AI provider connection probe
    const testSettingsRes = await fetch(`${base}/api/settings/test`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({ provider: "template", model: "built-in-arcade-engine" }),
    });
    assert.equal(testSettingsRes.status, 200);
    const testSettingsPayload = await testSettingsRes.json();
    assert.equal(testSettingsPayload.ok, true);

    // 1c. Test admin verification endpoint
    const badAdminRes = await fetch(`${base}/api/auth/verify-admin`, {
      method: "POST",
      headers: bobHeaders,
    });
    assert.equal((await badAdminRes.json()).isAdmin, false);

    const goodAdminRes = await fetch(`${base}/api/auth/verify-admin`, {
      method: "POST",
      headers: adminHeaders,
    });
    assert.equal((await goodAdminRes.json()).isAdmin, true);

    // 2. List initial seeded games (non-admin cannot edit seeded games)
    const listRes = await fetch(`${base}/api/games`, { headers: aliceHeaders });
    assert.equal(listRes.status, 200);
    const { games: initialGames } = await listRes.json();
    assert.ok(initialGames.length >= 3);
    assert.equal(initialGames[0].canEdit, false);

    // 3. Alice generates a new game using her own browser-supplied AI settings
    const genRes = await fetch(`${base}/api/games/generate`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({
        prompt: "Neon space laser dodger with turbo speed",
        settings: { provider: "template", model: "built-in-arcade-engine" },
      }),
    });
    assert.equal(genRes.status, 201);
    const { game: created } = await genRes.json();
    assert.ok(created.id);
    assert.equal(created.canEdit, true, "Creator can edit their own game");

    // 4. Bob CANNOT modify or delete Alice's game (403 Forbidden)
    const bobModRes = await fetch(`${base}/api/games/${created.id}/modify`, {
      method: "POST",
      headers: bobHeaders,
      body: JSON.stringify({
        prompt: "Hack Alice game",
        settings: { provider: "template" },
      }),
    });
    assert.equal(bobModRes.status, 403);

    const bobEditRes = await fetch(`${base}/api/games/${created.id}`, {
      method: "PUT",
      headers: bobHeaders,
      body: JSON.stringify({ title: "Bob Stolen Title" }),
    });
    assert.equal(bobEditRes.status, 403);

    const bobDelRes = await fetch(`${base}/api/games/${created.id}`, {
      method: "DELETE",
      headers: bobHeaders,
    });
    assert.equal(bobDelRes.status, 403);

    // 5. Bob CAN clone Alice's game and then modify his cloned copy!
    const cloneRes = await fetch(`${base}/api/games/${created.id}/clone`, {
      method: "POST",
      headers: bobHeaders,
      body: JSON.stringify({ title: "Bob's Space Remix" }),
    });
    assert.equal(cloneRes.status, 201);
    const { game: bobClone } = await cloneRes.json();
    assert.notEqual(bobClone.id, created.id);
    assert.equal(bobClone.title, "Bob's Space Remix");
    assert.equal(bobClone.canEdit, true);

    const bobModCloneRes = await fetch(`${base}/api/games/${bobClone.id}/modify`, {
      method: "POST",
      headers: bobHeaders,
      body: JSON.stringify({
        prompt: "Add memory puzzle bonus stage",
        settings: { provider: "template" },
      }),
    });
    assert.equal(bobModCloneRes.status, 200);

    // 6. Alice CAN modify, edit, and restore revisions on her own game
    const modRes = await fetch(`${base}/api/games/${created.id}/modify`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({
        prompt: "Add a memory card puzzle mode",
        settings: { provider: "template" },
      }),
    });
    assert.equal(modRes.status, 200);
    const { game: modified } = await modRes.json();
    assert.equal(modified.revisions.length, 2);

    const editRes = await fetch(`${base}/api/games/${created.id}`, {
      method: "PUT",
      headers: aliceHeaders,
      body: JSON.stringify({
        title: "Custom Space Edition",
        html: "<!DOCTYPE html><html><body><h1>Custom Edited</h1></body></html>",
      }),
    });
    assert.equal(editRes.status, 200);
    const { game: edited } = await editRes.json();
    assert.equal(edited.title, "Custom Space Edition");
    assert.equal(edited.revisions.length, 3);

    const firstRev = edited.revisions[edited.revisions.length - 1];
    const restoreRes = await fetch(`${base}/api/games/${created.id}/restore`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({ revisionId: firstRev.id }),
    });
    assert.equal(restoreRes.status, 200);
    const { game: restored } = await restoreRes.json();
    assert.ok(!restored.html.includes("Custom Edited"));

    // 7. Admin CAN edit or delete anyone's game (e.g. Bob's clone)
    const adminDelBobRes = await fetch(`${base}/api/games/${bobClone.id}`, {
      method: "DELETE",
      headers: adminHeaders,
    });
    assert.equal(adminDelBobRes.status, 200);

    // 8. Alice deletes her own game
    const delRes = await fetch(`${base}/api/games/${created.id}`, {
      method: "DELETE",
      headers: aliceHeaders,
    });
    assert.equal(delRes.status, 200);

    const getDeleted = await fetch(`${base}/api/games/${created.id}`);
    assert.equal(getDeleted.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AI failure while editing must never overwrite the game with a template", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ludo-modfail-"));
  const dbPath = join(dir, "modfail.db");

  const failingFetch = async () => {
    throw new Error('AI Provider (openai-compatible) error 429: {"type":"FreeUsageLimitError"}');
  };

  const logged = [];
  const logger = {
    log: (...a) => logged.push(["log", a.join(" ")]),
    warn: (...a) => logged.push(["warn", a.join(" ")]),
    error: (...a) => logged.push(["error", a.join(" ")]),
  };

  const { server, store } = createAppServer({ dbPath, fetchImpl: failingFetch, logger });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    "Content-Type": "application/json",
    "X-Creator-Token": "owner-token-xyz",
    "X-Admin-Key": "ludo-admin",
  };

  try {
    const originalHtml = "<!DOCTYPE html><html><body><h1>ORIGINAL PRECIOUS GAME</h1></body></html>";
    const createRes = await fetch(`${base}/api/games`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "My Game", prompt: "create it", html: originalHtml }),
    });
    assert.equal(createRes.status, 201);
    const { game } = await createRes.json();

    const modRes = await fetch(`${base}/api/games/${game.id}/modify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: "add a boss level",
        settings: {
          provider: "openai-compatible",
          baseUrl: "http://localhost:9/v1",
          apiKey: "sk-must-never-be-logged",
          fallbackToTemplate: true,
        },
      }),
    });

    // Editing is all-or-nothing: a provider failure must surface, not silently swap the game
    assert.equal(modRes.status, 502);
    const err = await modRes.json();
    assert.match(err.error, /429|FreeUsageLimit/i);

    const after = store.getGame(game.id);
    assert.equal(after.html, originalHtml, "Game HTML must be untouched after a failed edit");
    assert.equal(after.revisions.length, 1, "No revision may be created for a failed edit");

    // The failure returned to the browser must be redacted too, not just the log line.
    const responseText = JSON.stringify(err);
    assert.ok(!responseText.includes("sk-must-never-be-logged"), "HTTP error body leaked the API key");

    // The failure must be copyable from the server console, with the credential redacted
    const failures = logged.filter(([level]) => level === "error");
    assert.ok(failures.length >= 1, "Expected the AI failure to be logged");
    const line = failures.map(([, text]) => text).join("\n");
    assert.match(line, /429|FreeUsageLimit/i);
    assert.ok(line.includes("/api/games"), "Log line should name the endpoint");
    assert.match(line, /openai-compatible/, "Log line should name the provider");
    assert.ok(!line.includes("sk-must-never-be-logged"), "Log line must never contain the API key");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("POST /api/models lists provider models without ever echoing credentials", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ludo-models-"));
  const dbPath = join(dir, "models-test.db");

  const requestedUrls = [];
  let mockMode = "openai";

  const fetchImpl = async (url, init) => {
    requestedUrls.push({ url: String(url), auth: init?.headers?.Authorization, apiKeyHeader: init?.headers?.["x-api-key"] });

    if (mockMode === "throw") {
      throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
    }
    if (mockMode === "openai") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          object: "list",
          data: [
            { id: "qwen2.5-coder:7b" },
            { id: "llama3.2:3b" },
            { id: "text-embedding-3-small" },
          ],
        }),
      };
    }
    if (mockMode === "ollama-tags") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: [{ name: "mistral:7b" }, { name: "qwen2.5-coder:14b" }],
        }),
      };
    }
    if (mockMode === "anthropic") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" },
            { id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
          ],
          has_more: false,
        }),
      };
    }
    if (mockMode === "echo-key") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "sk-echoed-key-999" }, { id: "safe-model" }] }),
      };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };

  const { server, store } = createAppServer({ dbPath, fetchImpl });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const post = (body, headers = {}) =>
    fetch(`${base}/api/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  try {
    // 1. Built-in generator needs no network and returns its single pseudo-model
    const builtinRes = await post({ provider: "template" });
    assert.equal(builtinRes.status, 200);
    const builtin = await builtinRes.json();
    assert.equal(builtin.ok, true);
    assert.deepEqual(builtin.models, ["built-in-arcade-engine"]);

    // 2. OpenAI-compatible shape is normalized and non-chat models are filtered out
    mockMode = "openai";
    const openaiRes = await post({
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      apiKey: "sk-secret-value-123",
    });
    assert.equal(openaiRes.status, 200);
    const openai = await openaiRes.json();
    assert.equal(openai.ok, true);
    assert.deepEqual(openai.models, ["qwen2.5-coder:7b", "llama3.2:3b"]);
    assert.ok(!JSON.stringify(openai).includes("sk-secret-value-123"), "Response must never echo the API key");

    // The key is forwarded as a Bearer header, never as a query param
    const lastCall = requestedUrls.at(-1);
    assert.equal(lastCall.url, "http://localhost:1234/v1/models");
    assert.equal(lastCall.auth, "Bearer sk-secret-value-123");

    // 3. Ollama falls back to /api/tags when /v1/models is unusable
    mockMode = "openai";
    requestedUrls.length = 0;
    let ollamaCalls = 0;
    const ollamaFetchImpl = async (url, init) => {
      requestedUrls.push({ url: String(url), auth: init?.headers?.Authorization });
      ollamaCalls += 1;
      if (ollamaCalls === 1) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ models: [{ name: "mistral:7b" }] }) };
    };
    const ollamaServer = createAppServer({ dbPath: join(dir, "ollama.db"), fetchImpl: ollamaFetchImpl });
    await new Promise((resolve) => ollamaServer.server.listen(0, "127.0.0.1", resolve));
    const ollamaBase = `http://127.0.0.1:${ollamaServer.server.address().port}`;
    try {
      const ollamaRes = await fetch(`${ollamaBase}/api/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "ollama", baseUrl: "http://localhost:11434/v1" }),
      });
      const ollama = await ollamaRes.json();
      assert.equal(ollama.ok, true);
      assert.deepEqual(ollama.models, ["mistral:7b"]);
      assert.equal(requestedUrls[0].url, "http://localhost:11434/v1/models");
      assert.equal(requestedUrls[1].url, "http://localhost:11434/api/tags");
    } finally {
      await new Promise((resolve) => ollamaServer.server.close(resolve));
      ollamaServer.store.close();
    }

    // 5. OpenCode Go is a first-class preset: its catalogue lives outside the chat prefix
    mockMode = "openai";
    requestedUrls.length = 0;
    const goRes = await post({ provider: "opencode-go", apiKey: "sk-go-key" });
    const go = await goRes.json();
    assert.equal(go.ok, true);
    assert.equal(
      requestedUrls.at(-1).url,
      "https://opencode.ai/inference/go/v1/models",
      "OpenCode Go must list models from the /inference/go/ namespace"
    );
    assert.equal(requestedUrls.at(-1).auth, "Bearer sk-go-key");

    // 6. A manually typed OpenCode Go chat URL still resolves its catalog from the origin
    mockMode = "404-then-ok";
    requestedUrls.length = 0;
    const customGo = createAppServer({
      dbPath: join(dir, "custom-go.db"),
      fetchImpl: async (url, init) => {
        requestedUrls.push({ url: String(url), auth: init?.headers?.Authorization });
        if (String(url).endsWith("/inference/go/openai/v1/models")) {
          return { ok: false, status: 404, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({ data: [{ id: "deepseek-v4.1-flash" }] }) };
      },
    });
    await new Promise((resolve) => customGo.server.listen(0, "127.0.0.1", resolve));
    const customGoBase = `http://127.0.0.1:${customGo.server.address().port}`;
    try {
      const res = await fetch(`${customGoBase}/api/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai-compatible",
          baseUrl: "https://opencode.ai/inference/go/openai/v1",
          apiKey: "sk-custom",
        }),
      });
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.deepEqual(payload.models, ["deepseek-v4.1-flash"]);
      assert.equal(requestedUrls[0].url, "https://opencode.ai/inference/go/openai/v1/models");
      assert.equal(requestedUrls[1].url, "https://opencode.ai/inference/go/v1/models");
    } finally {
      await new Promise((resolve) => customGo.server.close(resolve));
      customGo.store.close();
    }

    // 7. Anthropic uses x-api-key + anthropic-version headers, not Bearer
    mockMode = "anthropic";
    const anthropicRes = await post({
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "sk-ant-secret",
    });
    const anthropic = await anthropicRes.json();
    assert.equal(anthropic.ok, true);
    assert.deepEqual(anthropic.models, ["claude-sonnet-4-5", "claude-haiku-4-5"]);
    const anthropicCall = requestedUrls.at(-1);
    assert.equal(anthropicCall.url, "https://api.anthropic.com/v1/models");
    assert.equal(anthropicCall.apiKeyHeader, "sk-ant-secret");

    // 7. Unreachable provider degrades gracefully and never leaks the key in the error
    mockMode = "throw";
    const failRes = await post({
      provider: "ollama",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "sk-leaky-key-abc",
    });
    assert.equal(failRes.status, 200);
    const failBody = await failRes.json();
    assert.equal(failBody.ok, false);
    assert.deepEqual(failBody.models, []);
    assert.equal(typeof failBody.message, "string");
    assert.ok(!JSON.stringify(failBody).includes("sk-leaky-key-abc"), "Errors must never leak the API key");

    // 8. A misbehaving provider that echoes the credential as a model id must not round-trip it
    mockMode = "echo-key";
    const echoRes = await post({
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      apiKey: "sk-echoed-key-999",
    });
    const echoBody = await echoRes.json();
    assert.equal(echoBody.ok, true);
    assert.deepEqual(echoBody.models, ["safe-model"]);
    assert.ok(!JSON.stringify(echoBody).includes("sk-echoed-key-999"), "Model ids echoing the key must be dropped");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("game previews: authored capture, immutable serving, staleness and cleanup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ludo-preview-"));
  const dbPath = join(dir, "preview.db");
  const adminKey = "preview-admin-key";
  const { server, store } = createAppServer({ dbPath, adminKey });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const owner = { "Content-Type": "application/json", "X-Creator-Token": "preview-owner" };
  const stranger = { "Content-Type": "application/json", "X-Creator-Token": "preview-stranger" };

  // The server never decodes pixels, so container magic bytes are the contract.
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const pngDataUrl = `data:image/png;base64,${png.toString("base64")}`;

  try {
    const createRes = await fetch(`${base}/api/games`, {
      method: "POST",
      headers: { ...owner, "X-Admin-Key": adminKey },
      body: JSON.stringify({
        title: "Preview Target",
        prompt: "capture me",
        html: "<!DOCTYPE html><html><body><canvas id='c' width='10' height='10'></canvas></body></html>",
      }),
    });
    assert.equal(createRes.status, 201);
    const { game } = await createRes.json();

    // Nothing authored yet, and the list says so without inventing a URL.
    const emptyGet = await fetch(`${base}/api/games/${game.id}/preview`);
    assert.equal(emptyGet.status, 404);
    let list = await (await fetch(`${base}/api/games`, { headers: owner })).json();
    assert.equal(list.games.find((g) => g.id === game.id).previewUrl, null);

    // Only the owner or an admin may pin a preview.
    const strangerRes = await fetch(`${base}/api/games/${game.id}/preview`, {
      method: "POST",
      headers: stranger,
      body: JSON.stringify({ image: pngDataUrl }),
    });
    assert.equal(strangerRes.status, 403);

    // Rejects missing/non-image/SVG payloads.
    for (const image of [undefined, "not-an-image", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="]) {
      const badRes = await fetch(`${base}/api/games/${game.id}/preview`, {
        method: "POST",
        headers: owner,
        body: JSON.stringify({ image }),
      });
      assert.equal(badRes.status, 400, `payload ${String(image)} must be rejected`);
    }

    const saveRes = await fetch(`${base}/api/games/${game.id}/preview`, {
      method: "POST",
      headers: owner,
      body: JSON.stringify({ image: pngDataUrl }),
    });
    assert.equal(saveRes.status, 200);
    const saved = await saveRes.json();
    assert.match(saved.previewUrl, /^\/api\/games\/[^/]+\/preview\?v=\d+$/);

    // Served with an immutable cache and the declared type, byte for byte.
    const shot = await fetch(`${base}${saved.previewUrl}`);
    assert.equal(shot.status, 200);
    assert.equal(shot.headers.get("content-type"), "image/png");
    assert.match(shot.headers.get("cache-control"), /immutable/);
    assert.equal(shot.headers.get("x-content-type-options"), "nosniff");
    const body = Buffer.from(await shot.arrayBuffer());
    assert.deepEqual(body, png);

    const etag = shot.headers.get("etag");
    assert.ok(etag);
    const cached = await fetch(`${base}${saved.previewUrl}`, {
      headers: { "If-None-Match": etag },
    });
    assert.equal(cached.status, 304);

    // The list exposes it and reports it as current.
    list = await (await fetch(`${base}/api/games`, { headers: owner })).json();
    let listed = list.games.find((g) => g.id === game.id);
    assert.equal(listed.previewUrl, saved.previewUrl);
    assert.equal(listed.previewStale, false);

    // A new revision makes the shot stale instead of silently out of date.
    await new Promise((r) => setTimeout(r, 20));
    const editRes = await fetch(`${base}/api/games/${game.id}`, {
      method: "PUT",
      headers: owner,
      body: JSON.stringify({ html: "<!DOCTYPE html><html><body>v2</body></html>" }),
    });
    assert.equal(editRes.status, 200);
    list = await (await fetch(`${base}/api/games`, { headers: owner })).json();
    listed = list.games.find((g) => g.id === game.id);
    assert.equal(listed.previewStale, true, "preview must be flagged after a new revision");

    // Re-pinning clears the flag.
    const repin = await fetch(`${base}/api/games/${game.id}/preview`, {
      method: "POST",
      headers: owner,
      body: JSON.stringify({ image: pngDataUrl }),
    });
    assert.equal(repin.status, 200);
    list = await (await fetch(`${base}/api/games`, { headers: owner })).json();
    assert.equal(list.games.find((g) => g.id === game.id).previewStale, false);

    // Deleting the game removes the bytes too.
    const delRes = await fetch(`${base}/api/games/${game.id}`, { method: "DELETE", headers: owner });
    assert.equal(delRes.status, 200);
    const gone = await fetch(`${base}/api/games/${game.id}/preview`);
    assert.equal(gone.status, 404);
  } finally {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("served games carry the capture helper exactly once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ludo-capture-"));
  const dbPath = join(dir, "capture.db");
  const { server, store } = createAppServer({ dbPath, adminKey: "capture-admin" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    "Content-Type": "application/json",
    "X-Creator-Token": "capture-owner",
    "X-Admin-Key": "capture-admin",
  };

  try {
    const createRes = await fetch(`${base}/api/games`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Capture Me",
        prompt: "capture",
        html: "<!DOCTYPE html><html><body><canvas></canvas></body></html>",
      }),
    });
    const { game } = await createRes.json();

    const play = await (await fetch(`${base}/play/${game.id}`)).text();
    const markers = play.match(/data-ludo-capture="1"/g) || [];
    assert.equal(markers.length, 1, "helper must be injected exactly once");
    assert.match(play, /ludo:capture-request/);
    assert.match(play, /ludo:capture-result/);

    // Raw HTML in the database stays clean: the helper is a serving concern.
    assert.equal(store.getGame(game.id).html.includes("data-ludo-capture"), false);
  } finally {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
