// Neon Salvage — the hostile ships: Chasers and Shooters.
// One job: spawn and steer the two enemy types that hunt the player, and
// fly the slow aimed orbs the Shooters fire. Enemies live in world.enemies
// (separate from the splitting asteroids in world.asteroids); their orbs
// live in world.enemyBullets. This file owns their motion and firing; the
// world owns the collisions.

import { CONFIG, clamp, distanceSquared } from './config.js';

const TAU = Math.PI * 2;

function spawnEnemy(world, kind, x, y, speedScale = 1) {
  const { rng } = world;
  const spec = CONFIG[kind];
  const angle = rng() * TAU;
  const hpScale = 1 + CONFIG.waves.hpGrowth * (world.wave - 1);
  const enemy = {
    id: world.nextId++,
    kind,
    x: x !== null && x !== undefined ? x : rng() * CONFIG.width,
    y: y !== null && y !== undefined ? y : rng() * CONFIG.height,
    vx: Math.cos(angle) * spec.speed * 0.5,
    vy: Math.sin(angle) * spec.speed * 0.5,
    radius: spec.radius,
    hp: Math.max(1, Math.round(spec.hp * hpScale)),
    speedScale,
    angle: rng() * TAU,
    fireTimer: 1.2 + rng() * 1.4,
    wobble: rng() * TAU,
  };
  world.enemies.push(enemy);
  return enemy;
}

export function spawnChaser(world, x, y, speedScale = 1) {
  return spawnEnemy(world, 'chaser', x, y, speedScale);
}

export function spawnShooter(world, x, y, speedScale = 1) {
  return spawnEnemy(world, 'shooter', x, y, speedScale);
}

function fireOrb(world, enemy) {
  const { ship } = world;
  const spec = CONFIG.shooter;
  const angle = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
  world.enemyBullets.push({
    x: enemy.x + Math.cos(angle) * (enemy.radius + 4),
    y: enemy.y + Math.sin(angle) * (enemy.radius + 4),
    vx: Math.cos(angle) * spec.bulletSpeed,
    vy: Math.sin(angle) * spec.bulletSpeed,
    radius: spec.bulletRadius,
    life: 5,
  });
}

// Steer chasers toward the ship, drift shooters and let them fire.
export function updateEnemies(world, dt) {
  const { ship } = world;
  const chaserSpec = CONFIG.chaser;
  const shooterSpec = CONFIG.shooter;
  for (const enemy of world.enemies) {
    enemy.wobble += dt * 2;
    if (enemy.kind === 'chaser') {
      const target = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
      let diff = target - enemy.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      const turn = clamp(diff, -chaserSpec.turnRate * dt, chaserSpec.turnRate * dt);
      enemy.angle += turn;
      const thrust = chaserSpec.speed * 1.4 * (enemy.speedScale || 1);
      enemy.vx += Math.cos(enemy.angle) * thrust * dt;
      enemy.vy += Math.sin(enemy.angle) * thrust * dt;
      const speed = Math.hypot(enemy.vx, enemy.vy);
      const cap = chaserSpec.speed * 1.15 * (enemy.speedScale || 1);
      if (speed > cap) {
        enemy.vx = (enemy.vx / speed) * cap;
        enemy.vy = (enemy.vy / speed) * cap;
      }
    } else {
      // Shooter: hold a loose orbit at mid range, never ramming.
      const d2 = distanceSquared(enemy.x, enemy.y, ship.x, ship.y);
      const away = Math.atan2(enemy.y - ship.y, enemy.x - ship.x);
      const drift = shooterSpec.speed * (enemy.speedScale || 1);
      if (d2 < 200 * 200) {
        enemy.vx += Math.cos(away) * drift * dt;
        enemy.vy += Math.sin(away) * drift * dt;
      } else if (d2 > 340 * 340) {
        enemy.vx -= Math.cos(away) * drift * 0.6 * dt;
        enemy.vy -= Math.sin(away) * drift * 0.6 * dt;
      }
      enemy.vx *= 0.985;
      enemy.vy *= 0.985;
      enemy.angle = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0) {
        enemy.fireTimer = shooterSpec.fireInterval * (0.85 + world.rng() * 0.3);
        fireOrb(world, enemy);
      }
    }
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    // Enemies wrap like everything else, so a chase never strands.
    if (enemy.x < -30) enemy.x += CONFIG.width + 60;
    if (enemy.x > CONFIG.width + 30) enemy.x -= CONFIG.width + 60;
    if (enemy.y < -30) enemy.y += CONFIG.height + 60;
    if (enemy.y > CONFIG.height + 30) enemy.y -= CONFIG.height + 60;
  }

  // Enemy orbs drift straight and expire.
  for (let i = world.enemyBullets.length - 1; i >= 0; i--) {
    const orb = world.enemyBullets[i];
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    orb.life -= dt;
    if (
      orb.life <= 0 ||
      orb.x < -20 || orb.x > CONFIG.width + 20 ||
      orb.y < -20 || orb.y > CONFIG.height + 20
    ) {
      world.enemyBullets.splice(i, 1);
    }
  }
}
