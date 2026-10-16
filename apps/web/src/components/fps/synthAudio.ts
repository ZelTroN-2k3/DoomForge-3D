// Web Audio API procedural sound synthesizer for retro FPS (Doom style)
// Zero external files, zero latency, works completely offline.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/** Crisp, punchy shotgun blast with mechanical pump reload click */
export function playShotgunSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // 1. Noise blast (the gunpowder explosion)
  const bufferSize = ctx.sampleRate * 0.45;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    // Decaying white noise with punch
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3200, now);
  filter.frequency.exponentialRampToValueAtTime(180, now + 0.35);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.85, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);

  // 2. Low-end bass body punch
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.7, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);

  // 3. Pump mechanical reload sound after 0.28s
  const pumpTime = now + 0.28;
  const pumpOsc = ctx.createOscillator();
  pumpOsc.type = "sine";
  pumpOsc.frequency.setValueAtTime(600, pumpTime);
  pumpOsc.frequency.exponentialRampToValueAtTime(120, pumpTime + 0.08);

  const pumpGain = ctx.createGain();
  pumpGain.gain.setValueAtTime(0.25, pumpTime);
  pumpGain.gain.exponentialRampToValueAtTime(0.01, pumpTime + 0.12);

  pumpOsc.connect(pumpGain);
  pumpGain.connect(ctx.destination);
  pumpOsc.start(pumpTime);
  pumpOsc.stop(pumpTime + 0.12);
}

/** Snappy pistol shot */
export function playPistolSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const bufferSize = ctx.sampleRate * 0.2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1600, now);
  filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
}

/** Item pickup sound (retro ascending chime) */
export function playPickupSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const notes = [330, 440, 660, 880];
  notes.forEach((freq, idx) => {
    const noteTime = now + idx * 0.045;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, noteTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, noteTime);
    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(noteTime);
    osc.stop(noteTime + 0.12);
  });
}

/** Monster pain / hit sound */
export function playMonsterHitSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

/** Monster death roar */
export function playMonsterDeathSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.45);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.65, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}

/** Explosive barrel detonation */
export function playExplosionSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const bufferSize = ctx.sampleRate * 0.9;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.25));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(80, now + 0.7);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1.0, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.85);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);

  // Sub bass boom
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(120, now);
  sub.frequency.exponentialRampToValueAtTime(28, now + 0.6);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.8, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  sub.connect(subGain);
  subGain.connect(ctx.destination);
  sub.start(now);
  sub.stop(now + 0.6);
}

/** Empty weapon click */
export function playDryFireSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.03);
}

/** Player jump grunt / woosh */
export function playJumpSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(260, now + 0.12);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}
