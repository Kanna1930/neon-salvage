// Neon Salvage — bootstrap, game loop and screen state machine.
// One job: own the canvas, the screen flow (title -> playing -> shop ->
// game over), the animation loop, and the ?shot= hooks that stage
// deterministic states for screenshots. The simulation itself lives in
// world.js; the shop lives in shop.js.

import { CONFIG } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld, startRun, updateWorld, updateAmbient } from './world.js';
import {
  SHOP_ITEMS, buySkill, buyAutomation, shopCardRects, shopButtonRect,
} from './shop.js';
import {
  drawBackground, drawAsteroids, drawEnemies, drawEnemyBullets, drawBoss,
  drawDrones, drawCores, drawPowerups, drawBullets, drawParticles,
  drawShip, drawBanner, drawTitle, drawShop, drawGameOver,
} from './render.js';
import { drawHud } from './hud.js';

const BEST_KEY = 'neon-salvage-best';
const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') || '', 10);
const seed = Number.isFinite(seedParam) ? seedParam : Math.floor(Math.random() * 0xffffffff);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();
const world = createWorld(seed);

let screen = 'title'; // title | playing | paused | shop | over
let best = 0;
try {
  best = Number.parseInt(window.localStorage.getItem(BEST_KEY) || '0', 10) || 0;
} catch {
  best = 0;
}
let result = {
  score: 0, best: 0, waves: 0, salvage: 0, time: 0,
  coinsEarned: 0, foes: 0, automation: 0,
};

// View transform: logical 960x600 playfield fitted into the window.
let dpr = 1;
let view = { scale: 1, ox: 0, oy: 0, vw: 0, vh: 0 };

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  canvas.width = Math.floor(vw * dpr);
  canvas.height = Math.floor(vh * dpr);
  canvas.style.width = `${vw}px`;
  canvas.style.height = `${vh}px`;
  const scale = Math.min(vw / CONFIG.width, vh / CONFIG.height);
  view = {
    scale,
    ox: (vw - CONFIG.width * scale) / 2,
    oy: (vh - CONFIG.height * scale) / 2,
    vw,
    vh,
  };
}
window.addEventListener('resize', resize);
resize();

function pointerLogical() {
  return {
    x: (input.mouse.x - view.ox) / view.scale,
    y: (input.mouse.y - view.oy) / view.scale,
    down: input.mouse.down,
    space: input.held('Space'),
  };
}

function beginRun() {
  audio.unlock();
  startRun(world);
  screen = 'playing';
}

function finishRun() {
  const finalScore = world.score;
  const newBest = Math.max(best, finalScore);
  if (newBest !== best) {
    best = newBest;
    try {
      window.localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Private mode or blocked storage: best still shows this session.
    }
  }
  const automation = Object.values(world.auto).reduce((a, b) => a + b, 0);
  result = {
    score: finalScore,
    best,
    waves: world.wave,
    salvage: world.salvage,
    time: world.time,
    coinsEarned: Math.floor(world.coinsEarned),
    foes: world.foesDestroyed,
    automation,
  };
  audio.gameOver();
  screen = 'over';
}

function openShop() {
  audio.unlock();
  screen = 'shop';
}

function closeShop() {
  screen = 'playing';
}

function buyIndex(index) {
  const spec = SHOP_ITEMS[index];
  if (!spec) return;
  const ok = index < 6 ? buySkill(world, spec.id) : buyAutomation(world, spec.id);
  if (ok) audio.buy();
  else audio.denied();
}

function cardAt(pointer) {
  const rects = shopCardRects();
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (pointer.x >= r.x && pointer.x <= r.x + r.w && pointer.y >= r.y && pointer.y <= r.y + r.h) {
      return i;
    }
  }
  return -1;
}

function buttonAt(pointer) {
  const r = shopButtonRect();
  return pointer.x >= r.x && pointer.x <= r.x + r.w && pointer.y >= r.y && pointer.y <= r.y + r.h;
}

function update(dt) {
  if (input.pressed('KeyM')) audio.toggleMute();

  if (screen === 'title') {
    updateAmbient(world, dt);
    if (input.pressed('Enter', 'Space') || input.mouse.clicked) beginRun();
  } else if (screen === 'playing') {
    if (input.pressed('KeyP', 'Escape')) {
      screen = 'paused';
    } else if (input.pressed('KeyB')) {
      openShop();
    } else if (input.mouse.clicked && buttonAt(pointerLogical())) {
      openShop();
    } else {
      const outcome = updateWorld(world, input, pointerLogical(), audio, dt);
      if (outcome.gameOver) finishRun();
    }
  } else if (screen === 'paused') {
    if (input.pressed('KeyP', 'Escape', 'Enter')) screen = 'playing';
  } else if (screen === 'shop') {
    if (input.pressed('KeyB', 'Escape')) {
      closeShop();
    } else if (input.pressed('Digit1')) buyIndex(0);
    else if (input.pressed('Digit2')) buyIndex(1);
    else if (input.pressed('Digit3')) buyIndex(2);
    else if (input.pressed('Digit4')) buyIndex(3);
    else if (input.pressed('Digit5')) buyIndex(4);
    else if (input.pressed('Digit6')) buyIndex(5);
    else if (input.pressed('Digit7')) buyIndex(6);
    else if (input.pressed('Digit8')) buyIndex(7);
    else if (input.pressed('Digit9')) buyIndex(8);
    else if (input.pressed('Digit0')) buyIndex(9);
    else if (input.mouse.clicked) {
      const index = cardAt(pointerLogical());
      if (index >= 0) buyIndex(index);
    }
  } else if (screen === 'over') {
    updateAmbient(world, dt);
    if (input.pressed('KeyR', 'Enter') || input.mouse.clicked) beginRun();
  }
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = CONFIG.palette.bgDeep;
  ctx.fillRect(0, 0, view.vw, view.vh);

  const shakeX = world.shake > 0 ? (Math.random() - 0.5) * world.shake : 0;
  const shakeY = world.shake > 0 ? (Math.random() - 0.5) * world.shake : 0;
  ctx.save();
  ctx.translate(view.ox + shakeX, view.oy + shakeY);
  ctx.scale(view.scale, view.scale);

  drawBackground(ctx, world);
  drawAsteroids(ctx, world);
  drawEnemies(ctx, world);
  drawEnemyBullets(ctx, world);
  drawBoss(ctx, world);
  drawCores(ctx, world);
  drawPowerups(ctx, world);
  drawBullets(ctx, world);
  drawDrones(ctx, world);
  drawParticles(ctx, world);
  if (screen !== 'over') drawShip(ctx, world);
  drawBanner(ctx, world);

  if (screen === 'playing' || screen === 'paused' || screen === 'shop') {
    drawHud(ctx, world, audio.isMuted());
  }
  if (screen === 'title') {
    drawTitle(ctx, best, world.time);
  } else if (screen === 'shop') {
    drawShop(ctx, world);
  } else if (screen === 'over') {
    drawGameOver(ctx, result);
  }
  ctx.restore();

  if (screen === 'paused') {
    ctx.save();
    ctx.fillStyle = 'rgba(4, 6, 26, 0.55)';
    ctx.fillRect(0, 0, view.vw, view.vh);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = CONFIG.palette.text;
    ctx.shadowColor = CONFIG.palette.ship;
    ctx.shadowBlur = 18;
    ctx.fillText('PAUSED', view.vw / 2, view.vh / 2 - 16);
    ctx.shadowBlur = 0;
    ctx.font = '18px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = CONFIG.palette.dim;
    ctx.fillText('Press P to resume', view.vw / 2, view.vh / 2 + 24);
    ctx.restore();
  }
}

// --- Screenshot staging: ?shot=title|play|over|shop&seed=N --------------
// These hooks render one deterministic frame of the game's own states so
// the bounty screenshots show the real game. Interactive play ignores them.
const silentAudio = {
  shoot() {}, pickup() {}, explosion() {}, hit() {}, powerup() {},
  waveClear() {}, gameOver() {}, buy() {}, denied() {},
};

function stagePlayShot() {
  startRun(world);
  // Buy into the loop with the shop itself so the HUD shows a real build.
  world.coins = 2000;
  world.coinsEarned = 2000;
  buyAutomation(world, 'miner');
  buyAutomation(world, 'drone');
  buyAutomation(world, 'robot');
  buyAutomation(world, 'turret');
  buySkill(world, 'rapid');
  buySkill(world, 'heavy');
  // Cores in the ship's path so the run collects them.
  world.cores.push(
    { x: 545, y: 282, vx: -10, vy: 6, radius: 9, life: 12, pulse: 0 },
    { x: 600, y: 274, vx: -8, vy: -4, radius: 9, life: 12, pulse: 1 },
    { x: 655, y: 266, vx: 6, vy: 8, radius: 9, life: 12, pulse: 2 },
  );
  world.powerups.push({ x: 510, y: 290, vx: 0, vy: 0, kind: 'magnet', radius: 13, life: 10, pulse: 0 });
  runScripted(world, 160);
  world.ship.invuln = 0;
  world.combo = Math.max(3, Math.min(world.salvage, CONFIG.combo.maxMultiplier));
  world.comboTimer = CONFIG.combo.windowSeconds;
  screen = 'playing';
}

// Scripted pilot: fly right, aim at the nearest rock, hold fire. Used by
// the staged screenshots so the field is a real played state, not a pose.
function runScripted(world, frames) {
  const scripted = {
    held: (code) => code === 'KeyD',
    pressed: () => false,
    endFrame() {},
  };
  for (let i = 0; i < frames; i++) {
    let target = null;
    let bestD = Infinity;
    for (const a of world.asteroids) {
      const d = (a.x - world.ship.x) ** 2 + (a.y - world.ship.y) ** 2;
      if (d < bestD) {
        bestD = d;
        target = a;
      }
    }
    const pointer = target
      ? { x: target.x, y: target.y, down: true, space: false }
      : { x: world.ship.x + 100, y: world.ship.y, down: true, space: false };
    updateWorld(world, scripted, pointer, silentAudio, 1 / 60);
  }
}

function stageShot(kind) {
  if (kind === 'title') {
    best = 8420;
    screen = 'title';
  } else if (kind === 'play') {
    stagePlayShot();
  } else if (kind === 'over') {
    stagePlayShot();
    world.score = 4860;
    world.wave = 4;
    world.salvage = 23;
    world.hull = 0;
    world.banner = null;
    world.bannerTimer = 0;
    result = {
      score: 4860, best: 5120, waves: 4, salvage: 23, time: 0.4,
      coinsEarned: 2140, foes: 87, automation: 5,
    };
    screen = 'over';
  } else if (kind === 'shop') {
    startRun(world);
    // A mid-run wallet: some cards affordable, some greyed out. Play a
    // few seconds first so the income rate in the header is a real number.
    world.coins = 420;
    world.coinsEarned = 420;
    buyAutomation(world, 'miner');
    buySkill(world, 'rapid');
    runScripted(world, 150);
    world.coins = 170;
    screen = 'shop';
  }
  render();
}

// Exposed for play-testing: the live state, readable from the console.
let frames = 0;
let fps = 0;
let fpsMark = performance.now();
let updateMs = 0;
let renderMs = 0;
let samples = 0;
window.__neon = {
  world,
  audio,
  input,
  get screen() {
    return screen;
  },
  get best() {
    return best;
  },
  get fps() {
    return fps;
  },
  get timings() {
    return {
      fps,
      updateMs: samples ? +(updateMs / samples).toFixed(2) : 0,
      renderMs: samples ? +(renderMs / samples).toFixed(2) : 0,
      samples,
    };
  },
};

input.attach();
if (shotMode) {
  stageShot(shotMode);
} else {
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    frames += 1;
    if (now - fpsMark >= 1000) {
      fps = Math.round((frames * 1000) / (now - fpsMark));
      frames = 0;
      fpsMark = now;
    }
    const u0 = performance.now();
    update(dt);
    const u1 = performance.now();
    render();
    const u2 = performance.now();
    updateMs += u1 - u0;
    renderMs += u2 - u1;
    samples += 1;
    input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
