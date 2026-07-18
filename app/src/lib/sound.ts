// Tiny Web-Audio SFX kit. No asset files: every sound is synthesized, so it
// adds zero network weight and can't fail to load. Respects a persisted mute.

let ctx: AudioContext | null = null;
let muted = false;
let inited = false;

export function initSound() {
  if (inited || typeof window === "undefined") return;
  inited = true;
  try {
    muted = localStorage.getItem("sfx-muted") === "1";
  } catch {
    /* private mode */
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("sfx-muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  gain = 0.04,
  slideTo?: number
) {
  if (muted) return;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t);
  osc.stop(t + dur);
}

/** Soft UI tick for generic button presses. */
export const playClick = () => tone(430, 0.055, "triangle", 0.025);
/** Lighter tick for tab / segmented switches. */
export const playTab = () => tone(560, 0.05, "sine", 0.02);
/** Tiny tick for steppers / quick chips. */
export const playTick = () => tone(680, 0.035, "sine", 0.018);
/** Rising two-note chime for a completed action. */
export const playSuccess = () => {
  tone(523.25, 0.09, "sine", 0.045);
  setTimeout(() => tone(783.99, 0.13, "sine", 0.045), 85);
};
/** Bright three-note flourish for a win / big moment. */
export const playWin = () => {
  tone(523.25, 0.1, "triangle", 0.05);
  setTimeout(() => tone(659.25, 0.1, "triangle", 0.05), 90);
  setTimeout(() => tone(987.77, 0.18, "triangle", 0.05), 190);
};
/** Low descending blip for errors. */
export const playError = () => tone(200, 0.2, "sawtooth", 0.03, 120);
