import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCreatePrompt,
  buildModifyPrompt,
  extractGamePayload,
  generateOrModifyGame,
} from "../src/prompt-engine.mjs";

test("Prompt Engine builds mobile-first create & modify prompts and extracts HTML", () => {
  const createPrompt = buildCreatePrompt("A classic Ludo board game with 4 colors and dice roll");
  assert.ok(createPrompt.includes("A classic Ludo board game"));
  assert.ok(createPrompt.includes("mobile"));

  const modifyPrompt = buildModifyPrompt(
    "<!DOCTYPE html><html><body><h1>Old</h1></body></html>",
    "Add a 6-sided animated dice button",
    "Classic Ludo"
  );
  assert.ok(modifyPrompt.includes("Add a 6-sided animated dice button"));
  assert.ok(modifyPrompt.includes("<h1>Old</h1>"));

  const rawResponse = `TITLE: Cyber Ludo 2099
\`\`\`html
<!DOCTYPE html>
<html>
<head><title>Cyber Ludo</title></head>
<body><canvas id="game"></canvas></body>
</html>
\`\`\``;
  const extracted = extractGamePayload(rawResponse, "Fallback Title");
  assert.equal(extracted.title, "Cyber Ludo 2099");
  assert.ok(extracted.html.startsWith("<!DOCTYPE html>"));
  assert.ok(extracted.html.includes('<canvas id="game"></canvas>'));
});

test("targets opencode.ai with the required session header and a stable per-conversation id", async () => {
  let capturedHeaders = null;
  let capturedUrl = "";

  const mockFetch = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = init.headers;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "TITLE: Go Game\n```html\n<!DOCTYPE html><html><body>ok</body></html>\n```" } }],
      }),
    };
  };

  const result = await generateOrModifyGame({
    mode: "create",
    prompt: "a tiny game",
    sessionId: "sess-abc-123",
    settings: {
      provider: "opencode-go",
      baseUrl: "https://opencode.ai/inference/go/openai/v1",
      model: "deepseek-v4.1-flash",
      apiKey: "sk-go",
    },
    fetchImpl: mockFetch,
  });

  assert.equal(capturedUrl, "https://opencode.ai/inference/go/openai/v1/chat/completions");
  assert.equal(capturedHeaders["x-opencode-session"], "sess-abc-123");
  assert.match(capturedHeaders["User-Agent"], /ludo-game-on-demand/);
  assert.equal(capturedHeaders.Authorization, "Bearer sk-go");
  assert.equal(result.title, "Go Game");

  // Local providers must not receive the OpenCode-specific header.
  let localHeaders = null;
  await generateOrModifyGame({
    mode: "create",
    prompt: "a tiny game",
    sessionId: "sess-abc-123",
    settings: { provider: "ollama", baseUrl: "http://localhost:11434/v1", model: "m", apiKey: "" },
    fetchImpl: async (url, init) => {
      localHeaders = init.headers;
      return { ok: true, json: async () => ({ choices: [{ message: { content: "TITLE: T\n```html\n<html>x</html>\n```" } }] }) };
    },
  });
  assert.equal(localHeaders["x-opencode-session"], undefined);
});

test("Prompt Engine supports custom fetch (OpenAI-compatible / Ollama) and offline template mode", async () => {
  // 1. Offline template mode works immediately without network
  const offlineRes = await generateOrModifyGame({
    mode: "create",
    prompt: "Neon space shooter with lasers and asteroids",
    settings: { provider: "template", model: "built-in" },
  });
  assert.ok(offlineRes.title.length > 0);
  assert.ok(offlineRes.html.includes("<!DOCTYPE html>"));
  assert.ok(offlineRes.html.includes("<canvas"));

  // 2. OpenAI-compatible / Ollama provider via injected fetch
  let capturedUrl = "";
  let capturedBody = null;
  const mockFetch = async (url, init) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                "TITLE: Star Blaster\n```html\n<!DOCTYPE html><html><body><canvas id='star'></canvas></body></html>\n```",
            },
          },
        ],
      }),
    };
  };

  const aiRes = await generateOrModifyGame({
    mode: "create",
    prompt: "Make a star blaster game",
    settings: {
      provider: "ollama",
      baseUrl: "http://localhost:11434/v1",
      model: "qwen2.5-coder:7b",
      apiKey: "",
    },
    fetchImpl: mockFetch,
  });

  assert.equal(capturedUrl, "http://localhost:11434/v1/chat/completions");
  assert.equal(capturedBody.model, "qwen2.5-coder:7b");
  assert.equal(aiRes.title, "Star Blaster");
  assert.ok(aiRes.html.includes("id='star'"));
});
