// Neon Salvage — procedural WebAudio sounds.
// Every sound is synthesized with oscillators and filtered noise, so the
// game ships no audio files and makes no network requests. The AudioContext
// is created lazily on the first user gesture (unlock), and every effect is
// a no-op until then.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  function tone({ type = 'sine', from = 440, to = null, duration = 0.12, volume = 0.5, delay = 0 }) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const start = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function noiseBurst({ duration = 0.3, volume = 0.5, filterFrom = 1200, filterTo = 120 }) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const start = ac.currentTime;
    const length = Math.max(1, Math.floor(ac.sampleRate * duration));
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterTo), start + duration);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  return {
    // Call from a user gesture (start, click) so sound is allowed.
    unlock() {
      ensure();
    },

    shoot() {
      tone({ type: 'square', from: 880, to: 320, duration: 0.08, volume: 0.16 });
    },

    pickup(combo) {
      const step = Math.min(combo, 8);
      const base = 520 * Math.pow(1.059, step);
      tone({ type: 'sine', from: base, duration: 0.09, volume: 0.3 });
      tone({ type: 'sine', from: base * 1.5, duration: 0.14, volume: 0.25, delay: 0.06 });
    },

    explosion(big) {
      noiseBurst({ duration: big ? 0.55 : 0.3, volume: big ? 0.6 : 0.35, filterFrom: big ? 900 : 1400 });
      tone({ type: 'sine', from: 160, to: 40, duration: big ? 0.5 : 0.3, volume: 0.4 });
    },

    hit() {
      noiseBurst({ duration: 0.25, volume: 0.5, filterFrom: 2000, filterTo: 200 });
      tone({ type: 'sawtooth', from: 220, to: 55, duration: 0.25, volume: 0.3 });
    },

    powerup() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        tone({ type: 'triangle', from: freq, duration: 0.16, volume: 0.28, delay: i * 0.07 });
      });
    },

    waveClear() {
      [392, 523, 659].forEach((freq, i) => {
        tone({ type: 'triangle', from: freq, duration: 0.2, volume: 0.25, delay: i * 0.09 });
      });
    },

    gameOver() {
      [330, 262, 196, 131].forEach((freq, i) => {
        tone({ type: 'triangle', from: freq, duration: 0.32, volume: 0.3, delay: i * 0.16 });
      });
    },

    toggleMute() {
      muted = !muted;
      return muted;
    },

    isMuted() {
      return muted;
    },
  };
}
