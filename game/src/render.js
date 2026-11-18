// Neon Salvage — canvas rendering.
// One job: draw the world the simulation owns. Every shape is a vector
// drawn with canvas paths and radial-gradient halos; there are no image
// assets and no shadowBlur anywhere, so the game stays fast even on a
// software rasterizer. Screens (title, shop, game over) and the HUD live
// here and in hud.js.

import { CONFIG } from './config.js';
import {
  SHOP_ITEMS, SHOP_SKILLS, SHOP_AUTO, skillCost, autoCost,
  passiveIncome, incomeRate, SHOP_PANEL, shopCardRects, shopSummaryRect,
} from './shop.js';

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

  // Soft nebula blooms, fixed in the field so the backdrop is stable.
  const blooms = [
    { x: width * 0.22, y: height * 0.3, r: 260, color: 'rgba(88, 40, 180, 0.20)' },
    { x: width * 0.78, y: height * 0.62, r: 300, color: 'rgba(20, 90, 160, 0.18)' },
    { x: width * 0.55, y: height * 0.12, r: 200, color: 'rgba(255, 61, 242, 0.08)' },
    { x: width * 0.08, y: height * 0.85, r: 220, color: 'rgba(255, 140, 40, 0.07)' },
    { x: width * 0.9, y: height * 0.15, r: 180, color: 'rgba(40, 200, 160, 0.07)' },
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

// Two slow-drifting nebula clouds, painted from pre-rendered sprites so
// the backdrop feels alive without costing a gradient per frame.
const driftClouds = [
  { x: 0.3, y: 0.25, r: 240, color: 'rgba(120, 60, 220, 0.10)', speed: 4, phase: 0 },
  { x: 0.72, y: 0.7, r: 280, color: 'rgba(30, 120, 200, 0.09)', speed: -3, phase: 2.1 },
];

export function drawBackground(ctx, world) {
  const { width, height } = CONFIG;
  ctx.drawImage(backgroundLayer(), 0, 0, width, height);

  // Drifting nebula clouds.
  for (const cloud of driftClouds) {
    const cx = (cloud.x * width + world.time * cloud.speed) % (width + cloud.r * 2);
    const x = cx - cloud.r;
    const cy = cloud.y * height + Math.sin(world.time * 0.11 + cloud.phase) * 14;
    halo(ctx, x, cy, cloud.r, cloud.color, 0.9);
  }

  // Parallax starfield: near stars are bigger, brighter and faster.
  for (const star of world.stars) {
    const twinkle = 0.7 + 0.3 * Math.sin(world.time * 2 + star.twinkle);
    const alpha = (0.3 + 0.5 * star.layer) * twinkle;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = star.hue === 'warm' ? '#ffd9a0' : star.layer > 0.7 ? '#cfe9ff' : '#8fa3c8';
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
    // A small HP pip when a rock took more than one hit to crack.
    if (asteroid.hp > 1) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = P.asteroid;
      ctx.fillText(String(asteroid.hp), asteroid.x, asteroid.y);
      ctx.restore();
    }
  }
}

export function drawEnemies(ctx, world) {
  for (const enemy of world.enemies) {
    const spec = CONFIG[enemy.kind];
    halo(ctx, enemy.x, enemy.y, enemy.radius * 1.8, spec.edge, 0.4);
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);
    if (enemy.kind === 'chaser') {
      // A dart: it always points at the ship, so it reads as a hunter.
      ctx.beginPath();
      ctx.moveTo(enemy.radius + 4, 0);
      ctx.lineTo(-enemy.radius * 0.7, enemy.radius * 0.75);
      ctx.lineTo(-enemy.radius * 0.25, 0);
      ctx.lineTo(-enemy.radius * 0.7, -enemy.radius * 0.75);
      ctx.closePath();
      ctx.fillStyle = 'rgba(40, 6, 24, 0.95)';
      ctx.fill();
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(2, 0, 3.5, 0, TAU);
      ctx.fillStyle = spec.edge;
      ctx.fill();
    } else {
      // A hex turret with a barrel: it keeps its distance and shoots.
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * TAU;
        const x = Math.cos(angle) * enemy.radius;
        const y = Math.sin(angle) * enemy.radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(24, 8, 48, 0.95)';
      ctx.fill();
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(enemy.radius + 8, 0);
      ctx.strokeStyle = spec.edge;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fillStyle = spec.edge;
      ctx.fill();
    }
    ctx.restore();
    if (enemy.hp > 1) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = spec.edge;
      ctx.fillText(String(enemy.hp), enemy.x, enemy.y - enemy.radius - 10);
      ctx.restore();
    }
  }
}

export function drawEnemyBullets(ctx, world) {
  const P = CONFIG.palette;
  for (const orb of world.enemyBullets) {
    halo(ctx, orb.x, orb.y, orb.radius * 2.4, P.asteroidEdge, 0.6);
    ctx.save();
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius, 0, TAU);
    ctx.fillStyle = '#ff5e8a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius * 0.45, 0, TAU);
    ctx.fillStyle = '#ffd7e8';
    ctx.fill();
    ctx.restore();
  }
}

export function drawBoss(ctx, world) {
  const boss = world.boss;
  if (!boss) return;
  const spec = CONFIG.boss;
  halo(ctx, boss.x, boss.y, boss.radius * 1.9, spec.edge, 0.5);
  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.rotate(boss.angle);
  ctx.beginPath();
  for (let i = 0; i < boss.verts.length; i++) {
    const angle = (i / boss.verts.length) * TAU;
    const radius = boss.radius * boss.verts[i];
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(48, 8, 20, 0.95)';
  ctx.fill();
  ctx.strokeStyle = spec.color;
  ctx.lineWidth = 3;
  ctx.stroke();
  // A molten core that pulses with the attack timer.
  const pulse = 1 + 0.15 * Math.sin(world.time * 5);
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius * 0.34 * pulse, 0, TAU);
  ctx.fillStyle = spec.edge;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius * 0.18 * pulse, 0, TAU);
  ctx.fillStyle = '#ffe08a';
  ctx.fill();
  ctx.restore();
  // HP bar above the boss.
  const barW = boss.radius * 2;
  const barX = boss.x - barW / 2;
  const barY = boss.y - boss.radius - 22;
  ctx.save();
  ctx.fillStyle = 'rgba(143, 163, 200, 0.35)';
  ctx.fillRect(barX, barY, barW, 8);
  ctx.fillStyle = spec.color;
  ctx.fillRect(barX, barY, barW * Math.max(0, boss.hp / boss.maxHp), 8);
  ctx.strokeStyle = 'rgba(255, 61, 94, 0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, 8);
  ctx.restore();
}

export function drawDrones(ctx, world) {
  const P = CONFIG.palette;
  for (const drone of world.drones) {
    halo(ctx, drone.x, drone.y, 18, P.drone, 0.5);
    ctx.save();
    ctx.translate(drone.x, drone.y);
    ctx.rotate(world.time * 3);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 9);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 30, 18, 0.95)';
    ctx.fill();
    ctx.strokeStyle = P.drone;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, TAU);
    ctx.fillStyle = P.drone;
    ctx.fill();
    ctx.restore();
  }
  // Turrets orbit the ship; draw them as small orange hexes.
  for (const pos of world.turretPositions) {
    halo(ctx, pos.x, pos.y, 16, P.turret, 0.5);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(world.time * 1.5);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU;
      const x = Math.cos(angle) * 9;
      const y = Math.sin(angle) * 9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(40, 20, 6, 0.95)';
    ctx.fill();
    ctx.strokeStyle = P.turret;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fillStyle = P.turret;
    ctx.fill();
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
    const color = bullet.turret ? P.turret : P.bullet;
    ctx.strokeStyle = bullet.turret ? 'rgba(255, 154, 61, 0.35)' : 'rgba(200, 247, 255, 0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(bullet.x - tx, bullet.y - ty);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.strokeStyle = color;
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
    const alpha = Math.max(0, p.life / p.maxLife);
    if (p.kind === 'popup') {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${p.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    } else if (p.kind === 'trail') {
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
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

  // Hit-flash: right after damage the hull flashes white-hot.
  const flashing = ship.flash > 0;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-11, 10);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-11, -10);
  ctx.closePath();
  ctx.fillStyle = flashing ? '#ffffff' : 'rgba(10, 24, 48, 0.95)';
  ctx.fill();
  ctx.strokeStyle = flashing ? '#ffffff' : P.ship;
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
  // A slow pulsing halo behind the title so the menu feels alive.
  const pulse = 1 + 0.06 * Math.sin(time * 1.6);
  ctx.save();
  ctx.translate(width / 2, height * 0.26);
  ctx.scale(pulse, pulse);
  glowText(ctx, 'NEON SALVAGE', 0, 0, 'bold 64px "Segoe UI", system-ui, sans-serif', P.ship, P.ship);
  ctx.restore();
  glowText(ctx, '霓 虹 拾 荒 者', width / 2, height * 0.26 + 52, '28px "Segoe UI", system-ui, sans-serif', P.core, P.core);
  centerText(
    ctx,
    'Blast rocks, grab cores, earn coins — then buy drones, turrets',
    height * 0.44,
    '19px "Segoe UI", system-ui, sans-serif',
    P.text,
  );
  centerText(
    ctx,
    'and mining rigs that earn coins while you fly.',
    height * 0.44 + 28,
    '19px "Segoe UI", system-ui, sans-serif',
    P.text,
  );
  centerText(ctx, 'WASD — fly      MOUSE — aim, click / SPACE — shoot      B — shop', height * 0.55, '17px "Segoe UI", system-ui, sans-serif', P.dim);
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

export function drawShop(ctx, world) {
  const P = CONFIG.palette;
  const panel = SHOP_PANEL;
  ctx.save();
  ctx.fillStyle = 'rgba(4, 6, 26, 0.85)';
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

  // Panel.
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.w, panel.h, 14);
  ctx.fillStyle = 'rgba(10, 16, 48, 0.96)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 217, 77, 0.4)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = P.coin;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Title + balance.
  glowText(ctx, 'SALVAGE SHOP', CONFIG.width / 2, panel.y + 32, 'bold 30px "Segoe UI", system-ui, sans-serif', P.coin, P.coin);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.coin;
  ctx.fillText(`◉ ${Math.floor(world.coins).toLocaleString('en-US')} coins`, CONFIG.width / 2, panel.y + 64);
  ctx.font = '15px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText(`earning +${incomeRate(world).toFixed(1)} / sec  (passive ${passiveIncome(world)} / sec)`, CONFIG.width / 2, panel.y + 88);

  // Section headers.
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.text;
  ctx.fillText('SKILLS — click to upgrade', 60, panel.y + 112);
  ctx.fillText('AUTOMATION — click to buy', 500, panel.y + 112);

  // Cards.
  const rects = shopCardRects();
  SHOP_ITEMS.forEach((spec, i) => {
    const rect = rects[i];
    const isSkill = i < SHOP_SKILLS.length;
    const level = isSkill ? (world.skills[spec.id] || 0) : (world.auto[spec.id] || 0);
    const maxed = isSkill ? level >= spec.maxLevel : level >= spec.maxCount;
    const cost = isSkill ? skillCost(spec.id, level) : autoCost(spec.id, level);
    const affordable = !maxed && world.coins >= cost;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fillStyle = affordable ? 'rgba(24, 32, 72, 0.95)' : 'rgba(16, 20, 44, 0.9)';
    ctx.fill();
    ctx.strokeStyle = affordable ? spec.color : 'rgba(143, 163, 200, 0.35)';
    ctx.lineWidth = affordable ? 2 : 1.5;
    ctx.stroke();

    const cx = rect.x + rect.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Icon + name, truncated so a long name never runs into the level.
    ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = affordable || maxed ? spec.color : 'rgba(143, 163, 200, 0.6)';
    ctx.fillText(spec.icon, rect.x + 24, rect.y + 24);
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = affordable || maxed ? P.text : 'rgba(143, 163, 200, 0.6)';
    const maxNameW = rect.w - 44 - 62;
    let name = spec.name;
    while (name.length > 1 && ctx.measureText(name).width > maxNameW) {
      name = name.slice(0, -1);
    }
    if (name.length < spec.name.length) name += '…';
    ctx.fillText(name, rect.x + 44, rect.y + 24);
    // Level / count: skills show a level, automation shows a unit count.
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = spec.color;
    const max = isSkill ? spec.maxLevel : spec.maxCount;
    ctx.fillText(maxed ? 'MAX' : isSkill ? `Lv ${level} / ${max}` : `×${level} / ${max}`, rect.x + rect.w - 12, rect.y + 24);
    // Description.
    ctx.textAlign = 'left';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = P.dim;
    ctx.fillText(spec.desc, rect.x + 14, rect.y + 52);
    // Current output.
    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    if (!isSkill && spec.incomePerSec > 0) {
      ctx.fillStyle = P.coin;
      ctx.fillText(`now: ${level * spec.incomePerSec} coins / sec`, rect.x + 14, rect.y + 72);
    } else if (!isSkill && level > 0) {
      ctx.fillStyle = spec.color;
      ctx.fillText(`owned: ${level}  (working)`, rect.x + 14, rect.y + 72);
    } else {
      ctx.fillStyle = P.dim;
      ctx.fillText(level === 0 ? 'not owned yet' : `owned: Lv ${level}`, rect.x + 14, rect.y + 72);
    }
    // Price.
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
    if (maxed) {
      ctx.fillStyle = P.dim;
      ctx.fillText('— MAXED —', cx, rect.y + rect.h - 14);
    } else {
      ctx.fillStyle = affordable ? P.coin : '#ff6b7a';
      ctx.fillText(`◉ ${cost.toLocaleString('en-US')}`, cx, rect.y + rect.h - 14);
    }
  });

  // Summary box under the automation cards.
  const summary = shopSummaryRect();
  ctx.beginPath();
  ctx.roundRect(summary.x, summary.y, summary.w, summary.h, 10);
  ctx.fillStyle = 'rgba(24, 32, 72, 0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 217, 77, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.coin;
  ctx.fillText('YOUR FLEET', summary.x + 14, summary.y + 22);
  ctx.font = '14px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.text;
  const fleet = SHOP_AUTO.map((spec) => `${spec.icon} ${world.auto[spec.id] || 0}`).join('    ');
  ctx.fillText(fleet, summary.x + 14, summary.y + 48);
  ctx.fillStyle = P.dim;
  ctx.fillText(`Passive income: ${passiveIncome(world)} coins / sec`, summary.x + 14, summary.y + 74);

  // Footer hint.
  ctx.textAlign = 'center';
  ctx.font = '15px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = P.dim;
  ctx.fillText('Click a card or press 1–0 to buy      B / ESC — close shop', CONFIG.width / 2, panel.y + panel.h - 18);
  ctx.restore();
}

export function drawGameOver(ctx, result) {
  const P = CONFIG.palette;
  const { width, height } = CONFIG;
  ctx.save();
  ctx.fillStyle = 'rgba(4, 6, 26, 0.62)';
  ctx.fillRect(0, 0, width, height);

  const panelW = 520;
  const panelH = 380;
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
    `Coins earned: ${result.coinsEarned.toLocaleString('en-US')} ◉`,
    py + 192,
    '19px "Segoe UI", system-ui, sans-serif',
    P.coin,
  );
  centerText(
    ctx,
    `Waves: ${result.waves}      Cores: ${result.salvage}      Foes: ${result.foes}`,
    py + 224,
    '19px "Segoe UI", system-ui, sans-serif',
    P.dim,
  );
  centerText(
    ctx,
    `Automation built: ${result.automation}`,
    py + 254,
    '19px "Segoe UI", system-ui, sans-serif',
    P.dim,
  );
  const blink = Math.sin(result.time * 4) > -0.2;
  if (blink) {
    glowText(ctx, 'PRESS R OR CLICK TO RESTART', width / 2, py + 312, 'bold 22px "Segoe UI", system-ui, sans-serif', P.text, P.text);
  }
  ctx.restore();
}
