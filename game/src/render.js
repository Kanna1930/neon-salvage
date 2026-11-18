// Neon Salvage — canvas rendering.
// One job: draw the world the simulation owns. Every shape is a vector
// drawn with canvas paths and radial-gradient halos; there are no image
// assets and no shadowBlur anywhere, so the game stays fast even on a
// software rasterizer. Screens (title, game over) and the HUD live here
// and in hud.js.

import { CONFIG } from './config.js';

const TAU = Math.PI * 2;

// A soft radial halo behind a glowing shape. The gradient is painted once
// per colour into a small offscreen sprite and blitted from then on: far
// cheaper than a fresh gradient (or shadowBlur) every frame.
const haloSprites = new Map();

function haloSprite(color) {
  let sprite = haloSprites.get(color);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = 128;
    sprite.height = 128;
    const sctx = sprite.getContext('2d');
    const gradient = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sctx.fillStyle = gradient;
    sctx.fillRect(0, 0, 128, 128);
    haloSprites.set(color, sprite);
  }
  return sprite;
}

function halo(ctx, x, y, radius, color, alpha = 0.55) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(haloSprite(color), x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

// Glowing text without shadowBlur: the text drawn four times, offset by a
// pixel in the glow colour, then once in its own colour.
function glowText(ctx, text, x, y, font, color, glowColor, alpha = 0.6) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = glowColor;
  ctx.globalAlpha = alpha;
  ctx.fillText(text, x - 1, y - 1);
  ctx.fillText(text, x + 1, y - 1);
  ctx.fillText(text, x - 1, y + 1);
  ctx.fillText(text, x + 1, y + 1);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function centerText(ctx, text, y, font, color) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, CONFIG.width / 2, y);
  ctx.restore();
}

// The gradient sky and nebula blooms never change, so they are painted
// once into an offscreen layer and blitted each frame.
let backgroundLayerCache = null;

function backgroundLayer() {
  if (backgroundLayerCache) return backgroundLayerCache;
  const { width, height } = CONFIG;
  const P = CONFIG.palette;
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const lctx = layer.getContext('2d');
  const gradient = lctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, P.bgDeep);
  gradient.addColorStop(0.55, P.bgMid);
  gradient.addColorStop(1, P.bgGlow);
  lctx.fillStyle = gradient;
  lctx.fillRect(0, 0, width, height);

  // Three soft nebula blooms, fixed in the field so the backdrop is stable.
  const blooms = [
    { x: width * 0.22, y: height * 0.3, r: 260, color: 'rgba(88, 40, 180, 0.20)' },
    { x: width * 0.78, y: height * 0.62, r: 300, color: 'rgba(20, 90, 160, 0.18)' },
    { x: width * 0.55, y: height * 0.12, r: 200, color: 'rgba(255, 61, 242, 0.08)' },
  ];
  for (const bloom of blooms) {
    const radial = lctx.createRadialGradient(bloom.x, bloom.y, 0, bloom.x, bloom.y, bloom.r);
    radial.addColorStop(0, bloom.color);
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lctx.fillStyle = radial;
    lctx.fillRect(bloom.x - bloom.r, bloom.y - bloom.r, bloom.r * 2, bloom.r * 2);
  }
  backgroundLayerCache = layer;
  return layer;
}

export function drawBackground(ctx, world) {
  const { width, height } = CONFIG;
  ctx.drawImage(backgroundLayer(), 0, 0, width, height);

  // Parallax starfield.
  for (const star of world.stars) {
    const alpha = 0.35 + 0.45 * star.layer * (0.7 + 0.3 * Math.sin(world.time * 2 + star.twinkle));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = star.layer > 0.7 ? '#cfe9ff' : '#8fa3c8';
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1;
}

export function drawAsteroids(ctx, world) {
  const P = CONFIG.palette;
  for (const asteroid of world.asteroids) {
    halo(ctx, asteroid.x, asteroid.y, asteroid.radius * 1.7, P.asteroidEdge, 0.35);
    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.rotate(asteroid.angle);
    ctx.beginPath();
    for (let i = 0; i < asteroid.verts.length; i++) {
      const angle = (i / asteroid.verts.length) * TAU;
      const radius = asteroid.radius * asteroid.verts[i];
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(24, 16, 52, 0.92)';
    ctx.fill();
    ctx.strokeStyle = P.asteroid;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Inner crack lines for a rocky read.
    ctx.beginPath();
    ctx.moveTo(-asteroid.radius * 0.4, -asteroid.radius * 0.2);
    ctx.lineTo(0, asteroid.radius * 0.25);
    ctx.lineTo(asteroid.radius * 0.45, -asteroid.radius * 0.1);
    ctx.strokeStyle = 'rgba(185, 140, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawCores(ctx, world) {
  const P = CONFIG.palette;
  for (const core of world.cores) {
    const pulse = 1 + 0.18 * Math.sin(core.pulse);
    const radius = core.radius * pulse;
    const blink = core.life < 3 ? (Math.sin(world.time * 10) > 0 ? 1 : 0.35) : 1;
    halo(ctx, core.x, core.y, radius * 2.4, P.core, 0.5 * blink);
    ctx.save();
    ctx.translate(core.x, core.y);
    ctx.rotate(world.time * 1.2 + core.pulse);
    ctx.globalAlpha = blink;
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius * 0.7, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius * 0.7, 0);
    ctx.closePath();
    ctx.fillStyle = P.core;
    ctx.fill();
    ctx.fillStyle = P.coreGlow;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.45);
    ctx.lineTo(radius * 0.32, 0);
    ctx.lineTo(0, radius * 0.45);
    ctx.lineTo(-radius * 0.32, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function drawPowerups(ctx, world) {
  const P = CONFIG.palette;
  for (const powerup of world.powerups) {
    const radius = powerup.radius * (1 + 0.08 * Math.sin(powerup.pulse));
    const color = P[powerup.kind];
    halo(ctx, powerup.x, powerup.y, radius * 2.2, color, 0.5);
    ctx.save();
    ctx.translate(powerup.x, powerup.y);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fillStyle = 'rgba(6, 10, 30, 0.9)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = powerup.kind === 'shield' ? 'S' : powerup.kind === 'magnet' ? 'M' : 'O';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }
}

export function drawBullets(ctx, world) {
  const P = CONFIG.palette;
  ctx.save();
  ctx.lineCap = 'round';
  for (const bullet of world.bullets) {
    const len = Math.hypot(bullet.vx, bullet.vy) || 1;
    const tx = (bullet.vx / len) * 10;
    const ty = (bullet.vy / len) * 10;
    // Wide translucent pass, then a thin bright core: a glow with no blur.
    ctx.strokeStyle = 'rgba(200, 247, 255, 0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(bullet.x - tx, bullet.y - ty);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.strokeStyle = P.bullet;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bullet.x - tx, bullet.y - ty);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawParticles(ctx, world) {
  for (const p of world.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawShip(ctx, world) {
  const { ship } = world;
  const P = CONFIG.palette;
  if (ship.invuln > 0 && Math.floor(world.time * 14) % 2 === 0) return; // blink while invulnerable
  halo(ctx, ship.x, ship.y, 42, P.ship, 0.45);
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Engine flame while thrusting.
  if (ship.thrusting) {
    const flicker = 12 + Math.random() * 10;
    ctx.beginPath();
    ctx.moveTo(-10, 5);
    ctx.lineTo(-10 - flicker, 0);
    ctx.lineTo(-10, -5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 177, 32, 0.9)';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-11, 10);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-11, -10);
  ctx.closePath();
  ctx.fillStyle = 'rgba(10, 24, 48, 0.95)';
  ctx.fill();
  ctx.strokeStyle = P.ship;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Cockpit dot.
  ctx.beginPath();
  ctx.arc(5, 0, 3, 0, TAU);
  ctx.fillStyle = P.shipGlow;
  ctx.fill();
  ctx.restore();

  // Shield ring.
  if (ship.shield) {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.ship.radius + 12, 0, TAU);
    ctx.strokeStyle = P.shield;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.ship.radius + 10 + Math.sin(world.time * 4) * 2, 0, TAU);
    ctx.strokeStyle = P.shield;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  // Magnet / overdrive auras.
  if (ship.magnet > 0 || ship.overdrive > 0) {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    const color = ship.overdrive > 0 ? P.overdrive : P.magnet;
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(world.time * 6);
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.ship.radius + 6, 0, TAU);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawBanner(ctx, world) {
  if (!world.banner || world.bannerTimer <= 0) return;
  const alpha = Math.min(1, world.bannerTimer);
  ctx.save();
  ctx.globalAlpha = alpha;
  glowText(
    ctx,
    world.banner,
    CONFIG.width / 2,
    CONFIG.height * 0.32,
    'bold 44px "Segoe UI", system-ui, sans-serif',
    CONFIG.palette.text,
    CONFIG.palette.ship,
  );
  ctx.restore();
}

export function drawTitle(ctx, best, time) {
  const P = CONFIG.palette;
  const { width, height } = CONFIG;
  ctx.save();
  ctx.fillStyle = 'rgba(4, 6, 26, 0.45)';
  ctx.fillRect(0, 0, width, height);
  glowText(ctx, 'NEON SALVAGE', width / 2, height * 0.26, 'bold 64px "Segoe UI", system-ui, sans-serif', P.ship, P.ship);
  glowText(ctx, '霓 虹 拾 荒 者', width / 2, height * 0.26 + 52, '28px "Segoe UI", system-ui, sans-serif', P.core, P.core);
  centerText(
    ctx,
    'Pilot a salvage ship through the asteroid field. Grab the glowing cores,',
    height * 0.44,
    '19px "Segoe UI", system-ui, sans-serif',
    P.text,
  );
  centerText(
    ctx,
    'blast the rocks, and chain pickups to raise your combo.',
    height * 0.44 + 28,
    '19px "Segoe UI", system-ui, sans-serif',
    P.text,
  );
  centerText(ctx, 'WASD / ARROWS — fly      MOUSE — aim      CLICK / SPACE — shoot', height * 0.55, '17px "Segoe UI", system-ui, sans-serif', P.dim);
  centerText(ctx, 'Power-ups: shield · magnet · overdrive      P — pause      M — mute', height * 0.55 + 26, '17px "Segoe UI", system-ui, sans-serif', P.dim);
  if (best > 0) {
    glowText(ctx, `BEST  ${best.toLocaleString('en-US')}`, width / 2, height * 0.66, 'bold 22px "Segoe UI", system-ui, sans-serif', P.core, P.core);
  }
  const blink = Math.sin(time * 4) > -0.2;
  if (blink) {
    glowText(ctx, 'PRESS ENTER OR CLICK TO START', width / 2, height * 0.76, 'bold 24px "Segoe UI", system-ui, sans-serif', P.text, P.text);
  }
  ctx.restore();
}

export function drawGameOver(ctx, result) {
  const P = CONFIG.palette;
  const { width, height } = CONFIG;
  ctx.save();
  ctx.fillStyle = 'rgba(4, 6, 26, 0.62)';
  ctx.fillRect(0, 0, width, height);

  // Panel: a wide low-alpha stroke behind the bright one reads as a glow.
  const panelW = 520;
  const panelH = 330;
  const px = (width - panelW) / 2;
  const py = (height - panelH) / 2;
  ctx.beginPath();
  ctx.roundRect(px, py, panelW, panelH, 14);
  ctx.fillStyle = 'rgba(10, 16, 48, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 84, 112, 0.35)';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = P.hull;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  glowText(ctx, 'SALVAGE RUN OVER', width / 2, py + 52, 'bold 36px "Segoe UI", system-ui, sans-serif', P.hull, P.hull);
  centerText(ctx, `FINAL SCORE   ${result.score.toLocaleString('en-US')}`, py + 118, 'bold 26px "Segoe UI", system-ui, sans-serif', P.text);
  centerText(ctx, `BEST  ${result.best.toLocaleString('en-US')}`, py + 156, '20px "Segoe UI", system-ui, sans-serif', P.core);
  centerText(
    ctx,
    `Waves survived: ${result.waves}      Cores salvaged: ${result.salvage}`,
    py + 196,
    '19px "Segoe UI", system-ui, sans-serif',
    P.dim,
  );
  const blink = Math.sin(result.time * 4) > -0.2;
  if (blink) {
    glowText(ctx, 'PRESS R OR CLICK TO RESTART', width / 2, py + 262, 'bold 22px "Segoe UI", system-ui, sans-serif', P.text, P.text);
  }
  ctx.restore();
}
