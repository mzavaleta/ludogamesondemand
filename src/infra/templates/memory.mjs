/** @param {any} str @returns {string} */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {any} opts @returns {string} */
export function buildMemoryHtml({ title, promptText, accent, bg }) {
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
