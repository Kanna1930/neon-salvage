// Neon Salvage — particles and floating score popups.
// One job: spawn, move and fade everything that is not a solid entity:
// explosion bursts, bullet-hit sparks, pickup bursts, the engine trail,
// and the floating "+100" score popups. The world owns the arrays; this
// file only knows how to fill them and step them. No canvas work here.

import { CONFIG } from './config.js';

const TAU = Math.PI * 2;

function push(world, particle) {
  if (world.particles.length >= CONFIG.particles.max) return;
  world.particles.push(particle);
}

// A radial burst of glowing dots. count and speed scale the blast.
export function burst(world, x, y, color, count, speed) {
  const { rng } = world;
  for (let i = 0; i < count; i++) {
    const angle = rng() * TAU;
    const velocity = speed * (0.3 + rng() * 0.7);
    push(world, {
      kind: 'dot',
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 0.5 + rng() * 0.5,
      maxLife: 1,
      size: 1.5 + rng() * 2.5,
      color,
      drag: 0.98,
    });
  }
}

// A small, fast spark shower for a bullet impact: fewer, quicker dots.
export function sparks(world, x, y, color, count = 6) {
  const { rng } = world;
  for (let i = 0; i < count; i++) {
    const angle = rng() * TAU;
    const velocity = 120 + rng() * 160;
    push(world, {
      kind: 'dot',
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 0.2 + rng() * 0.25,
      maxLife: 0.45,
      size: 1 + rng() * 1.5,
      color,
      drag: 0.94,
    });
  }
}

// A short fading streak left behind the ship's engine while thrusting.
export function trail(world, x, y, vx, vy) {
  const { rng } = world;
  push(world, {
    kind: 'trail',
    x: x + (rng() - 0.5) * 6,
    y: y + (rng() - 0.5) * 6,
    vx: vx * 0.25 + (rng() - 0.5) * 30,
    vy: vy * 0.25 + (rng() - 0.5) * 30,
    life: 0.35 + rng() * 0.2,
    maxLife: 0.55,
    size: 2 + rng() * 2,
    color: CONFIG.palette.core,
    drag: 0.96,
  });
}

// Floating score text: rises and fades. The renderer draws it as text.
export function popup(world, x, y, text, color) {
  push(world, {
    kind: 'popup',
    x,
    y,
    vx: 0,
    vy: -46,
    life: CONFIG.particles.popupLife,
    maxLife: CONFIG.particles.popupLife,
    size: 15,
    color,
    text,
    drag: 1,
  });
}

export function updateParticles(world, dt) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.life -= dt;
    if (p.life <= 0) world.particles.splice(i, 1);
  }
}
