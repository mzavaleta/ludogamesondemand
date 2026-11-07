/** @param {any} str @returns {string} */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {any} opts @returns {string} */
export function buildLudoHtml({ title, promptText, accent, bg }) {
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
