// Neon Salvage — the game world: entities, waves, collisions, power-ups.
// Pure simulation: it owns the ship, asteroids, salvage cores, bullets and
// particles, and advances them one fixed step at a time. It knows nothing
// about the canvas or the DOM; rendering lives in render.js.

import { CONFIG, mulberry32, clamp, distanceSquared } from './config.js';

const TAU = Math.PI * 2;

function makeStars(rng) {
  const stars = [];
  for (let i = 0; i < 110; i++) {
    stars.push({
      x: rng() * CONFIG.width,
      y: rng() * CONFIG.height,
      layer: 0.25 + rng() * 0.75,
      size: 0.6 + rng() * 1.6,
      twinkle: rng() * TAU,
    });
  }
  return stars;
}

function makeAsteroidVerts(rng) {
  const verts = [];
  const count = 9;
  for (let i = 0; i < count; i++) verts.push(0.72 + rng() * 0.42);
  return verts;
}

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const world = {
    rng,
    seed,
    time: 0,
    ship: {
      x: CONFIG.width / 2,
      y: CONFIG.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      fireTimer: 0,
      invuln: 0,
      shield: false,
      magnet: 0,
      overdrive: 0,
      thrusting: false,
    },
    bullets: [],
    asteroids: [],
    cores: [],
    powerups: [],
    particles: [],
    stars: makeStars(rng),
    score: 0,
    combo: 0,
    comboTimer: 0,
    salvage: 0,
    hull: CONFIG.hullMax,
    wave: 0,
    waveState: 'idle',
    waveTimer: 0,
    coreTimer: 0,
    banner: null,
    bannerTimer: 0,
    shake: 0,
    shotsFired: 0,
    asteroidsDestroyed: 0,
  };
  // A few slow asteroids drift behind the title screen.
  for (let i = 0; i < 5; i++) spawnAsteroid(world, 0, null, null, 0.5);
  return world;
}

function wrap(value, max) {
  if (value < 0) return value + max;
  if (value >= max) return value - max;
  return value;
}

export function spawnAsteroid(world, tierIndex, x, y, speedScale = 1) {
  const { rng } = world;
  const tier = CONFIG.asteroid.tiers[tierIndex];
  const px = x !== null && x !== undefined ? x : rng() * CONFIG.width;
  const py = y !== null && y !== undefined ? y : rng() * CONFIG.height;
  const angle = rng() * TAU;
  const speed = tier.speed * speedScale * (0.7 + rng() * 0.6);
  world.asteroids.push({
    x: px,
    y: py,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: tier.radius,
    tier: tierIndex,
    angle: rng() * TAU,
    spin: (rng() - 0.5) * 1.6,
    verts: makeAsteroidVerts(rng),
  });
}

function spawnCore(world, x, y) {
  const { rng } = world;
  const angle = rng() * TAU;
  world.cores.push({
    x: x !== undefined ? x : rng() * CONFIG.width,
    y: y !== undefined ? y : rng() * CONFIG.height,
    vx: Math.cos(angle) * CONFIG.core.driftSpeed,
    vy: Math.sin(angle) * CONFIG.core.driftSpeed,
    radius: CONFIG.core.radius,
    life: CONFIG.core.lifetimeSeconds,
    pulse: rng() * TAU,
  });
}

function spawnPowerup(world, x, y) {
  const { rng } = world;
  const kinds = CONFIG.powerups.kinds;
  const kind = kinds[Math.floor(rng() * kinds.length)];
  const angle = rng() * TAU;
  world.powerups.push({
    x,
    y,
    vx: Math.cos(angle) * 30,
    vy: Math.sin(angle) * 30,
    kind,
    radius: 13,
    life: 10,
    pulse: 0,
  });
}

export function burst(world, x, y, color, count, speed) {
  const { rng } = world;
  for (let i = 0; i < count; i++) {
    if (world.particles.length >= CONFIG.particles.max) return;
    const angle = rng() * TAU;
    const velocity = speed * (0.3 + rng() * 0.7);
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 0.5 + rng() * 0.5,
      maxLife: 1,
      size: 1.5 + rng() * 2.5,
      color,
    });
  }
}

function setBanner(world, text, seconds) {
  world.banner = text;
  world.bannerTimer = seconds;
}

export function startRun(world) {
  const { ship } = world;
  ship.x = CONFIG.width / 2;
  ship.y = CONFIG.height / 2;
  ship.vx = 0;
  ship.vy = 0;
  ship.angle = -Math.PI / 2;
  ship.fireTimer = 0;
  ship.invuln = 0;
  ship.shield = false;
  ship.magnet = 0;
  ship.overdrive = 0;
  world.bullets = [];
  world.asteroids = [];
  world.cores = [];
  world.powerups = [];
  world.particles = [];
  world.score = 0;
  world.combo = 0;
  world.comboTimer = 0;
  world.salvage = 0;
  world.hull = CONFIG.hullMax;
  world.wave = 0;
  world.shotsFired = 0;
  world.asteroidsDestroyed = 0;
  world.coreTimer = 4;
  nextWave(world);
  for (let i = 0; i < 3; i++) spawnCore(world);
}

function nextWave(world) {
  world.wave += 1;
  const count = Math.min(
    CONFIG.waves.baseAsteroids + CONFIG.waves.perWave * (world.wave - 1),
    CONFIG.waves.maxAsteroids,
  );
  const speedScale = Math.pow(CONFIG.waves.speedGrowth, world.wave - 1);
  const { ship, rng } = world;
  for (let i = 0; i < count; i++) {
    let x;
    let y;
    do {
      x = rng() * CONFIG.width;
      y = rng() * CONFIG.height;
    } while (distanceSquared(x, y, ship.x, ship.y) < 220 * 220);
    spawnAsteroid(world, 0, x, y, speedScale);
  }
  world.waveState = 'active';
  setBanner(world, `WAVE ${world.wave}`, 2.2);
}

function destroyAsteroid(world, asteroid, audio) {
  const { rng } = world;
  const tier = CONFIG.asteroid.tiers[asteroid.tier];
  world.score += tier.score;
  world.asteroidsDestroyed += 1;
  burst(world, asteroid.x, asteroid.y, CONFIG.palette.asteroidEdge, 14, 180);
  burst(world, asteroid.x, asteroid.y, CONFIG.palette.asteroid, 10, 120);
  audio.explosion(asteroid.tier === 0);
  if (tier.splitsInto) {
    const nextTier = tier.splitsInto === 'medium' ? 1 : 2;
    for (let i = 0; i < 2; i++) {
      const child = spawnAsteroid(world, nextTier, asteroid.x, asteroid.y, 1);
      void child;
    }
    // Give the children a push away from each other.
    const children = world.asteroids.slice(-2);
    children.forEach((child, i) => {
      const push = rng() * TAU;
      child.vx += Math.cos(push + i * Math.PI) * 60;
      child.vy += Math.sin(push + i * Math.PI) * 60;
    });
  } else {
    if (rng() < CONFIG.powerups.dropChance) spawnPowerup(world, asteroid.x, asteroid.y);
    if (rng() < 0.3) spawnCore(world, asteroid.x, asteroid.y);
  }
}

function damageShip(world, audio) {
  const { ship } = world;
  if (ship.invuln > 0) return false;
  if (ship.shield) {
    ship.shield = false;
    ship.invuln = 1.2;
    burst(world, ship.x, ship.y, CONFIG.palette.shield, 20, 220);
    audio.hit();
    return false;
  }
  world.hull -= 1;
  world.combo = 0;
  world.comboTimer = 0;
  ship.invuln = CONFIG.ship.invulnerableSeconds;
  world.shake = 14;
  burst(world, ship.x, ship.y, CONFIG.palette.hull, 26, 260);
  burst(world, ship.x, ship.y, CONFIG.palette.ship, 12, 180);
  audio.hit();
  return world.hull <= 0;
}

export function updateAmbient(world, dt) {
  world.time += dt;
  for (const star of world.stars) {
    star.x -= 6 * star.layer * dt;
    star.y += 3 * star.layer * dt;
    if (star.x < 0) star.x += CONFIG.width;
    if (star.y > CONFIG.height) star.y -= CONFIG.height;
  }
  for (const asteroid of world.asteroids) {
    asteroid.x = wrap(asteroid.x + asteroid.vx * dt, CONFIG.width);
    asteroid.y = wrap(asteroid.y + asteroid.vy * dt, CONFIG.height);
    asteroid.angle += asteroid.spin * dt;
  }
}

// Advances one frame of live play. Returns { gameOver: boolean }.
export function updateWorld(world, input, pointer, audio, dt) {
  world.time += dt;
  const { ship } = world;
  const P = CONFIG.palette;

  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 30);
  if (world.bannerTimer > 0) world.bannerTimer -= dt;
  if (world.comboTimer > 0) {
    world.comboTimer -= dt;
    if (world.comboTimer <= 0) world.combo = 0;
  }
  ship.invuln = Math.max(0, ship.invuln - dt);
  ship.magnet = Math.max(0, ship.magnet - dt);
  ship.overdrive = Math.max(0, ship.overdrive - dt);

  // --- Ship movement (WASD / arrows) ---
  let ax = 0;
  let ay = 0;
  if (input.held('KeyA', 'ArrowLeft')) ax -= 1;
  if (input.held('KeyD', 'ArrowRight')) ax += 1;
  if (input.held('KeyW', 'ArrowUp')) ay -= 1;
  if (input.held('KeyS', 'ArrowDown')) ay += 1;
  if (ax !== 0 || ay !== 0) {
    const len = Math.hypot(ax, ay);
    ship.vx += (ax / len) * CONFIG.ship.accel * dt;
    ship.vy += (ay / len) * CONFIG.ship.accel * dt;
    ship.thrusting = true;
  } else {
    ship.thrusting = false;
  }
  const drag = Math.pow(CONFIG.ship.drag, dt * 60);
  ship.vx *= drag;
  ship.vy *= drag;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > CONFIG.ship.maxSpeed) {
    ship.vx = (ship.vx / speed) * CONFIG.ship.maxSpeed;
    ship.vy = (ship.vy / speed) * CONFIG.ship.maxSpeed;
  }
  ship.x = wrap(ship.x + ship.vx * dt, CONFIG.width);
  ship.y = wrap(ship.y + ship.vy * dt, CONFIG.height);

  // --- Aim at the mouse; fire on click or Space ---
  ship.angle = Math.atan2(pointer.y - ship.y, pointer.x - ship.x);
  ship.fireTimer -= dt;
  const firing = pointer.down || input.held('Space');
  if (firing && ship.fireTimer <= 0) {
    const cooldown = CONFIG.ship.fireCooldown * (ship.overdrive > 0 ? 0.5 : 1);
    ship.fireTimer = cooldown;
    const bulletSpeed = CONFIG.ship.bulletSpeed * (ship.overdrive > 0 ? 1.3 : 1);
    const nx = Math.cos(ship.angle);
    const ny = Math.sin(ship.angle);
    world.bullets.push({
      x: ship.x + nx * (CONFIG.ship.radius + 6),
      y: ship.y + ny * (CONFIG.ship.radius + 6),
      vx: nx * bulletSpeed + ship.vx * 0.4,
      vy: ny * bulletSpeed + ship.vy * 0.4,
      life: CONFIG.ship.bulletLife,
    });
    world.shotsFired += 1;
    audio.shoot();
  }

  // --- Bullets ---
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const bullet = world.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (
      bullet.life <= 0 ||
      bullet.x < -20 || bullet.x > CONFIG.width + 20 ||
      bullet.y < -20 || bullet.y > CONFIG.height + 20
    ) {
      world.bullets.splice(i, 1);
    }
  }

  // --- Asteroids ---
  for (const asteroid of world.asteroids) {
    asteroid.x = wrap(asteroid.x + asteroid.vx * dt, CONFIG.width);
    asteroid.y = wrap(asteroid.y + asteroid.vy * dt, CONFIG.height);
    asteroid.angle += asteroid.spin * dt;
  }

  // --- Cores: drift, magnet pull, expiry ---
  for (let i = world.cores.length - 1; i >= 0; i--) {
    const core = world.cores[i];
    core.pulse += dt * 4;
    core.life -= dt;
    if (ship.magnet > 0) {
      const d2 = distanceSquared(core.x, core.y, ship.x, ship.y);
      if (d2 < 240 * 240) {
        const d = Math.sqrt(d2) || 1;
        const pull = 420 * dt;
        core.vx += ((ship.x - core.x) / d) * pull;
        core.vy += ((ship.y - core.y) / d) * pull;
        core.vx = clamp(core.vx, -320, 320);
        core.vy = clamp(core.vy, -320, 320);
      }
    }
    core.x = wrap(core.x + core.vx * dt, CONFIG.width);
    core.y = wrap(core.y + core.vy * dt, CONFIG.height);
    if (core.life <= 0) world.cores.splice(i, 1);
  }

  // --- Power-ups ---
  for (let i = world.powerups.length - 1; i >= 0; i--) {
    const powerup = world.powerups[i];
    powerup.pulse += dt * 3;
    powerup.life -= dt;
    powerup.x = wrap(powerup.x + powerup.vx * dt, CONFIG.width);
    powerup.y = wrap(powerup.y + powerup.vy * dt, CONFIG.height);
    if (powerup.life <= 0) world.powerups.splice(i, 1);
  }

  // --- Particles ---
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= dt;
    if (p.life <= 0) world.particles.splice(i, 1);
  }

  // --- Stars drift ---
  updateAmbientStars(world, dt);

  // --- Bullets vs asteroids ---
  for (let bi = world.bullets.length - 1; bi >= 0; bi--) {
    const bullet = world.bullets[bi];
    let consumed = false;
    for (let ai = world.asteroids.length - 1; ai >= 0; ai--) {
      const asteroid = world.asteroids[ai];
      const reach = asteroid.radius + CONFIG.ship.bulletRadius + 2;
      if (distanceSquared(bullet.x, bullet.y, asteroid.x, asteroid.y) < reach * reach) {
        world.bullets.splice(bi, 1);
        consumed = true;
        world.asteroids.splice(ai, 1);
        destroyAsteroid(world, asteroid, audio);
        break;
      }
    }
    if (consumed) continue;
  }

  // --- Ship vs asteroids ---
  let gameOver = false;
  if (ship.invuln <= 0) {
    for (let ai = world.asteroids.length - 1; ai >= 0; ai--) {
      const asteroid = world.asteroids[ai];
      const reach = asteroid.radius + CONFIG.ship.radius - 4;
      if (distanceSquared(ship.x, ship.y, asteroid.x, asteroid.y) < reach * reach) {
        world.asteroids.splice(ai, 1);
        burst(world, asteroid.x, asteroid.y, P.asteroidEdge, 14, 180);
        if (damageShip(world, audio)) {
          gameOver = true;
          burst(world, ship.x, ship.y, P.ship, 40, 320);
          burst(world, ship.x, ship.y, P.hull, 30, 240);
          audio.explosion(true);
        }
        break;
      }
    }
  }

  // --- Ship vs cores ---
  for (let i = world.cores.length - 1; i >= 0; i--) {
    const core = world.cores[i];
    const reach = core.radius + CONFIG.ship.radius + 4;
    if (distanceSquared(ship.x, ship.y, core.x, core.y) < reach * reach) {
      world.cores.splice(i, 1);
      world.combo = Math.min(world.combo + 1, CONFIG.combo.maxMultiplier);
      world.comboTimer = CONFIG.combo.windowSeconds;
      const multiplier = Math.max(1, world.combo);
      world.score += CONFIG.core.baseScore * multiplier;
      world.salvage += 1;
      burst(world, core.x, core.y, P.coreGlow, CONFIG.particles.pickupCount, 140);
      audio.pickup(world.combo);
    }
  }

  // --- Ship vs power-ups ---
  for (let i = world.powerups.length - 1; i >= 0; i--) {
    const powerup = world.powerups[i];
    const reach = powerup.radius + CONFIG.ship.radius + 4;
    if (distanceSquared(ship.x, ship.y, powerup.x, powerup.y) < reach * reach) {
      world.powerups.splice(i, 1);
      if (powerup.kind === 'shield') ship.shield = true;
      if (powerup.kind === 'magnet') ship.magnet = CONFIG.powerups.magnetSeconds;
      if (powerup.kind === 'overdrive') ship.overdrive = CONFIG.powerups.overdriveSeconds;
      burst(world, powerup.x, powerup.y, P[powerup.kind], 16, 160);
      audio.powerup();
    }
  }

  // --- Core spawner ---
  world.coreTimer -= dt;
  if (world.coreTimer <= 0) {
    world.coreTimer = 5;
    if (world.cores.length < 5) spawnCore(world);
  }

  // --- Wave progression ---
  if (!gameOver && world.waveState === 'active' && world.asteroids.length === 0) {
    const bonus = CONFIG.waves.clearBonus * world.wave;
    world.score += bonus;
    world.waveState = 'clear';
    world.waveTimer = 2.4;
    setBanner(world, `WAVE ${world.wave} CLEAR  +${bonus}`, 2.4);
    audio.waveClear();
    spawnCore(world);
    spawnCore(world);
  } else if (world.waveState === 'clear') {
    world.waveTimer -= dt;
    if (world.waveTimer <= 0) nextWave(world);
  }

  return { gameOver };
}

function updateAmbientStars(world, dt) {
  for (const star of world.stars) {
    star.x -= 6 * star.layer * dt;
    star.y += 3 * star.layer * dt;
    if (star.x < 0) star.x += CONFIG.width;
    if (star.y > CONFIG.height) star.y -= CONFIG.height;
  }
}
