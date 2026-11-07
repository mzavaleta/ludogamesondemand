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

/** @param {any} str @returns {string} */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ title: string, promptText: string, accent: string, bg: string }} opts
 * @returns {string}
 */
function buildLudoHtml({ title, promptText, accent, bg }) {
  const safeTitle = escapeHtml(title);
  const safePrompt = escapeHtml(promptText);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
  body {
    margin: 0; min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: space-between; padding: 12px;
    background: ${bg}; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;
  }
  header { text-align: center; width: 100%; max-width: 440px; }
  h1 { margin: 2px 0; font-size: 1.25rem; color: ${accent}; }
  .sub { font-size: 0.78rem; color: #94a3b8; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hud {
    display: flex; justify-content: space-between; align-items: center;
    background: #1e293b; padding: 8px 12px; border-radius: 12px; width: 100%; max-width: 440px;
    font-size: 0.88rem; border: 1px solid #334155;
  }
  canvas {
    width: min(92vw, 390px); height: min(92vw, 390px);
    background: #0f172a; border-radius: 16px; border: 2px solid #334155;
    box-shadow: 0 12px 30px rgba(0,0,0,0.45);
  }
  .controls {
    display: flex; gap: 10px; width: 100%; max-width: 440px; justify-content: center; padding-bottom: 4px;
  }
  button {
    flex: 1; padding: 14px 16px; font-size: 1rem; font-weight: 700; border: none;
    border-radius: 12px; cursor: pointer; background: ${accent}; color: #090d16;
    box-shadow: 0 4px 14px rgba(0,0,0,0.3); transition: transform 0.1s;
  }
  button:active { transform: scale(0.96); }
  button.secondary { flex: 0.45; background: #334155; color: #f8fafc; }
</style>
</head>
<body>
  <header>
    <h1>${safeTitle}</h1>
    <div class="sub" title="${safePrompt}">Prompt: ${safePrompt}</div>
    <div class="hud">
      <span id="turnLabel">Turn: Red (You)</span>
      <span id="diceLabel">Dice: -</span>
      <span id="statusLabel">Tap Roll!</span>
    </div>
  </header>
  <canvas id="board" width="390" height="390" tabindex="0"></canvas>
  <div class="controls">
    <button id="rollBtn">🎲 Roll Dice (Space)</button>
    <button id="resetBtn" class="secondary">↻ Reset</button>
  </div>
<script>
(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const turnLabel = document.getElementById('turnLabel');
  const diceLabel = document.getElementById('diceLabel');
  const statusLabel = document.getElementById('statusLabel');
  const rollBtn = document.getElementById('rollBtn');
  const resetBtn = document.getElementById('resetBtn');

  const COLORS = [
    { name: 'Red (You)', hex: '#ef4444', light: '#fca5a5', startIdx: 0, ai: false },
    { name: 'Green (AI)', hex: '#22c55e', light: '#86efac', startIdx: 7, ai: true },
    { name: 'Yellow (AI)', hex: '#eab308', light: '#fde047', startIdx: 14, ai: true },
    { name: 'Blue (AI)', hex: '#3b82f6', light: '#93c5fd', startIdx: 21, ai: true }
  ];

  // 28-tile perimeter track around the board
  const track = [];
  const margin = 42, size = 390 - margin * 2, steps = 7;
  const step = size / steps;
  for (let i = 0; i < steps; i++) track.push({ x: margin + i * step, y: margin });
  for (let i = 0; i < steps; i++) track.push({ x: margin + size, y: margin + i * step });
  for (let i = 0; i < steps; i++) track.push({ x: margin + size - i * step, y: margin + size });
  for (let i = 0; i < steps; i++) track.push({ x: margin, y: margin + size - i * step });

  let state;
  function initGame() {
    state = {
      turn: 0,
      dice: null,
      winner: null,
      tokens: COLORS.map(() => [
        { steps: 0 }, // 0 = base, 1..28 = on track, 29 = home goal
        { steps: 0 }
      ])
    };
    updateHud('Tap Roll Dice to start!');
    draw();
  }

  let sharedAudioCtx = null;
  function beep(freq = 440, dur = 0.08) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
      if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain); gain.connect(sharedAudioCtx.destination);
      osc.start(); osc.stop(sharedAudioCtx.currentTime + dur);
    } catch {}
  }

  function updateHud(msg) {
    const p = COLORS[state.turn];
    turnLabel.textContent = 'Turn: ' + p.name;
    turnLabel.style.color = p.light;
    diceLabel.textContent = 'Dice: ' + (state.dice || '-');
    statusLabel.textContent = msg;
  }

  function getTokenCoords(pIdx, tIdx) {
    const tok = state.tokens[pIdx][tIdx];
    const baseOffsets = [
      { x: 105, y: 105 },
      { x: 285, y: 105 },
      { x: 285, y: 285 },
      { x: 105, y: 285 }
    ];
    if (tok.steps === 0) {
      return { x: baseOffsets[pIdx].x + (tIdx === 0 ? -16 : 16), y: baseOffsets[pIdx].y };
    }
    if (tok.steps >= 29) {
      return { x: 195 + (pIdx - 1.5) * 18, y: 195 + (tIdx === 0 ? -12 : 12) };
    }
    const trackIdx = (COLORS[pIdx].startIdx + tok.steps - 1) % track.length;
    return track[trackIdx];
  }

  function canMoveToken(pIdx, tIdx, dice) {
    const tok = state.tokens[pIdx][tIdx];
    if (tok.steps >= 29) return false;
    // Allow exiting home base on even rolls (2, 4, 6) or 1 so early turns are immediately interactive
    if (tok.steps === 0) return dice === 6 || dice === 1 || dice === 4 || dice === 2;
    return tok.steps + dice <= 29;
  }

  function moveToken(pIdx, tIdx) {
    const tok = state.tokens[pIdx][tIdx];
    const dice = state.dice;
    if (!canMoveToken(pIdx, tIdx, dice)) return false;

    tok.steps = tok.steps === 0 ? 1 : tok.steps + dice;
    beep(620, 0.1);

    // Check captures on perimeter track
    if (tok.steps >= 1 && tok.steps < 29) {
      const myGlobal = (COLORS[pIdx].startIdx + tok.steps - 1) % track.length;
      state.tokens.forEach((pTokens, otherP) => {
        if (otherP === pIdx) return;
        pTokens.forEach((otherTok) => {
          if (otherTok.steps >= 1 && otherTok.steps < 29) {
            const otherGlobal = (COLORS[otherP].startIdx + otherTok.steps - 1) % track.length;
            if (otherGlobal === myGlobal) {
              otherTok.steps = 0;
              beep(220, 0.18);
            }
          }
        });
      });
    }

    if (state.tokens[pIdx].every((t) => t.steps >= 29)) {
      state.winner = COLORS[pIdx].name;
      updateHud('🏆 ' + state.winner + ' Wins!');
      draw();
      return true;
    }

    const extraTurn = dice === 6;
    state.dice = null;
    if (!extraTurn) {
      state.turn = (state.turn + 1) % 4;
    }
    draw();
    if (COLORS[state.turn].ai && !state.winner) {
      updateHud('AI thinking...');
      setTimeout(runAiTurn, 420);
    } else {
      updateHud(extraTurn ? 'Rolled 6! Roll again!' : 'Your turn — Roll!');
    }
    return true;
  }

  function rollDice() {
    if (state.winner || state.dice !== null) return;
    state.dice = Math.floor(Math.random() * 6) + 1;
    beep(480, 0.07);
    const pIdx = state.turn;
    const valid = [0, 1].filter((tIdx) => canMoveToken(pIdx, tIdx, state.dice));
    draw();

    if (valid.length === 0) {
      updateHud('No legal move (' + state.dice + ')');
      setTimeout(() => {
        state.dice = null;
        state.turn = (state.turn + 1) % 4;
        draw();
        if (COLORS[state.turn].ai && !state.winner) {
          setTimeout(runAiTurn, 380);
        } else {
          updateHud('Your turn — Roll!');
        }
      }, 650);
      return;
    }

    if (COLORS[pIdx].ai || valid.length === 1) {
      setTimeout(() => moveToken(pIdx, valid[0]), 350);
    } else {
      updateHud('Tap a Red token to move!');
    }
  }

  function runAiTurn() {
    if (state.winner || !COLORS[state.turn].ai) return;
    rollDice();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (state.winner) { initGame(); return; }
    if (state.turn !== 0 || state.dice === null) {
      rollDice();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    for (let tIdx = 0; tIdx < 2; tIdx++) {
      const pos = getTokenCoords(0, tIdx);
      if (Math.hypot(x - pos.x, y - pos.y) < 26 && canMoveToken(0, tIdx, state.dice)) {
        moveToken(0, tIdx);
        return;
      }
    }
  });

  rollBtn.addEventListener('click', () => {
    if (!COLORS[state.turn].ai) rollDice();
  });
  resetBtn.addEventListener('click', initGame);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !COLORS[state.turn].ai) {
      e.preventDefault();
      rollDice();
    }
  });

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Center goal diamond
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(195, 195, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HOME', 195, 199);

    // Draw perimeter track
    track.forEach((pt, idx) => {
      const startOwner = COLORS.find((c) => c.startIdx === idx);
      ctx.fillStyle = startOwner ? startOwner.hex : '#1e293b';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Draw player bases
    const bases = [
      { x: 105, y: 105 },
      { x: 285, y: 105 },
      { x: 285, y: 285 },
      { x: 105, y: 285 }
    ];
    bases.forEach((b, pIdx) => {
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = COLORS[pIdx].hex;
      ctx.lineWidth = state.turn === pIdx ? 4 : 2;
      ctx.fillRect(b.x - 38, b.y - 26, 76, 52);
      ctx.strokeRect(b.x - 38, b.y - 26, 76, 52);
    });

    // Draw tokens
    state.tokens.forEach((pTokens, pIdx) => {
      pTokens.forEach((tok, tIdx) => {
        const pos = getTokenCoords(pIdx, tIdx);
        ctx.fillStyle = COLORS[pIdx].hex;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      });
    });
  }

  initGame();
})();
</script>
</body>
</html>`;
}

/**
 * @param {{ title: string, promptText: string, accent: string, bg: string }} opts
 * @returns {string}
 */
function buildMemoryHtml({ title, promptText, accent, bg }) {
  const safeTitle = escapeHtml(title);
  const safePrompt = escapeHtml(promptText);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; user-select: none; touch-action: manipulation; }
  body {
    margin: 0; min-height: 100vh; background: ${bg}; color: #f8fafc;
    font-family: system-ui, sans-serif; display: flex; flex-direction: column;
    align-items: center; justify-content: center; padding: 14px; gap: 12px;
  }
  h1 { margin: 0; font-size: 1.35rem; color: ${accent}; }
  .hud { display: flex; gap: 18px; font-size: 0.95rem; background: #1e293b; padding: 8px 16px; border-radius: 999px; }
  .grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    width: min(92vw, 360px); height: min(92vw, 360px);
  }
  .card {
    background: #1e293b; border: 2px solid #334155; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 2rem; cursor: pointer; transition: transform 0.15s, background 0.15s;
  }
  .card.revealed, .card.matched { background: #334155; border-color: ${accent}; transform: scale(1.03); }
  button {
    padding: 12px 24px; border-radius: 12px; border: none;
    background: ${accent}; color: #090d16; font-weight: 700; font-size: 1rem; cursor: pointer;
  }
</style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <div style="font-size:0.78rem;color:#94a3b8;max-width:340px;text-align:center;">${safePrompt}</div>
  <div class="hud">
    <span id="moves">Moves: 0</span>
    <span id="pairs">Pairs: 0 / 8</span>
  </div>
  <div class="grid" id="grid"></div>
  <button id="restartBtn">↻ Play Again</button>
<script>
(() => {
  const icons = ['🚀','👾','⚡','💎','🔥','🌟','🎲','🎯'];
  const grid = document.getElementById('grid');
  const movesEl = document.getElementById('moves');
  const pairsEl = document.getElementById('pairs');
  let deck = [], open = [], moves = 0, matched = 0, locked = false;

  function start() {
    deck = [...icons, ...icons].sort(() => Math.random() - 0.5).map((icon, id) => ({ id, icon, matched: false }));
    open = []; moves = 0; matched = 0; locked = false;
    render();
  }

  function render() {
    movesEl.textContent = 'Moves: ' + moves;
    pairsEl.textContent = 'Pairs: ' + matched + ' / 8';
    grid.innerHTML = '';
    deck.forEach((c, idx) => {
      const btn = document.createElement('div');
      const isOpen = open.includes(idx) || c.matched;
      btn.className = 'card' + (isOpen ? ' revealed' : '');
      btn.textContent = isOpen ? c.icon : '❓';
      btn.onclick = () => flip(idx);
      grid.appendChild(btn);
    });
  }

  function flip(idx) {
    if (locked || open.includes(idx) || deck[idx].matched) return;
    open.push(idx);
    render();
    if (open.length === 2) {
      moves++;
      locked = true;
      const [a, b] = open;
      if (deck[a].icon === deck[b].icon) {
        deck[a].matched = deck[b].matched = true;
        matched++;
        open = [];
        locked = false;
        render();
      } else {
        setTimeout(() => { open = []; locked = false; render(); }, 600);
      }
    }
  }

  document.getElementById('restartBtn').onclick = start;
  start();
})();
</script>
</body>
</html>`;
}

/**
 * @param {{ title: string, promptText: string, accent: string, bg: string, speedMultiplier?: number }} opts
 * @returns {string}
 */
function buildArcadeHtml({ title, promptText, accent, bg, speedMultiplier = 1.0 }) {
  const safeTitle = escapeHtml(title);
  const safePrompt = escapeHtml(promptText);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; user-select: none; -webkit-user-select: none; touch-action: none; }
  body {
    margin: 0; height: 100vh; background: ${bg}; color: #f8fafc;
    font-family: system-ui, -apple-system, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    padding: 10px; overflow: hidden;
  }
  .top { width: 100%; max-width: 420px; display: flex; justify-content: space-between; align-items: center; }
  .title { font-weight: 800; color: ${accent}; font-size: 1.05rem; }
  .score { background: #1e293b; padding: 6px 12px; border-radius: 999px; font-size: 0.88rem; }
  canvas {
    width: min(94vw, 400px); height: min(68vh, 480px);
    background: #050811; border: 2px solid #334155; border-radius: 16px;
  }
  .touch-bar {
    width: 100%; max-width: 420px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;
  }
  button {
    padding: 14px; border-radius: 12px; border: 1px solid #334155;
    background: #1e293b; color: #f8fafc; font-size: 1rem; font-weight: 700; cursor: pointer;
  }
  button.fire { background: ${accent}; color: #090d16; border: none; }
</style>
</head>
<body>
  <div class="top">
    <span class="title">${safeTitle}</span>
    <span class="score" id="scoreEl">Score: 0 | Best: 0</span>
  </div>
  <canvas id="game" width="360" height="440" tabindex="0"></canvas>
  <div class="touch-bar">
    <button id="leftBtn">◀ Left</button>
    <button id="fireBtn" class="fire">⚡ Pulse / Restart</button>
    <button id="rightBtn">Right ▶</button>
  </div>
<script>
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('scoreEl');
  const speedScale = ${Number(speedMultiplier).toFixed(2)};

  let player = { x: 180, y: 390, vx: 0 };
  let stars = [], hazards = [], pulses = [], score = 0, best = 0, over = false;
  let holdLeft = false, holdRight = false;

  function reset() {
    player = { x: 180, y: 390 };
    stars = []; hazards = []; pulses = []; score = 0; over = false;
  }

  function fire() {
    if (over) { reset(); return; }
    pulses.push({ x: player.x, y: player.y - 16, r: 6 });
  }

  const bindHold = (btn, dir) => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (dir < 0) holdLeft = true; else holdRight = true; });
    btn.addEventListener('pointerup', () => { if (dir < 0) holdLeft = false; else holdRight = false; });
    btn.addEventListener('pointerleave', () => { if (dir < 0) holdLeft = false; else holdRight = false; });
  };
  bindHold(document.getElementById('leftBtn'), -1);
  bindHold(document.getElementById('rightBtn'), 1);
  document.getElementById('fireBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); fire(); });

  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons > 0 || e.pointerType === 'touch') {
      const rect = canvas.getBoundingClientRect();
      player.x = Math.max(20, Math.min(340, ((e.clientX - rect.left) / rect.width) * canvas.width));
    }
  });
  canvas.addEventListener('pointerdown', () => { if (over) reset(); });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') holdLeft = true;
    if (e.key === 'ArrowRight' || e.key === 'd') holdRight = true;
    if (e.key === ' ' || e.key === 'Enter') fire();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') holdLeft = false;
    if (e.key === 'ArrowRight' || e.key === 'd') holdRight = false;
  });

  function step() {
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!over) {
      if (holdLeft) player.x = Math.max(20, player.x - 5 * speedScale);
      if (holdRight) player.x = Math.min(340, player.x + 5 * speedScale);

      if (Math.random() < 0.06 * speedScale) {
        hazards.push({ x: 20 + Math.random() * 320, y: -15, vy: (2.2 + Math.random() * 2.2) * speedScale, r: 12 });
      }
      if (Math.random() < 0.045) {
        stars.push({ x: 20 + Math.random() * 320, y: -15, vy: 2.3 * speedScale, r: 9 });
      }

      pulses.forEach((p) => { p.y -= 7; });
      pulses = pulses.filter((p) => p.y > -20);

      hazards.forEach((h) => {
        h.y += h.vy;
        if (Math.hypot(h.x - player.x, h.y - player.y) < h.r + 14) {
          over = true;
          best = Math.max(best, score);
        }
        pulses.forEach((p) => {
          if (Math.hypot(h.x - p.x, h.y - p.y) < h.r + p.r) {
            h.y = 999; p.y = -99; score += 15;
          }
        });
      });
      hazards = hazards.filter((h) => h.y < 470);

      stars.forEach((s) => {
        s.y += s.vy;
        if (Math.hypot(s.x - player.x, s.y - player.y) < s.r + 15) {
          score += 10; s.y = 999;
        }
      });
      stars = stars.filter((s) => s.y < 470);
      best = Math.max(best, score);
      scoreEl.textContent = 'Score: ' + score + ' | Best: ' + best;
    }

    // Draw player
    ctx.fillStyle = '${accent}';
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - 16);
    ctx.lineTo(player.x - 15, player.y + 14);
    ctx.lineTo(player.x + 15, player.y + 14);
    ctx.closePath();
    ctx.fill();

    // Draw pulses
    ctx.fillStyle = '#38bdf8';
    pulses.forEach((p) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    });

    // Draw stars
    ctx.fillStyle = '#facc15';
    stars.forEach((s) => {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });

    // Draw hazards
    ctx.fillStyle = '#f43f5e';
    hazards.forEach((h) => {
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
    });

    if (over) {
      ctx.fillStyle = 'rgba(9,13,22,0.82)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('GAME OVER', 180, 195);
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '${accent}';
      ctx.fillText('Score: ' + score + ' — Tap or Press Pulse to Play Again', 180, 230);
    }

    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
})();
</script>
</body>
</html>`;
}
