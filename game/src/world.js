// Neon Salvage — the game world: entities, waves, coins and automation.
// Pure simulation: it owns the ship, bullets, asteroids, chasers,
// shooters, the boss, cores, power-ups, particles, drones and turrets,
// and advances them one fixed step at a time. It knows nothing about the
// canvas or the DOM; rendering lives in render.js. The player flies and
// shoots by hand; the coins they earn buy skills and automation, and the
// automation earns more coins — that loop is the game.

import { CONFIG, mulberry32, clamp, distanceSquared } from './config.js';
import { burst, sparks, trail, popup, updateParticles } from './particles.js';
import { spawnChaser, spawnShooter, updateEnemies } from './enemies.js';
import { spawnBoss, updateBoss } from './boss.js';
import { computeMods, addCoins, passiveIncome } from './shop.js';

const TAU = Math.PI * 2;

function makeStars(rng) {
  const stars = [];
  for (let i = 0; i < 130; i++) {
    // Three parallax layers: far (slow, dim), mid, near (fast, bright).
    const roll = rng();
    const layer = roll < 0.45 ? 0.25 : roll < 0.8 ? 0.55 : 0.9;
    stars.push({
      x: rng() * CONFIG.width,
      y: rng() * CONFIG.height,
      layer,
      size: layer > 0.7 ? 1.2 + rng() * 1.8 : 0.6 + rng() * 1.4,
      twinkle: rng() * TAU,
      hue: rng() < 0.2 ? 'warm' : 'cool',
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

// Enemy HP grows with the wave so later waves stay threatening.
function scaledHp(world, base) {
  const scale = 1 + CONFIG.waves.hpGrowth * (world.wave - 1);
  return Math.max(1, Math.round(base * scale));
}

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const world = {
    rng,
    seed,
    time: 0,
    nextId: 1,
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
      flash: 0,
    },
    bullets: [],
    asteroids: [],
    enemies: [],
    enemyBullets: [],
    cores: [],
    powerups: [],
    particles: [],
    stars: makeStars(rng),
    boss: null,
    drones: [],
    turretTimers: [],
    turretPositions: [],
    score: 0,
    combo: 0,
    comboTimer: 0,
    salvage: 0,
    hull: CONFIG.hullMax,
    hullMax: CONFIG.hullMax,
    wave: 0,
    waveState: 'active',
    clearTimer: 0,
    banner: null,
    bannerTimer: 0,
    shake: 0,
    shotsFired: 0,
    asteroidsDestroyed: 0,
    foesDestroyed: 0,
    coins: 0,
    coinsEarned: 0,
    coinEvents: [],
    coinFraction: 0,
    skills: {},
    auto: {},
    mods: computeMods({}),
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

function farFromShip(world, minDist) {
  const { ship, rng } = world;
  let x;
  let y;
  do {
    x = rng() * CONFIG.width;
    y = rng() * CONFIG.height;
  } while (distanceSquared(x, y, ship.x, ship.y) < minDist * minDist);
  return { x, y };
}

export function spawnAsteroid(world, tierIndex, x, y, speedScale = 1) {
  const { rng } = world;
  const tier = CONFIG.asteroid.tiers[tierIndex];
  const px = x !== null && x !== undefined ? x : rng() * CONFIG.width;
  const py = y !== null && y !== undefined ? y : rng() * CONFIG.height;
  const angle = rng() * TAU;
  const speed = tier.speed * speedScale * (0.7 + rng() * 0.6);
  const asteroid = {
    id: world.nextId++,
    x: px,
    y: py,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: tier.radius,
    tier: tierIndex,
    hp: scaledHp(world, 1),
    angle: rng() * TAU,
    spin: (rng() - 0.5) * 1.6,
    verts: makeAsteroidVerts(rng),
  };
  world.asteroids.push(asteroid);
  return asteroid;
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
  ship.flash = 0;
  world.bullets = [];
  world.asteroids = [];
  world.enemies = [];
  world.enemyBullets = [];
  world.cores = [];
  world.powerups = [];
  world.particles = [];
  world.boss = null;
  world.drones = [];
  world.turretTimers = [];
  world.turretPositions = [];
  world.score = 0;
  world.combo = 0;
  world.comboTimer = 0;
  world.salvage = 0;
  world.hullMax = CONFIG.hullMax;
  world.hull = CONFIG.hullMax;
  world.wave = 0;
  world.waveState = 'active';
  world.clearTimer = 0;
  world.shotsFired = 0;
  world.asteroidsDestroyed = 0;
  world.foesDestroyed = 0;
  world.coins = 0;
  world.coinsEarned = 0;
  world.coinEvents = [];
  world.coinFraction = 0;
  world.skills = {};
  world.auto = {};
  world.mods = computeMods({});
  world.coreTimer = 4;
  nextWave(world);
  for (let i = 0; i < 3; i++) spawnCore(world);
}

// A wave is a room to clear: kill every foe and the next wave starts.
function nextWave(world) {
  world.wave += 1;
  world.waveState = 'active';
  if (world.wave > 1) {
    setBanner(world, `WAVE ${world.wave}`, 2.2);
  } else {
    setBanner(world, `WAVE ${world.wave}`, 2.2);
  }
  const speedScale = Math.pow(CONFIG.waves.speedGrowth, world.wave - 1);
  const isBossWave = world.wave % CONFIG.waves.bossEvery === 0;
  const asteroidCount = isBossWave
    ? CONFIG.waves.bossAsteroids
    : Math.min(
        CONFIG.waves.baseAsteroids + CONFIG.waves.perWave * (world.wave - 1),
        CONFIG.waves.maxAsteroids,
      );
  for (let i = 0; i < asteroidCount; i++) {
    const { x, y } = farFromShip(world, 220);
    spawnAsteroid(world, 0, x, y, speedScale);
  }
  // Chasers from wave 2, shooters from wave 3, in the opening batch too.
  const chasers = world.wave >= 2 ? Math.min(world.wave - 1, 3) : 0;
  const shooters = world.wave >= 3 ? Math.min(world.wave - 2, 2) : 0;
  for (let i = 0; i < chasers; i++) {
    const { x, y } = farFromShip(world, 260);
    spawnChaser(world, x, y, speedScale);
  }
  for (let i = 0; i < shooters; i++) {
    const { x, y } = farFromShip(world, 280);
    spawnShooter(world, x, y, speedScale);
  }
  if (isBossWave && !world.boss) {
    spawnBoss(world);
    setBanner(world, `WAVE ${world.wave} — BOSS`, 2.6);
  }
}

function waveCleared(world) {
  return (
    world.waveState === 'active' &&
    world.asteroids.length === 0 &&
    world.enemies.length === 0 &&
    !world.boss
  );
}

function destroyAsteroid(world, asteroid, audio) {
  const { rng } = world;
  const tier = CONFIG.asteroid.tiers[asteroid.tier];
  const coinValue = CONFIG.coins.asteroid[asteroid.tier];
  world.score += tier.score;
  addCoins(world, coinValue);
  world.asteroidsDestroyed += 1;
  world.foesDestroyed += 1;
  popup(world, asteroid.x, asteroid.y, `+${coinValue}◉`, CONFIG.palette.coin);
  burst(world, asteroid.x, asteroid.y, CONFIG.palette.asteroidEdge, 14, 180);
  burst(world, asteroid.x, asteroid.y, CONFIG.palette.asteroid, 10, 120);
  if (asteroid.tier === 0) world.shake = Math.max(world.shake, 5);
  audio.explosion(asteroid.tier === 0);
  if (tier.splitsInto && world.asteroids.length < 20) {
    const nextTier = tier.splitsInto === 'medium' ? 1 : 2;
    for (let i = 0; i < 2; i++) {
      const child = spawnAsteroid(world, nextTier, asteroid.x, asteroid.y, 1);
      void child;
    }
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

function destroyEnemy(world, enemy, audio) {
  const spec = CONFIG[enemy.kind];
  const coinValue = CONFIG.coins[enemy.kind];
  world.score += spec.score;
  addCoins(world, coinValue);
  world.foesDestroyed += 1;
  popup(world, enemy.x, enemy.y, `+${coinValue}◉`, CONFIG.palette.coin);
  burst(world, enemy.x, enemy.y, spec.edge, 16, 200);
  burst(world, enemy.x, enemy.y, spec.color, 10, 140);
  audio.explosion(false);
  if (world.rng() < 0.12) spawnPowerup(world, enemy.x, enemy.y);
}

function bossDown(world, audio) {
  const spec = CONFIG.boss;
  world.score += spec.score;
  addCoins(world, CONFIG.coins.boss);
  world.foesDestroyed += 1;
  popup(world, world.boss.x, world.boss.y, `+${CONFIG.coins.boss}◉`, CONFIG.palette.coin);
  burst(world, world.boss.x, world.boss.y, spec.edge, 40, 320);
  burst(world, world.boss.x, world.boss.y, spec.color, 30, 240);
  burst(world, world.boss.x, world.boss.y, CONFIG.palette.coreGlow, 20, 180);
  world.shake = 18;
  audio.explosion(true);
  spawnPowerup(world, world.boss.x - 40, world.boss.y);
  spawnPowerup(world, world.boss.x + 40, world.boss.y);
  spawnCore(world, world.boss.x, world.boss.y - 50);
  spawnCore(world, world.boss.x, world.boss.y + 50);
  world.boss = null;
}

// One hit of `damage` on a foe. Returns true when the foe is destroyed.
// The destroyed foe is spliced out of the world first, so a dead rock can
// never be hit (and farmed) again.
function damageFoe(world, foe, damage, audio) {
  if (foe.kind === 'boss') {
    foe.hp -= damage;
    if (foe.hp <= 0) {
      bossDown(world, audio);
      return true;
    }
    return false;
  }
  if (foe.tier !== undefined) {
    foe.hp -= damage;
    if (foe.hp <= 0) {
      const index = world.asteroids.indexOf(foe);
      if (index >= 0) world.asteroids.splice(index, 1);
      destroyAsteroid(world, foe, audio);
      return true;
    }
    return false;
  }
  foe.hp -= damage;
  if (foe.hp <= 0) {
    const index = world.enemies.indexOf(foe);
    if (index >= 0) world.enemies.splice(index, 1);
    destroyEnemy(world, foe, audio);
    return true;
  }
  return false;
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
  ship.flash = 0.22;
  world.shake = 14;
  burst(world, ship.x, ship.y, CONFIG.palette.hull, 26, 260);
  burst(world, ship.x, ship.y, CONFIG.palette.ship, 12, 180);
  audio.hit();
  return world.hull <= 0;
}

// Collect a core: score and coins both scale with the combo, so chaining
// pickups is the fastest way to fund the shop.
function collectCore(world, core, audio) {
  world.combo = Math.min(world.combo + 1, CONFIG.combo.maxMultiplier);
  world.comboTimer = CONFIG.combo.windowSeconds;
  const multiplier = Math.max(1, world.combo);
  const points = CONFIG.core.baseScore * multiplier;
  const coinValue = CONFIG.coins.core * multiplier;
  world.score += points;
  addCoins(world, coinValue);
  world.salvage += 1;
  popup(world, core.x, core.y, `+${coinValue}◉`, CONFIG.palette.coin);
  burst(world, core.x, core.y, CONFIG.palette.coreGlow, CONFIG.particles.pickupCount, 140);
  audio.pickup(world.combo);
}

// The nearest foe to a point within range, or null. Shared by the turrets.
function nearestFoe(world, x, y, range) {
  let best = null;
  let bestD2 = range * range;
  const consider = (foe) => {
    const d2 = distanceSquared(foe.x, foe.y, x, y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = foe;
    }
  };
  for (const asteroid of world.asteroids) consider(asteroid);
  for (const enemy of world.enemies) consider(enemy);
  if (world.boss) consider(world.boss);
  return best;
}

// Manual fire: aim at the pointer, hold mouse or Space to shoot.
function fire(world, pointer, audio) {
  const { ship, mods } = world;
  const dx = pointer.x - ship.x;
  const dy = pointer.y - ship.y;
  if (Math.hypot(dx, dy) < 4) return;
  ship.angle = Math.atan2(dy, dx);
  const cooldown =
    CONFIG.ship.fireCooldown * mods.cooldownMul * (ship.overdrive > 0 ? 0.5 : 1);
  if (ship.fireTimer > 0) return;
  if (!pointer.down && !pointer.space) return;
  ship.fireTimer = cooldown;
  const bulletSpeed = CONFIG.ship.bulletSpeed * (ship.overdrive > 0 ? 1.3 : 1);
  const count = mods.projectiles;
  const spread = 0.14;
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spread;
    const angle = ship.angle + offset;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    world.bullets.push({
      x: ship.x + nx * (CONFIG.ship.radius + 6),
      y: ship.y + ny * (CONFIG.ship.radius + 6),
      vx: nx * bulletSpeed + ship.vx * 0.4,
      vy: ny * bulletSpeed + ship.vy * 0.4,
      life: CONFIG.ship.bulletLife,
      damage: mods.damage,
      turret: false,
    });
  }
  world.shotsFired += 1;
  audio.shoot();
}

// Turret positions: they orbit the ship, spread evenly around it.
function turretPositions(world) {
  const count = world.auto.turret || 0;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + world.time * 0.8;
    positions.push({
      x: world.ship.x + Math.cos(angle) * 58,
      y: world.ship.y + Math.sin(angle) * 58,
    });
  }
  return positions;
}

function fireTurrets(world, audio, dt) {
  const count = world.auto.turret || 0;
  while (world.turretTimers.length < count) world.turretTimers.push(0);
  world.turretTimers.length = count;
  world.turretPositions = turretPositions(world);
  for (let i = 0; i < count; i++) {
    world.turretTimers[i] -= dt;
    if (world.turretTimers[i] > 0) continue;
    const pos = world.turretPositions[i];
    const target = nearestFoe(world, pos.x, pos.y, 420);
    if (!target) continue;
    world.turretTimers[i] = 0.5;
    const angle = Math.atan2(target.y - pos.y, target.x - pos.x);
    world.bullets.push({
      x: pos.x + Math.cos(angle) * 12,
      y: pos.y + Math.sin(angle) * 12,
      vx: Math.cos(angle) * CONFIG.ship.bulletSpeed,
      vy: Math.sin(angle) * CONFIG.ship.bulletSpeed,
      life: CONFIG.ship.bulletLife,
      damage: 1,
      turret: true,
    });
    audio.shoot();
  }
}

// Drones: each one flies to the nearest core and hauls it in; with no
// core in the field it circles the ship, waiting.
function updateDrones(world, audio, dt) {
  const { ship } = world;
  for (const drone of world.drones) {
    let target = null;
    let bestD2 = Infinity;
    for (const core of world.cores) {
      const d2 = distanceSquared(drone.x, drone.y, core.x, core.y);
      if (d2 < bestD2) {
        bestD2 = d2;
        target = core;
      }
    }
    if (target) {
      drone.state = 'fetch';
      const dx = target.x - drone.x;
      const dy = target.y - drone.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = 330;
      drone.vx = (dx / d) * speed;
      drone.vy = (dy / d) * speed;
      drone.x += drone.vx * dt;
      drone.y += drone.vy * dt;
      const reach = target.radius + 12;
      if (d < reach) {
        const index = world.cores.indexOf(target);
        if (index >= 0) world.cores.splice(index, 1);
        collectCore(world, target, audio);
      }
    } else {
      drone.state = 'idle';
      drone.orbitPhase += dt * 1.4;
      const tx = ship.x + Math.cos(drone.orbitPhase) * 55;
      const ty = ship.y + Math.sin(drone.orbitPhase) * 55;
      drone.x += (tx - drone.x) * Math.min(1, dt * 4);
      drone.y += (ty - drone.y) * Math.min(1, dt * 4);
    }
    drone.x = wrap(drone.x, CONFIG.width);
    drone.y = wrap(drone.y, CONFIG.height);
  }
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

function magnetRadius(world) {
  const { ship, mods } = world;
  return Math.max(mods.magnetRadius, ship.magnet > 0 ? 240 : 0);
}

function magnetPull(world, obj, dt) {
  const { ship } = world;
  const radius = magnetRadius(world);
  if (radius <= 0) return;
  const d2 = distanceSquared(obj.x, obj.y, ship.x, ship.y);
  if (d2 < radius * radius) {
    const d = Math.sqrt(d2) || 1;
    const pull = 460 * dt;
    obj.vx += ((ship.x - obj.x) / d) * pull;
    obj.vy += ((ship.y - obj.y) / d) * pull;
    obj.vx = clamp(obj.vx, -340, 340);
    obj.vy = clamp(obj.vy, -340, 340);
  }
}

// Advances one frame of live play. Returns { gameOver }.
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
  ship.flash = Math.max(0, ship.flash - dt);
  ship.magnet = Math.max(0, ship.magnet - dt);
  ship.overdrive = Math.max(0, ship.overdrive - dt);

  // --- Passive income: miners and robots pay every second ---
  const income = passiveIncome(world);
  if (income > 0) {
    world.coinFraction += income * dt;
    const whole = Math.floor(world.coinFraction);
    if (whole > 0) {
      addCoins(world, whole);
      world.coinFraction -= whole;
    }
  }

  // --- Ship movement (WASD / arrows) ---
  let ax = 0;
  let ay = 0;
  if (input.held('KeyA', 'ArrowLeft')) ax -= 1;
  if (input.held('KeyD', 'ArrowRight')) ax += 1;
  if (input.held('KeyW', 'ArrowUp')) ay -= 1;
  if (input.held('KeyS', 'ArrowDown')) ay += 1;
  if (ax !== 0 || ay !== 0) {
    const len = Math.hypot(ax, ay);
    const accel = CONFIG.ship.accel * world.mods.speedMul;
    ship.vx += (ax / len) * accel * dt;
    ship.vy += (ay / len) * accel * dt;
    ship.thrusting = true;
  } else {
    ship.thrusting = false;
  }
  const drag = Math.pow(CONFIG.ship.drag, dt * 60);
  ship.vx *= drag;
  ship.vy *= drag;
  const maxSpeed = CONFIG.ship.maxSpeed * world.mods.speedMul;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > maxSpeed) {
    ship.vx = (ship.vx / speed) * maxSpeed;
    ship.vy = (ship.vy / speed) * maxSpeed;
  }
  ship.x = wrap(ship.x + ship.vx * dt, CONFIG.width);
  ship.y = wrap(ship.y + ship.vy * dt, CONFIG.height);

  // Engine trail while thrusting.
  if (ship.thrusting) {
    const backX = ship.x - Math.cos(ship.angle) * CONFIG.ship.radius;
    const backY = ship.y - Math.sin(ship.angle) * CONFIG.ship.radius;
    trail(world, backX, backY, -ship.vx, -ship.vy);
  }

  // --- Manual fire (mouse aim, click or Space) ---
  ship.fireTimer -= dt;
  fire(world, pointer, audio);

  // --- Auto turrets ---
  fireTurrets(world, audio, dt);

  // --- Drones ---
  updateDrones(world, audio, dt);

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

  // --- Enemies (chasers steer, shooters fire) ---
  updateEnemies(world, dt);

  // --- Boss ---
  if (world.boss) updateBoss(world, dt);

  // --- Cores: drift, magnet pull, expiry ---
  for (let i = world.cores.length - 1; i >= 0; i--) {
    const core = world.cores[i];
    core.pulse += dt * 4;
    core.life -= dt;
    magnetPull(world, core, dt);
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
  updateParticles(world, dt);

  // --- Stars drift ---
  for (const star of world.stars) {
    star.x -= 6 * star.layer * dt;
    star.y += 3 * star.layer * dt;
    if (star.x < 0) star.x += CONFIG.width;
    if (star.y > CONFIG.height) star.y -= CONFIG.height;
  }

  // --- Bullets vs foes ---
  for (let bi = world.bullets.length - 1; bi >= 0; bi--) {
    const bullet = world.bullets[bi];
    let consumed = false;
    const hitFoe = (foe, radius) => {
      const reach = radius + CONFIG.ship.bulletRadius + 2;
      if (distanceSquared(bullet.x, bullet.y, foe.x, foe.y) >= reach * reach) return false;
      sparks(world, bullet.x, bullet.y, P.bullet, 4);
      damageFoe(world, foe, bullet.damage, audio);
      return true;
    };
    for (let ai = world.asteroids.length - 1; ai >= 0; ai--) {
      if (hitFoe(world.asteroids[ai], world.asteroids[ai].radius)) {
        consumed = true;
        break;
      }
    }
    if (!consumed) {
      for (let ei = world.enemies.length - 1; ei >= 0; ei--) {
        if (hitFoe(world.enemies[ei], world.enemies[ei].radius)) {
          consumed = true;
          break;
        }
      }
    }
    if (!consumed && world.boss) {
      if (hitFoe(world.boss, world.boss.radius)) consumed = true;
    }
    // Bullets can shoot down enemy orbs.
    if (!consumed) {
      for (let oi = world.enemyBullets.length - 1; oi >= 0; oi--) {
        const orb = world.enemyBullets[oi];
        const reach = orb.radius + CONFIG.ship.bulletRadius + 2;
        if (distanceSquared(bullet.x, bullet.y, orb.x, orb.y) < reach * reach) {
          world.enemyBullets.splice(oi, 1);
          sparks(world, orb.x, orb.y, P.asteroidEdge, 5);
          consumed = true;
          break;
        }
      }
    }
    if (consumed) world.bullets.splice(bi, 1);
  }

  // --- Ship vs asteroids ---
  let gameOver = false;
  const shipHitBy = (x, y, radius) => {
    if (ship.invuln > 0) return false;
    const reach = radius + CONFIG.ship.radius - 4;
    return distanceSquared(ship.x, ship.y, x, y) < reach * reach;
  };
  if (ship.invuln <= 0) {
    for (let ai = world.asteroids.length - 1; ai >= 0; ai--) {
      const asteroid = world.asteroids[ai];
      if (shipHitBy(asteroid.x, asteroid.y, asteroid.radius)) {
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
  if (!gameOver && ship.invuln <= 0) {
    for (let ei = world.enemies.length - 1; ei >= 0; ei--) {
      const enemy = world.enemies[ei];
      if (shipHitBy(enemy.x, enemy.y, enemy.radius)) {
        world.enemies.splice(ei, 1);
        burst(world, enemy.x, enemy.y, CONFIG[enemy.kind].edge, 14, 180);
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
  if (!gameOver && ship.invuln <= 0 && world.boss) {
    if (shipHitBy(world.boss.x, world.boss.y, world.boss.radius)) {
      if (damageShip(world, audio)) {
        gameOver = true;
        burst(world, ship.x, ship.y, P.ship, 40, 320);
        burst(world, ship.x, ship.y, P.hull, 30, 240);
        audio.explosion(true);
      }
    }
  }
  if (!gameOver && ship.invuln <= 0) {
    for (let oi = world.enemyBullets.length - 1; oi >= 0; oi--) {
      const orb = world.enemyBullets[oi];
      if (shipHitBy(orb.x, orb.y, orb.radius)) {
        world.enemyBullets.splice(oi, 1);
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
      collectCore(world, core, audio);
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

  // --- Wave clear: bonus, then the next wave ---
  if (!gameOver) {
    if (world.waveState === 'active' && waveCleared(world)) {
      world.waveState = 'clear';
      world.clearTimer = 2.5;
      const coinBonus = CONFIG.coins.waveBonus * world.wave;
      world.score += CONFIG.waves.clearBonus;
      addCoins(world, coinBonus);
      setBanner(world, `WAVE ${world.wave} CLEAR   +${coinBonus}◉`, 2.2);
      audio.waveClear();
    } else if (world.waveState === 'clear') {
      world.clearTimer -= dt;
      if (world.clearTimer <= 0) nextWave(world);
    }
  }

  return { gameOver };
}
