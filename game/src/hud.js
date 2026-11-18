// Neon Salvage — the heads-up display.
// One job: show the player how the run is going: score, combo, hull,
// wave, salvage count, the coin balance and income rate, the automation
// they own, their skill levels, the boss HP bar, active power-up timers,
// and the SHOP button that opens the store.

import { CONFIG } from './config.js';
import { passiveIncome, incomeRate, SHOP_AUTO, SHOP_SKILLS } from './shop.js';
import { shopButtonRect } from './shop.js';

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
  const { width, height } = CONFIG;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Score, top left.
  ctx.textAlign = 'left';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText('SCORE', 20, 40);
  ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.text;
  ctx.fillText(world.score.toLocaleString('en-US'), 20, 70);

  // Combo multiplier under the score.
  const multiplier = Math.max(1, world.combo);
  if (world.combo > 1) {
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = multiplier >= 5 ? P.overdrive : P.core;
    ctx.fillText(`COMBO x${multiplier}`, 20, 98);
    const fraction = Math.max(0, world.comboTimer / CONFIG.combo.windowSeconds);
    ctx.fillStyle = 'rgba(143, 163, 200, 0.35)';
    ctx.fillRect(20, 106, 110, 5);
    ctx.fillStyle = multiplier >= 5 ? P.overdrive : P.core;
    ctx.fillRect(20, 106, 110 * fraction, 5);
  }

  // Wave, top center.
  ctx.textAlign = 'center';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText('WAVE', width / 2, 40);
  ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.text;
  ctx.fillText(String(world.wave), width / 2, 70);

  // Boss HP bar under the wave number.
  if (world.boss) {
    const boss = world.boss;
    const barW = 240;
    const barX = width / 2 - barW / 2;
    const barY = 78;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = CONFIG.boss.color;
    ctx.fillText('BOSS', width / 2, barY + 9);
    ctx.fillStyle = 'rgba(143, 163, 200, 0.3)';
    ctx.fillRect(barX, barY + 14, barW, 9);
    ctx.fillStyle = CONFIG.boss.color;
    ctx.fillRect(barX, barY + 14, barW * Math.max(0, boss.hp / boss.maxHp), 9);
    ctx.strokeStyle = 'rgba(255, 61, 94, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY + 14, barW, 9);
  }

  // Coins, top right: balance, income rate, salvage count.
  ctx.textAlign = 'right';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText('COINS', width - 20, 40);
  ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.coin;
  ctx.fillText(`◉ ${Math.floor(world.coins).toLocaleString('en-US')}`, width - 20, 70);
  const rate = incomeRate(world);
  const passive = passiveIncome(world);
  ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.coin;
  ctx.fillText(`+${rate.toFixed(1)} / sec`, width - 20, 94);
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText(`passive ${passive} / sec   ◆ ${world.salvage} cores`, width - 20, 114);

  // Hull hearts, top right under the coins (grows with the hull skill).
  for (let i = 0; i < world.hullMax; i++) {
    drawHeart(ctx, width - 34 - i * 30, 138, 11, i < world.hull, P.hull);
  }

  // Automation owned, bottom left: one chip per kind, icon + count.
  let chipX = 20;
  const chipY = height - 52;
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
  for (const spec of SHOP_AUTO) {
    const count = world.auto[spec.id] || 0;
    if (count === 0) continue;
    const label = `${spec.icon} ${count}`;
    const w = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(10, 16, 48, 0.75)';
    ctx.beginPath();
    ctx.roundRect(chipX, chipY - 15, w, 22, 6);
    ctx.fill();
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = spec.color;
    ctx.fillText(label, chipX + 8, chipY + 1);
    chipX += w + 8;
  }

  // Owned skills, bottom left above the automation chips.
  const owned = Object.keys(world.skills).sort();
  let skillX = 20;
  const skillY = height - 80;
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
  for (const id of owned) {
    const spec = SHOP_SKILLS.find((s) => s.id === id);
    const level = world.skills[id];
    const label = spec ? `${spec.icon} ${level}` : `${id} ${level}`;
    const w = ctx.measureText(label).width + 14;
    ctx.fillStyle = 'rgba(10, 16, 48, 0.6)';
    ctx.beginPath();
    ctx.roundRect(skillX, skillY - 14, w, 20, 5);
    ctx.fill();
    ctx.fillStyle = spec ? spec.color : P.dim;
    ctx.fillText(label, skillX + 7, skillY + 1);
    skillX += w + 6;
  }

  // Active power-ups, bottom left above the skills.
  let py = height - 104;
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

  // SHOP button, bottom right.
  const btn = shopButtonRect();
  ctx.fillStyle = 'rgba(255, 217, 77, 0.16)';
  ctx.beginPath();
  ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 8);
  ctx.fill();
  ctx.strokeStyle = P.coin;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.coin;
  ctx.fillText('SHOP  [B]', btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
  ctx.textBaseline = 'alphabetic';

  // Sound state, bottom right above the shop button.
  ctx.textAlign = 'right';
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText(muted ? 'SOUND OFF  (M)' : 'SOUND ON  (M)', width - 20, height - 62);

  ctx.restore();
}
