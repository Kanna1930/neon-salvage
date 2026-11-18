// Neon Salvage — the heads-up display.
// One job: show the player how the run is going: score, combo, hull,
// wave, salvage count and active power-up timers.

import { CONFIG } from './config.js';

function drawHeart(ctx, x, y, size, filled, color) {
  ctx.save();
  ctx.translate(x, y);
  if (filled) {
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = gradient;
    ctx.fillRect(-size * 2, -size * 2, size * 4, size * 4);
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.moveTo(0, size * 0.35);
  ctx.bezierCurveTo(-size, -size * 0.45, -size * 0.45, -size, 0, -size * 0.35);
  ctx.bezierCurveTo(size * 0.45, -size, size, -size * 0.45, 0, size * 0.35);
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(143, 163, 200, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawHud(ctx, world, muted) {
  const P = CONFIG.palette;
  const { width } = CONFIG;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Score, top left.
  ctx.textAlign = 'left';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText('SCORE', 20, 28);
  ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.text;
  ctx.fillText(world.score.toLocaleString('en-US'), 20, 58);

  // Combo multiplier under the score.
  const multiplier = Math.max(1, world.combo);
  if (world.combo > 1) {
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = multiplier >= 5 ? P.overdrive : P.core;
    ctx.fillText(`COMBO x${multiplier}`, 20, 86);
    const fraction = Math.max(0, world.comboTimer / CONFIG.combo.windowSeconds);
    ctx.fillStyle = 'rgba(143, 163, 200, 0.35)';
    ctx.fillRect(20, 94, 110, 5);
    ctx.fillStyle = multiplier >= 5 ? P.overdrive : P.core;
    ctx.fillRect(20, 94, 110 * fraction, 5);
  }

  // Wave, top center.
  ctx.textAlign = 'center';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText('WAVE', width / 2, 28);
  ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.text;
  ctx.fillText(String(world.wave), width / 2, 58);

  // Salvage count, top right.
  ctx.textAlign = 'right';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText('SALVAGE', width - 20, 28);
  ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.core;
  ctx.fillText(`◆ ${world.salvage}`, width - 20, 58);

  // Hull hearts, top right under salvage.
  for (let i = 0; i < CONFIG.hullMax; i++) {
    drawHeart(ctx, width - 34 - i * 30, 88, 11, i < world.hull, P.hull);
  }

  // Active power-ups, bottom left.
  let py = CONFIG.height - 24;
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
  if (world.ship.shield) {
    ctx.fillStyle = P.shield;
    ctx.fillText('◈ SHIELD', 20, py);
    py -= 22;
  }
  if (world.ship.magnet > 0) {
    ctx.fillStyle = P.magnet;
    ctx.fillText(`◉ MAGNET ${Math.ceil(world.ship.magnet)}s`, 20, py);
    py -= 22;
  }
  if (world.ship.overdrive > 0) {
    ctx.fillStyle = P.overdrive;
    ctx.fillText(`⚡ OVERDRIVE ${Math.ceil(world.ship.overdrive)}s`, 20, py);
  }

  // Sound state, bottom right.
  ctx.textAlign = 'right';
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText(muted ? 'SOUND OFF  (M)' : 'SOUND ON  (M)', width - 20, CONFIG.height - 20);

  ctx.restore();
}
