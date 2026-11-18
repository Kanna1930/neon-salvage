// Neon Salvage — tuning constants, the neon palette, and the seeded RNG.
// Every number that shapes how the game feels lives here, so balance can be
// tuned in one place without touching the world or rendering code.

export const CONFIG = {
  // Logical playfield size. The canvas is scaled to the window; the game
  // always simulates in these units.
  width: 960,
  height: 600,

  palette: {
    bgDeep: '#04061a',
    bgMid: '#0b1030',
    bgGlow: '#1a1140',
    grid: '#182a5e',
    text: '#e8f6ff',
    dim: '#8fa3c8',
    ship: '#22e6ff',
    shipGlow: '#8ff4ff',
    bullet: '#c8f7ff',
    asteroid: '#b98cff',
    asteroidEdge: '#ff3df2',
    core: '#ffb020',
    coreGlow: '#ffe08a',
    shield: '#3fa9ff',
    magnet: '#c26bff',
    overdrive: '#ffe14d',
    hull: '#ff5470',
    heal: '#39ff88',
    coin: '#ffd94d',
    drone: '#39ff88',
    turret: '#ff9a3d',
  },

  ship: {
    radius: 14,
    accel: 1500,
    maxSpeed: 360,
    drag: 0.90,
    fireCooldown: 0.16,
    bulletSpeed: 640,
    bulletLife: 0.85,
    bulletRadius: 3,
    invulnerableSeconds: 2.0,
  },

  asteroid: {
    // radius, score and split target per size tier.
    tiers: [
      { radius: 44, score: 50, splitsInto: 'medium', speed: 55 },
      { radius: 26, score: 100, splitsInto: 'small', speed: 85 },
      { radius: 14, score: 200, splitsInto: null, speed: 120 },
    ],
    spawnMargin: 70,
  },

  core: {
    radius: 9,
    baseScore: 100,
    lifetimeSeconds: 12,
    driftSpeed: 26,
  },

  combo: {
    windowSeconds: 4,
    maxMultiplier: 8,
  },

  powerups: {
    shieldSeconds: 0, // shield lasts until it absorbs one hit
    magnetSeconds: 8,
    overdriveSeconds: 8,
    dropChance: 0.16,
    kinds: ['shield', 'magnet', 'overdrive'],
  },

  // Chaser: steers toward the ship. Shooter: keeps its distance and fires
  // slow aimed orbs. Both read instantly by shape and colour.
  chaser: {
    radius: 15,
    hp: 1,
    score: 150,
    speed: 150,
    turnRate: 2.6,
    color: '#ff2e88',
    edge: '#ff7ab8',
  },

  shooter: {
    radius: 17,
    hp: 2,
    score: 250,
    speed: 70,
    fireInterval: 2.6,
    bulletSpeed: 150,
    bulletRadius: 6,
    color: '#b14dff',
    edge: '#d9a0ff',
  },

  boss: {
    radius: 72,
    baseHp: 42,
    hpPerBossWave: 12,
    score: 1000,
    speed: 42,
    burstInterval: 3.2,
    burstCount: 8,
    burstSpeed: 120,
    color: '#ff3d5e',
    edge: '#ff9a3d',
  },

  // Coin economy: what each source pays. Asteroid coins are per tier
  // (large / medium / small); cores pay per combo multiplier; the wave
  // bonus is per wave number. Tuned so the first automation is affordable
  // inside wave 1 and the snowball is felt within a few minutes.
  coins: {
    asteroid: [4, 6, 10],
    chaser: 15,
    shooter: 20,
    boss: 500,
    core: 10,
    waveBonus: 50,
  },

  waves: {
    baseAsteroids: 4,
    perWave: 2,
    maxAsteroids: 16,
    speedGrowth: 1.07,
    clearBonus: 250,
    bossEvery: 5,
    bossAsteroids: 4,
    // Enemy HP grows with the wave so later waves stay threatening.
    hpGrowth: 0.15,
  },

  particles: {
    explosionCount: 26,
    pickupCount: 12,
    max: 500,
    popupLife: 0.9,
  },

  hullMax: 3,
};

// mulberry32: a small deterministic PRNG. The game takes its seed from the
// URL (?seed=N) so screenshot runs reproduce the same field; interactive
// play uses a random seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
