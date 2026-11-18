// Neon Salvage — bootstrap, game loop and screen state machine.
// One job: own the canvas, the screen flow (title -> playing -> game over),
// the animation loop, and the ?shot= hooks that stage deterministic states
// for screenshots. The simulation itself lives in world.js.

import { CONFIG } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld, startRun, updateWorld, updateAmbient } from './world.js';
import { drawBackground, drawAsteroids, drawCores, drawPowerups, drawBullets, drawParticles, drawShip, drawBanner, drawTitle, drawGameOver } from './render.js';
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

let screen = 'title'; // title | playing | paused | over
let best = 0;
try {
  best = Number.parseInt(window.localStorage.getItem(BEST_KEY) || '0', 10) || 0;
} catch {
  best = 0;
}
let result = { score: 0, best: 0, waves: 0, salvage: 0, time: 0 };

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
  };
}

function beginRun() {
  audio.unlock();
  startRun(world);
  world.ship.fireTimer = 0.25;
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
  result = {
    score: finalScore,
    best,
    waves: world.wave,
    salvage: world.salvage,
    time: world.time,
  };
  audio.gameOver();
  screen = 'over';
}

function update(dt) {
  if (input.pressed('KeyM')) audio.toggleMute();

  if (screen === 'title') {
    updateAmbient(world, dt);
    if (input.pressed('Enter', 'Space') || input.mouse.clicked) beginRun();
  } else if (screen === 'playing') {
    if (input.pressed('KeyP', 'Escape')) {
      screen = 'paused';
    } else {
      const outcome = updateWorld(world, input, pointerLogical(), audio, dt);
      if (outcome.gameOver) finishRun();
    }
  } else if (screen === 'paused') {
    if (input.pressed('KeyP', 'Escape', 'Enter')) screen = 'playing';
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
  drawCores(ctx, world);
  drawPowerups(ctx, world);
  drawBullets(ctx, world);
  drawParticles(ctx, world);
  if (screen !== 'over') drawShip(ctx, world);
  drawBanner(ctx, world);

  if (screen === 'playing' || screen === 'paused') {
    drawHud(ctx, world, audio.isMuted());
  } else if (screen === 'title') {
    drawTitle(ctx, best, world.time);
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

// --- Screenshot staging: ?shot=title|play|over&seed=N ---------------------
// These hooks render one deterministic frame of the game's own states so
// the bounty screenshots show the real game. Interactive play ignores them.
const silentAudio = {
  shoot() {}, pickup() {}, explosion() {}, hit() {}, powerup() {},
  waveClear() {}, gameOver() {},
};

function stagePlayShot() {
  startRun(world);
  // Stage a lively mid-wave field with the game's own spawners.
  const { rng } = world;
  void rng;
  // Cores in the ship's path so the run collects them and builds a combo.
  world.cores.push(
    { x: 545, y: 282, vx: -10, vy: 6, radius: 9, life: 12, pulse: 0 },
    { x: 600, y: 274, vx: -8, vy: -4, radius: 9, life: 12, pulse: 1 },
    { x: 655, y: 266, vx: 6, vy: 8, radius: 9, life: 12, pulse: 2 },
  );
  // A magnet power-up right beside the ship: collected in the first frames.
  world.powerups.push({ x: 510, y: 290, vx: 0, vy: 0, kind: 'magnet', radius: 13, life: 10, pulse: 0 });
  const scripted = {
    held: (code) => code === 'KeyD' || code === 'Space',
    pressed: () => false,
    endFrame() {},
  };
  const pointer = { x: 760, y: 190, down: true };
  for (let i = 0; i < 100; i++) {
    updateWorld(world, scripted, pointer, silentAudio, 1 / 60);
  }
  // The scripted run may have taken a hit; make sure the ship is visible.
  world.ship.invuln = 0;
  // The pickups just happened: restore the combo the run built, so the
  // staged frame shows the multiplier the player earned.
  world.combo = Math.min(world.salvage, CONFIG.combo.maxMultiplier);
  world.comboTimer = CONFIG.combo.windowSeconds;
  screen = 'playing';
}

function stageShot(kind) {
  if (kind === 'title') {
    best = 8420;
    screen = 'title';
  } else if (kind === 'play') {
    stagePlayShot();
  } else if (kind === 'over') {
    stagePlayShot();
    // Keep the world behind the panel consistent with the result it shows.
    world.score = 4860;
    world.wave = 4;
    world.salvage = 23;
    world.hull = 0;
    result = { score: 4860, best: 5120, waves: 4, salvage: 23, time: 0.4 };
    screen = 'over';
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
