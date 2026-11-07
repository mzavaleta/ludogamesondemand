/** @param {any} str @returns {string} */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {any} opts @returns {string} */
export function buildArcadeHtml({ title, promptText, accent, bg, speedMultiplier = 1.0 }) {
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
