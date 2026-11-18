// Neon Salvage — the Boss: one large elite asteroid every 5 waves.
// One job: spawn the boss, drift it around the field, and fire its radial
// burst. The world owns the collision and the reward; this file only knows
// the boss's shape, health and attack rhythm.

import { CONFIG } from './config.js';

const TAU = Math.PI * 2;

// Which boss number this wave is (wave 5 -> 1st, wave 10 -> 2nd, ...).
export function bossIndex(wave) {
  return Math.floor(wave / CONFIG.waves.bossEvery);
}

export function spawnBoss(world) {
  const { rng } = world;
  const spec = CONFIG.boss;
  const hp = spec.baseHp + spec.hpPerBossWave * (bossIndex(world.wave) - 1);
  const boss = {
    id: world.nextId++,
    kind: 'boss',
    y: -spec.radius - 20,
    vx: 0,
    vy: spec.speed,
    radius: spec.radius,
    hp,
    maxHp: hp,
    angle: 0,
    spin: 0.25,
    attackTimer: 2.5,
    burstPhase: rng() * TAU,
    verts: [],
  };
  for (let i = 0; i < 11; i++) boss.verts.push(0.78 + rng() * 0.36);
  world.boss = boss;
  return boss;
}

// Drift toward a hover point above the centre, then strafe slowly; fire
// a radial burst on a timer. Returns nothing; the world reads world.boss.
export function updateBoss(world, dt) {
  const boss = world.boss;
  if (!boss) return;
  const spec = CONFIG.boss;
  boss.angle += boss.spin * dt;
  boss.burstPhase += dt;
  // Ease into a hover near the top third, then strafe side to side.
  const hoverY = CONFIG.height * 0.3;
  if (boss.y < hoverY) {
    boss.y += boss.vy * dt;
  } else {
    boss.y = hoverY + Math.sin(boss.burstPhase * 0.5) * 40;
    boss.x = CONFIG.width / 2 + Math.sin(boss.burstPhase * 0.35) * 220;
  }
  boss.attackTimer -= dt;
  if (boss.attackTimer <= 0) {
    boss.attackTimer = spec.burstInterval;
    const offset = world.rng() * TAU;
    for (let i = 0; i < spec.burstCount; i++) {
      const angle = offset + (i / spec.burstCount) * TAU;
      world.enemyBullets.push({
        x: boss.x + Math.cos(angle) * (boss.radius * 0.8),
        y: boss.y + Math.sin(angle) * (boss.radius * 0.8),
        vx: Math.cos(angle) * spec.burstSpeed,
        vy: Math.sin(angle) * spec.burstSpeed,
        radius: CONFIG.shooter.bulletRadius,
        life: 6,
      });
    }
  }
}
