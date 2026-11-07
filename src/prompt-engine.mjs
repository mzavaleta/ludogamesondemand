import { buildLudoHtml } from "./infra/templates/ludo.mjs";
import { buildMemoryHtml } from "./infra/templates/memory.mjs";
import { buildArcadeHtml } from "./infra/templates/arcade.mjs";

// Adapted from BeyondPlay-AI/game-prompt-engine (MIT) and extended for
// mobile-first touch ergonomics, iterative modification, and local AI (Ollama / LM Studio).

export const SYSTEM_PROMPT = `You are an expert HTML5 mobile-first game developer. Your job is to create or modify complete, playable browser games from user descriptions.

RULES:
1. Output a SINGLE, self-contained HTML file with all CSS and JavaScript inline.
2. The game must be immediately playable — no build steps, no external assets, no external CDNs.
3. Include <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"> and prevent accidental pull-to-refresh or page scrolling during touch gameplay (touch-action: none).
4. Use HTML5 Canvas API for 2D rendering or responsive DOM/CSS grid for board/card/puzzle games.
5. Include a clear Start overlay/button, live Score / Turn status HUD, and a Game Over / Winner screen with a "Play Again" button.
6. MOBILE-FIRST CONTROLS: Support BOTH touch controls (tap, swipe, or on-screen virtual buttons) AND keyboard controls (Arrow keys / WASD / Space).
7. Add game feel ("juice"): smooth animations, particle bursts, subtle screen shake, and synthesized sound effects using Web Audio API (unlocked on first user interaction).
8. Keep code clean, bug-free, and resilient to window resizing.

STRUCTURE your response as:
- First line: TITLE: <game title>
- Then the complete HTML file wrapped in \`\`\`html ... \`\`\`

Do NOT include any explanation before or after. Just the TITLE line and the HTML code block.`;

export const PROVIDER_PRESETS = {
  ollama: {
    label: "Ollama (Local)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5-coder:7b",
    requiresKey: false,
  },
  lmstudio: {
    label: "LM Studio (Local)",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    requiresKey: false,
  },
  openai: {
    label: "OpenAI API",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    requiresKey: true,
  },
  openrouter: {
    label: "OpenRouter API",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
    requiresKey: true,
  },
  anthropic: {
    label: "Anthropic Claude API",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-latest",
    requiresKey: true,
  },
  gemini: {
    label: "Google Gemini API",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    requiresKey: true,
  },
  "openai-compatible": {
    label: "Custom OpenAI-Compatible Server",
    baseUrl: "http://localhost:8080/v1",
    defaultModel: "default",
    requiresKey: false,
  },
  "opencode-go": {
    label: "OpenCode Go (subscription)",
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    // Go's catalogue is served outside the OpenAI-compatible prefix.
    modelsUrl: "https://opencode.ai/inference/go/v1/models",
    defaultModel: "deepseek-v4.1-flash",
    requiresKey: true,
  },
  template: {
    label: "Built-in Instant Generator (Offline / No LLM Required)",
    baseUrl: "",
    defaultModel: "built-in-arcade-engine",
    requiresKey: false,
  },
};

/**
 * @param {string} description
 * @returns {string}
 */
export function buildCreatePrompt(description) {
  return `Create a playable, mobile-first HTML5 game based on this request:

"${description.trim()}"

Ensure full touch controls for mobile screens alongside keyboard controls, responsive layout, score/winner tracking, and Web Audio API sound effects. Return TITLE: <name> and the single \`\`\`html ... \`\`\` block.`;
}

/**
 * @param {string} currentHtml
 * @param {string} instruction
 * @param {string} [currentTitle]
 * @returns {string}
 */
export function buildModifyPrompt(currentHtml, instruction, currentTitle = "Game", history = /** @type {any[]} */ ([])) {
  const historyBlock =
    Array.isArray(history) && history.length > 0
      ? `PREVIOUS REQUESTS ON THIS GAME (oldest → newest, already applied; current HTML below reflects them):
${history.map((h, i) => `${i + 1}. "${String(h).trim()}"`).join("\n")}

`
      : "";

  return `Modify the existing HTML5 game ("${currentTitle}").

Preserve working mechanics, mobile-first touch + keyboard controls, and single-file self-contained structure while applying the requested changes.

CURRENT GAME HTML:
\`\`\`html
${currentHtml}
\`\`\`

${historyBlock}USER REQUEST:
"${instruction.trim()}"

Return the updated game with:
First line: TITLE: <updated or existing game title>
Followed by the complete updated HTML wrapped in \`\`\`html ... \`\`\`.`;
}

/**
 * @param {string} raw
 * @param {string} [fallbackTitle]
 * @returns {{ title: string, html: string }}
 */
export function extractGamePayload(raw, fallbackTitle = "Custom HTML5 Game") {
  if (!raw || typeof raw !== "string") {
    throw new Error("Empty response from AI provider.");
  }

  const titleMatch = raw.match(/^TITLE:\s*(.+)$/im);
  let title = titleMatch ? titleMatch[1].trim().replace(/^["']|["']$/g, "") : "";

  let html = "";
  const fenceMatch = raw.match(/```html\s*\n([\s\S]*?)```/i) || raw.match(/```\s*\n(<!DOCTYPE[\s\S]*?)```/i);
  if (fenceMatch) {
    html = fenceMatch[1].trim();
  } else {
    const rawHtmlMatch = raw.match(/<(!DOCTYPE|html)[\s\S]*<\/html>/i);
    if (rawHtmlMatch) {
      html = rawHtmlMatch[0].trim();
    }
  }

  if (!html) {
    throw new Error("Could not extract valid HTML5 game code from AI response.");
  }

  if (!title) {
    const htmlTitleMatch = html.match(/<title>([^<]+)<\/title>/i);
    title = htmlTitleMatch ? htmlTitleMatch[1].trim() : fallbackTitle;
  }

  return { title, html };
}

/**
 * @param {string} promptText
 * @param {string} [existingTitle]
 * @returns {{ title: string, html: string }}
 */
export function buildDynamicTemplateGame(promptText, existingTitle = "") {
  const lower = promptText.toLowerCase();
  const isLudo = lower.includes("ludo") || lower.includes("board") || lower.includes("dice") || lower.includes("parchis");
  const isMemory = lower.includes("memory") || lower.includes("card") || lower.includes("match") || lower.includes("puzzle");
  const isPong = lower.includes("pong") || lower.includes("brick") || lower.includes("breakout") || lower.includes("paddle");

  // Extract custom accent color or theme cues from prompt
  const isCyber = lower.includes("neon") || lower.includes("cyber") || lower.includes("space") || lower.includes("laser");
  const isFast = lower.includes("fast") || lower.includes("turbo") || lower.includes("hard") || lower.includes("speed");
  const speedMultiplier = isFast ? 1.45 : 1.0;
  const accent = isCyber ? "#00f5d4" : "#f59e0b";
  const bg = isCyber ? "#090d16" : "#0f172a";

  if (isLudo) {
    const title = existingTitle || "Ludo Blitz Royal";
    return {
      title,
      html: buildLudoHtml({ title, promptText, accent, bg }),
    };
  }

  if (isMemory) {
    const title = existingTitle || "Neon Memory Match";
    return {
      title,
      html: buildMemoryHtml({ title, promptText, accent, bg }),
    };
  }

  const title =
    existingTitle ||
    (isPong
      ? "Cyber Breaker Arcade"
      : promptText
          .trim()
          .split(/\s+/)
          .slice(0, 4)
          .map((w) => String(w).charAt(0).toUpperCase() + String(w).slice(1).toLowerCase())
          .join(" ") || "Star Dodger Deluxe");

  return {
    title,
    html: buildArcadeHtml({ title, promptText, accent, bg, speedMultiplier }),
  };
}

/**
 * Removes anything that looks like a credential from free-form text (provider error bodies, logs).
 * Applied at the point where the secret is still in scope, so every downstream surface is clean.
 */
/**
 * @param {string} text
 * @param {string} [apiKey]
 * @returns {string}
 */
export function redactSecrets(text, apiKey = "") {
  let out = String(text ?? "");
  if (apiKey) out = out.split(String(apiKey)).join("***");
  out = out.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***");
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1***");
  out = out.replace(/(x-api-key["'\s:=]+)[A-Za-z0-9._-]{8,}/gi, "$1***");
  out = out.replace(/(api[_-]?key["'\s:=]+)[A-Za-z0-9._-]{8,}/gi, "$1***");
  return out.slice(0, 200);
}

/**
 * @param {{
 *   mode?: string,
 *   prompt: string,
 *   currentHtml?: string,
 *   currentTitle?: string,
 *   history?: any[],
 *   settings?: any,
 *   sessionId?: string,
 *   fetchImpl?: any,
 * }} opts
 * @returns {Promise<{ title: string, html: string }>}
 */
export async function generateOrModifyGame({
  mode = "create",
  prompt,
  currentHtml = "",
  currentTitle = "",
  history = [],
  settings = {},
  sessionId = "",
  fetchImpl = globalThis.fetch,
}) {
  if (!prompt || !prompt.trim()) {
    throw new Error("Prompt is required.");
  }

  const provider = settings.provider || "ollama";
  const isModify = mode === "modify" && !!currentHtml;
  const temperature = isModify ? 0.2 : 0.6;
  const maxTokens = settings.maxTokens || (isModify ? 16384 : 8192);

  if (provider === "template") {
    return buildDynamicTemplateGame(prompt, mode === "modify" ? currentTitle : "");
  }

  const preset = PROVIDER_PRESETS[/** @type {keyof typeof PROVIDER_PRESETS} */ (provider)] || PROVIDER_PRESETS["openai-compatible"];
  const baseUrl = (settings.baseUrl || preset.baseUrl || "http://localhost:11434/v1").replace(/\/+$/, "");
  const model = settings.model || preset.defaultModel || "qwen2.5-coder:7b";
  const apiKey = settings.apiKey || "";

  const userMessage =
    mode === "modify" && currentHtml
      ? buildModifyPrompt(currentHtml, prompt, currentTitle, history)
      : buildCreatePrompt(prompt);

  /**
   * Identifies this client and, for OpenCode hosts, attaches the routing session id Go requires.
   * Sending it elsewhere would be noise, so it is scoped to opencode.ai.
   */
  /** @type {any} */
  const baseHeaders = { "User-Agent": "ludo-game-on-demand/1.0" };
  if (sessionId && baseUrl.includes("opencode.ai")) {
    baseHeaders["x-opencode-session"] = sessionId;
  }

  if (provider === "anthropic") {
    if (!apiKey) {
      throw new Error("Anthropic API key is required in AI Settings (or switch provider to Ollama / Built-in Generator).");
    }
    /** @type {any} */
    let anthropicContent = userMessage;
    if (isModify) {
      const marker = "USER REQUEST:";
      const idx = userMessage.indexOf(marker);
      if (idx > 0) {
        anthropicContent = [
          { type: "text", text: userMessage.slice(0, idx).trim(), cache_control: { type: "ephemeral" } },
          { type: "text", text: userMessage.slice(idx).trim() },
        ];
      }
    }

    const res = await fetchImpl(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: anthropicContent }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${redactSecrets(errText, apiKey)}`);
    }
    const data = await res.json();
    const rawText = data?.content?.[0]?.text || "";
    return extractGamePayload(rawText, currentTitle || "AI Game");
  }

  // OpenAI-compatible chat completions (Ollama, LM Studio, OpenAI, OpenRouter, Gemini OpenAI endpoint, Custom)
  const headers = { ...baseHeaders, "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const endpoint = `${baseUrl}/chat/completions`;
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI Provider (${provider}) error ${res.status}: ${redactSecrets(errText, apiKey)}`);
  }

  const data = await res.json();
  const rawText = data?.choices?.[0]?.message?.content || "";
  return extractGamePayload(rawText, currentTitle || "AI Game");
}

export { buildLudoHtml, buildMemoryHtml, buildArcadeHtml };
