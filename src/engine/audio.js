// 탄 생성음. 오디오 파일 없이 WebAudio로 그때그때 합성한다.
// (파일을 안 쓰므로 배포가 간단하고 저작권 문제가 없다. 모양·크기에 따라 음색과 높이가 달라진다.)
//
// 브라우저 정책상 사용자가 키를 누르거나 클릭하기 전에는 소리가 나지 않는다.
// 첫 입력에서 unlock()이 걸린다.

const PRESETS = {
  // type: 파형, f0 -> f1 로 dur초 동안 미끄러진다
  circle: { type: 'triangle', f0: 760, f1: 520, dur: 0.07, gain: 0.30 },
  orb:    { type: 'sine',     f0: 420, f1: 190,  dur: 0.20, gain: 0.55, sub: true },
  wedge:  { type: 'square',   f0: 1000, f1: 650, dur: 0.05, gain: 0.16 },
  rod:    { type: 'sawtooth', f0: 400, f1: 800, dur: 0.09, gain: 0.18 },

  bomb:   { type: 'sine',     f0: 300, f1: 40,  dur: 0.55, gain: 0.7, noise: 0.5 },
  death:  { type: 'sawtooth', f0: 420, f1: 60,  dur: 0.40, gain: 0.5, noise: 0.25 },
};

// 같은 소리가 이 간격보다 촘촘히 나면 건너뛴다 (연사할 때 귀가 아프지 않도록)
const MIN_GAP = 0.045;
const MAX_VOICES = 10;

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.5;
    this.voices = 0;
    this.last = new Map();
  }

  /** 첫 사용자 입력에서 호출된다. 그 전에는 소리를 낼 수 없다. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  /**
   * 탄 한 무더기가 생성됐을 때 한 번 호출한다 (탄 하나마다가 아니다).
   * count가 많을수록 조금 크고, size가 클수록 낮은 소리가 난다.
   */
  bullets(shape, count = 1, size = 3) {
    const preset = PRESETS[shape] ?? PRESETS.circle;
    const pitch = clamp(1.55 - size * 0.055, 0.6, 1.45);
    const loud = 0.55 + 0.45 * Math.min(1, count / 12);
    this.play(shape, preset, pitch, loud);
  }

  event(name) {
    const preset = PRESETS[name];
    if (preset) this.play(name, preset, 1, 1);
  }

  play(key, p, pitch = 1, loud = 1) {
    if (!this.ctx || this.muted || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const last = this.last.get(key) ?? -1;
    if (now - last < MIN_GAP) return;
    if (this.voices >= MAX_VOICES) return;
    this.last.set(key, now);

    const dur = p.dur;
    const g = this.ctx.createGain();
    g.connect(this.master);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(p.gain * loud, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    const osc = this.ctx.createOscillator();
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f0 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.f1 * pitch), now + dur);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + dur + 0.02);

    // 큰 탄은 한 옥타브 아래를 살짝 겹쳐 묵직하게
    let sub = null;
    if (p.sub) {
      sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(p.f0 * pitch * 0.5, now);
      sub.frequency.exponentialRampToValueAtTime(Math.max(20, p.f1 * pitch * 0.5), now + dur);
      const sg = this.ctx.createGain();
      sg.gain.value = 0.5;
      sub.connect(sg).connect(g);
      sub.start(now);
      sub.stop(now + dur + 0.02);
    }

    // 폭발음 등에 섞는 노이즈
    if (p.noise) {
      const len = Math.ceil(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const ng = this.ctx.createGain();
      ng.gain.value = p.noise;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      src.connect(lp).connect(ng).connect(g);
      src.start(now);
    }

    this.voices++;
    osc.onended = () => { this.voices--; };
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export const audio = new Audio();

// 첫 입력에서 오디오를 깨운다.
if (typeof window !== 'undefined') {
  const wake = () => audio.unlock();
  window.addEventListener('keydown', wake, { once: false });
  window.addEventListener('pointerdown', wake, { once: false });
}
