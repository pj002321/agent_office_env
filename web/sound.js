// Sound engine: built-in generative BGM (Web Audio, no files), synthesized UI SFX,
// and playback of user music files. Everything is OFF by default.
const KEY = 'agent-office:sound';
const PERSIST = ['bgm', 'sfx', 'vol', 'sfxVol', 'track'];

export const state = { bgm: false, sfx: false, vol: 0.5, sfxVol: 0.6, track: 'builtin', tracks: [], playing: false, error: null };
try { Object.assign(state, pick(JSON.parse(localStorage.getItem(KEY) || '{}'))); } catch {}

const subs = new Set();
function pick(o) { return Object.fromEntries(PERSIST.filter(k => k in o).map(k => [k, o[k]])); }
function emit() {
  try { localStorage.setItem(KEY, JSON.stringify(pick(state))); } catch {}
  subs.forEach(cb => cb(state));
}
const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));

// ---- audio graph: [bgm buses, sfx bus] -> compressor -> master -> out ----
let ctx, comp, sfxBus;
function ac() {
  if (ctx) return ctx;
  ctx = new AudioContext();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  const master = ctx.createGain();
  master.gain.value = 0.8;
  comp.connect(master).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = state.sfxVol;
  sfxBus.connect(comp);
  return ctx;
}
function ramp(param, v, sec) {
  const n = ctx.currentTime;
  param.cancelScheduledValues(n);
  param.setValueAtTime(param.value, n);
  param.linearRampToValueAtTime(v, n + sec);
}
const hz = m => 440 * 2 ** ((m - 69) / 12);

// One enveloped oscillator. `to` = optional pitch glide target.
function tone(freq, t, dur, { type = 'sine', gain = 0.2, attack = 0.005, to, dest = sfxBus } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

// ---- built-in BGM: Cmaj7 - Am7 - Fmaj7 - G at 72 BPM, 2 bars per chord ----
const STEP = 60 / 72 / 2; // eighth note
const CHORDS = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]];
const PENTA = [72, 74, 76, 79, 81, 84]; // C major pentatonic: consonant over every chord
const LEVEL = 0.7;

function builtin() {
  const c = ac();
  const bus = c.createGain(); bus.gain.value = 0; bus.connect(comp);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(bus);
  // cheap "reverb": filtered feedback delay
  const dly = c.createDelay(), fb = c.createGain(), wet = c.createGain(), damp = c.createBiquadFilter();
  dly.delayTime.value = 0.36; fb.gain.value = 0.35; wet.gain.value = 0.3;
  damp.type = 'lowpass'; damp.frequency.value = 1400;
  lp.connect(dly).connect(damp).connect(fb).connect(dly);
  damp.connect(wet).connect(bus);

  let step = 0, last = -1, t = c.currentTime + 0.1;
  const note = (s, t) => {
    const chord = CHORDS[Math.floor(s / 16) % 4], i = s % 16;
    if (i === 0) chord.forEach(m => tone(hz(m), t, STEP * 16, { type: 'triangle', attack: 1.5, gain: 0.03, dest: lp }));
    if (i % 8 === 0) tone(hz(chord[0] - 12), t, 2.5, { attack: 0.04, gain: 0.12, dest: lp });
    if (Math.random() < (i % 2 ? 0.2 : 0.5)) {
      let m; do m = PENTA[Math.floor(Math.random() * PENTA.length)]; while (m === last);
      last = m;
      const at = t + Math.random() * 0.02, g = 0.05 + Math.random() * 0.03; // humanize
      tone(hz(m), at, 1.4, { gain: g, dest: lp });
      tone(hz(m) * 2, at, 0.4, { gain: g * 0.25, dest: lp }); // music-box shimmer
    }
  };
  const timer = setInterval(() => {
    if (t < c.currentTime) t = c.currentTime + 0.05; // skip notes missed while throttled
    while (t < c.currentTime + 0.15) { note(step++, t); t += STEP; }
  }, 25);
  ramp(bus.gain, state.vol * LEVEL, 1);
  return {
    setVol: v => ramp(bus.gain, v * LEVEL, 0.1),
    stop() { ramp(bus.gain, 0, 1); setTimeout(() => { clearInterval(timer); bus.disconnect(); }, 1100); },
  };
}

// ---- user file track: volume stepped directly (file:// + MediaElementSource can go silent) ----
function file(track) {
  const el = new Audio(track.url);
  el.loop = true; el.volume = 0;
  let fader;
  const fade = (to, ms, done) => {
    clearInterval(fader);
    const from = el.volume, t0 = performance.now();
    fader = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = from + (to - from) * k;
      if (k === 1) { clearInterval(fader); done?.(); }
    }, 30);
  };
  const inst = {
    setVol: v => fade(v, 100),
    stop() { el.onerror = null; fade(0, 1000, () => { el.pause(); el.removeAttribute('src'); el.load(); }); },
  };
  const fail = () => {
    if (cur !== inst) return;
    inst.stop();
    state.track = 'builtin';
    state.error = '음악 파일을 재생할 수 없어요. 기본 음악으로 바꿀게요.';
    play();
  };
  el.onerror = fail;
  el.play().then(() => fade(state.vol, 1000), fail);
  return inst;
}

// ---- playback control ----
let cur = null;
function play() {
  cur?.stop();
  const t = state.tracks.find(x => x.id === state.track);
  cur = t ? file(t) : builtin();
  cur.id = t ? t.id : 'builtin';
  state.playing = true;
  emit();
}
function stop() {
  cur?.stop(); cur = null;
  state.playing = false;
  emit();
}

export function setBgm(on) { state.bgm = !!on; on ? play() : stop(); }
export function setSfx(on) { state.sfx = !!on; emit(); }
export function setVolume(v) { state.vol = clamp(v); cur?.setVol(state.vol); emit(); }
export function setSfxVolume(v) { state.sfxVol = clamp(v); if (sfxBus) ramp(sfxBus.gain, state.sfxVol, 0.05); emit(); }
export function setTrack(id) {
  state.track = id === 'builtin' || state.tracks.some(t => t.id === id) ? id : 'builtin';
  state.error = null;
  state.bgm ? play() : emit();
}
export function setTracks(list) {
  state.tracks = Array.isArray(list) ? list : [];
  if (state.track !== 'builtin' && !state.tracks.some(t => t.id === state.track)) setTrack('builtin');
  else if (state.bgm && cur && cur.id !== state.track) play(); // saved user track became available
  else emit();
}
export function onChange(cb) { subs.add(cb); return () => subs.delete(cb); }

// ---- SFX ----
const SFX = {
  click: t => tone(820, t, 0.06, { type: 'triangle', to: 420, gain: 0.22 }),
  open: t => { tone(660, t, 0.18, { gain: 0.14 }); tone(990, t + 0.08, 0.25, { gain: 0.12 }); },
  coin: t => { tone(988, t, 0.08, { type: 'triangle', gain: 0.14 }); tone(1319, t + 0.07, 0.28, { type: 'triangle', gain: 0.14 }); },
  buy: t => [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.05, 0.18, { gain: 0.1 })),
  done: t => [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.1, i === 2 ? 0.45 : 0.2, { gain: 0.13 })),
  ask: t => { tone(520, t, 0.12, { to: 700, gain: 0.15 }); tone(520, t + 0.16, 0.12, { to: 780, gain: 0.15 }); },
};
export function sfx(name) {
  if (!state.sfx || !SFX[name]) return;
  ac();
  if (ctx.state === 'suspended') ctx.resume();
  SFX[name](ctx.currentTime + 0.01);
}

// ---- global hooks ----
document.addEventListener('pointerdown', e => {
  if (ctx?.state === 'suspended') ctx.resume();
  const b = e.target.closest?.('button');
  if (b && !b.disabled && !b.hasAttribute('data-nosfx')) sfx('click');
}, true);

if (state.bgm) play();
