// Neon Salvage — the shop: skills and automation for coins.
// One job: know every buyable item, its escalating price, and what a
// purchase does to the run. Skills are active upgrades bought per level;
// automation is passive income bought per unit (each unit costs ~1.5x
// the last). The world owns the coins; this file only prices and applies.

// Skills: one purchase per level, each level costs more than the last.
export const SHOP_SKILLS = [
  { id: 'heavy', name: 'HEAVY SHOT', desc: '+1 bullet damage', icon: '◆', color: '#ffb020', baseCost: 150, costScale: 1.6, maxLevel: 5 },
  { id: 'rapid', name: 'RAPID FIRE', desc: '+15% fire rate', icon: '»', color: '#ffe14d', baseCost: 120, costScale: 1.6, maxLevel: 5 },
  { id: 'multishot', name: 'MULTISHOT', desc: '+1 projectile', icon: 'II', color: '#22e6ff', baseCost: 250, costScale: 1.8, maxLevel: 3 },
  { id: 'speed', name: 'THRUSTERS', desc: '+12% ship speed', icon: '>', color: '#3fa9ff', baseCost: 100, costScale: 1.6, maxLevel: 5 },
  { id: 'magnet', name: 'MAGNET', desc: '+60 pickup range', icon: '◎', color: '#c26bff', baseCost: 120, costScale: 1.6, maxLevel: 4 },
  { id: 'hull', name: 'HULL PLATE', desc: '+1 max hull, heal full', icon: '+', color: '#39ff88', baseCost: 200, costScale: 1.8, maxLevel: 2 },
];

// Automation: each unit costs ~1.5x the previous one. Miner and Robot pay
// a fixed coins-per-second; Drone and Turret earn by doing the work
// (collecting cores / shooting rocks) and their output shows in the
// measured income rate instead.
export const SHOP_AUTO = [
  { id: 'miner', name: 'MINING RIG', desc: '+2 coins / sec', icon: '⛏', color: '#ffb020', baseCost: 200, costScale: 1.5, maxCount: 8, incomePerSec: 2 },
  { id: 'drone', name: 'DRONE', desc: 'Flies out, grabs cores', icon: '◈', color: '#39ff88', baseCost: 250, costScale: 1.5, maxCount: 5, incomePerSec: 0 },
  { id: 'turret', name: 'TURRET', desc: 'Orbits you, shoots rocks', icon: '✛', color: '#ff9a3d', baseCost: 400, costScale: 1.5, maxCount: 3, incomePerSec: 0 },
  { id: 'robot', name: 'ROBOT', desc: '+8 coins / sec', icon: '⬢', color: '#c26bff', baseCost: 600, costScale: 1.5, maxCount: 5, incomePerSec: 8 },
];

export const SHOP_ITEMS = [...SHOP_SKILLS, ...SHOP_AUTO];

export function skillCost(id, level) {
  const spec = SHOP_SKILLS.find((s) => s.id === id);
  return Math.round(spec.baseCost * Math.pow(spec.costScale, level));
}

export function autoCost(id, count) {
  const spec = SHOP_AUTO.find((s) => s.id === id);
  return Math.round(spec.baseCost * Math.pow(spec.costScale, count));
}

// The combat numbers a run's skill levels produce.
export function computeMods(skills) {
  const level = (id) => skills[id] || 0;
  return {
    projectiles: 1 + level('multishot'),
    damage: 1 + level('heavy'),
    cooldownMul: Math.pow(0.85, level('rapid')),
    speedMul: 1 + 0.12 * level('speed'),
    magnetRadius: 70 + 60 * level('magnet'),
  };
}

// Passive coins per second from the fixed-income automation only.
export function passiveIncome(world) {
  let income = 0;
  for (const spec of SHOP_AUTO) {
    income += (world.auto[spec.id] || 0) * spec.incomePerSec;
  }
  return income;
}

// Measured coins per second over the last 10 seconds of play, from the
// coin-event log. Reflects everything: kills, cores and automation.
export function incomeRate(world) {
  const windowSeconds = 10;
  const cutoff = world.time - windowSeconds;
  let total = 0;
  for (const event of world.coinEvents) {
    if (event.t >= cutoff) total += event.amount;
  }
  return total / windowSeconds;
}

// The one place coins enter the run: balance, lifetime total and the
// income log all move together.
export function addCoins(world, amount) {
  world.coins += amount;
  world.coinsEarned += amount;
  world.coinEvents.push({ t: world.time, amount });
  if (world.coinEvents.length > 400) world.coinEvents.splice(0, world.coinEvents.length - 400);
}

export function buySkill(world, id) {
  const spec = SHOP_SKILLS.find((s) => s.id === id);
  if (!spec) return false;
  const level = world.skills[id] || 0;
  if (level >= spec.maxLevel) return false;
  const cost = skillCost(id, level);
  if (world.coins < cost) return false;
  world.coins -= cost;
  world.skills[id] = level + 1;
  if (id === 'hull') {
    world.hullMax += 1;
    world.hull = world.hullMax;
  }
  world.mods = computeMods(world.skills);
  return true;
}

export function buyAutomation(world, id) {
  const spec = SHOP_AUTO.find((s) => s.id === id);
  if (!spec) return false;
  const count = world.auto[id] || 0;
  if (count >= spec.maxCount) return false;
  const cost = autoCost(id, count);
  if (world.coins < cost) return false;
  world.coins -= cost;
  world.auto[id] = count + 1;
  if (id === 'drone') spawnDrone(world);
  return true;
}

// A drone is an entity: it flies out to the nearest core and hauls it in.
// One is spawned per purchase, up to the max count.
function spawnDrone(world) {
  const { ship, rng } = world;
  const angle = rng() * Math.PI * 2;
  world.drones.push({
    x: ship.x + Math.cos(angle) * 50,
    y: ship.y + Math.sin(angle) * 50,
    vx: 0,
    vy: 0,
    angle,
    orbitPhase: rng() * Math.PI * 2,
    state: 'idle',
    target: null,
  });
}

// The shop panel geometry. The renderer and the input handler both read
// these, so a click always lands on the card it looks like it lands on.
export const SHOP_PANEL = { x: 40, y: 30, w: 880, h: 540 };

export function shopCardRects() {
  const rects = [];
  // Skills: left half, 2 columns x 3 rows. Cards start below the headers.
  const skillW = 205;
  const skillH = 100;
  const skillGap = 12;
  for (let i = 0; i < SHOP_SKILLS.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    rects.push({
      x: 60 + col * (skillW + skillGap),
      y: 156 + row * (skillH + skillGap),
      w: skillW,
      h: skillH,
    });
  }
  // Automation: right half, 2 columns x 2 rows.
  const autoW = 195;
  const autoH = 100;
  for (let i = 0; i < SHOP_AUTO.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    rects.push({
      x: 500 + col * (autoW + skillGap),
      y: 156 + row * (autoH + skillGap),
      w: autoW,
      h: autoH,
    });
  }
  return rects;
}

// The summary box under the automation cards.
export function shopSummaryRect() {
  return { x: 500, y: 380, w: 402, h: 100 };
}

// The SHOP button in the HUD (bottom right). Logical coordinates.
export function shopButtonRect() {
  return { x: 960 - 150, y: 600 - 52, w: 130, h: 34 };
}
