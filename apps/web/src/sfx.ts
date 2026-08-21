import { ref } from 'vue';

/**
 * 游戏音效：全部用 Web Audio API 现场合成，零音频资源、首屏即用。
 * 首次用户交互时解锁（浏览器自动播放策略），静音状态写入 localStorage。
 */

const mutedRef = ref(localStorage.getItem('uno.muted') === '1');

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // 预生成 1s 白噪声，供 whoosh / 洗牌复用
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buf;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// 首次交互解锁音频上下文
if (typeof window !== 'undefined') {
  const unlock = () => ensure();
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
}

export const muted = mutedRef;

export function toggleMute() {
  mutedRef.value = !mutedRef.value;
  localStorage.setItem('uno.muted', mutedRef.value ? '1' : '0');
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  endFreq?: number;
  attack?: number;
}

function tone(freq: number, start: number, dur: number, o: ToneOpts = {}) {
  const c = ensure();
  if (!c || !master || mutedRef.value) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.endFreq), t0 + dur);
  const peak = o.gain ?? 0.28;
  const atk = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

interface NoiseOpts {
  type?: BiquadFilterType;
  freq?: number;
  endFreq?: number;
  gain?: number;
  q?: number;
}

function noise(start: number, dur: number, o: NoiseOpts = {}) {
  const c = ensure();
  if (!c || !master || !noiseBuffer || mutedRef.value) return;
  const t0 = c.currentTime + start;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filt = c.createBiquadFilter();
  filt.type = o.type ?? 'bandpass';
  filt.frequency.setValueAtTime(o.freq ?? 1200, t0);
  if (o.endFreq) filt.frequency.exponentialRampToValueAtTime(Math.max(1, o.endFreq), t0 + dur);
  filt.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  const peak = o.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.03);
}

const COLOR_FREQ: Record<string, number> = {
  red: 440,
  yellow: 587,
  green: 392,
  blue: 330,
  wild: 466,
};

/** 出牌：拍桌噪声"啪" + 三角波音色，音高随颜色变化 */
export function playCard(card?: { color?: string; kind?: string }) {
  if (mutedRef.value) return;
  ensure();
  const base = COLOR_FREQ[card?.color || 'wild'] ?? 440;
  const kind = card?.kind || 'number';
  noise(0, 0.05, { type: 'bandpass', freq: 2200, q: 1.2, gain: 0.18 });
  if (kind === 'wild' || kind === 'wild4') {
    tone(base, 0.01, 0.16, { type: 'triangle', gain: 0.22 });
    tone(base * 1.5, 0.06, 0.16, { type: 'triangle', gain: 0.16 });
  } else if (kind === 'skip' || kind === 'reverse' || kind === 'draw2') {
    tone(base, 0.01, 0.14, { type: 'triangle', gain: 0.26 });
    tone(base / 2, 0.05, 0.12, { type: 'square', gain: 0.1 });
  } else {
    tone(base, 0.01, 0.13, { type: 'triangle', gain: 0.26 });
  }
}

/** 摸牌："唰"的上扫噪声 + 低音轻推 */
export function draw() {
  if (mutedRef.value) return;
  noise(0, 0.18, { type: 'bandpass', freq: 500, endFreq: 1800, q: 0.9, gain: 0.22 });
  tone(220, 0.02, 0.14, { type: 'sine', gain: 0.12, endFreq: 330 });
}

/** 喊 UNO：上行小号式三连 + 高音收束 */
export function uno() {
  if (mutedRef.value) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.18, { type: 'square', gain: 0.22 }));
}

/** 抓 UNO：两声低沉蜂鸣（"逮到了"） */
export function catchUno() {
  if (mutedRef.value) return;
  tone(196, 0, 0.16, { type: 'square', gain: 0.22 });
  tone(147, 0.14, 0.22, { type: 'square', gain: 0.22 });
}

/** 胜利：明亮上行琶音 */
export function win() {
  if (mutedRef.value) return;
  [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.22, { type: 'triangle', gain: 0.24 }));
}

/** 失败 / 平局：柔和下行收束 */
export function lose() {
  if (mutedRef.value) return;
  tone(440, 0, 0.22, { type: 'sine', gain: 0.22 });
  tone(330, 0.18, 0.3, { type: 'sine', gain: 0.22 });
}

/** 错误：两声低频蜂鸣 */
export function error() {
  if (mutedRef.value) return;
  tone(180, 0, 0.14, { type: 'square', gain: 0.18 });
  tone(150, 0.12, 0.18, { type: 'square', gain: 0.18 });
}

/** 洗牌发牌：几声随机"咔哒" */
export function deal() {
  if (mutedRef.value) return;
  for (let i = 0; i < 6; i++) {
    noise(i * 0.09, 0.05, { type: 'bandpass', freq: 1600 + Math.random() * 1200, q: 1.5, gain: 0.12 });
    tone(120 + Math.random() * 80, i * 0.09, 0.05, { type: 'square', gain: 0.05 });
  }
}

/** 轮到你：柔和提示音 */
export function turn() {
  if (mutedRef.value) return;
  tone(660, 0, 0.22, { type: 'sine', gain: 0.16 });
  tone(990, 0.06, 0.18, { type: 'sine', gain: 0.1 });
}

/** 加牌惩罚（+2/+4 叠加） */
export function penalty() {
  if (mutedRef.value) return;
  tone(160, 0, 0.16, { type: 'square', gain: 0.2 });
  tone(880, 0.1, 0.12, { type: 'square', gain: 0.12 });
}

export function skip() {
  if (mutedRef.value) return;
  noise(0, 0.1, { type: 'bandpass', freq: 2000, endFreq: 800, q: 1, gain: 0.16 });
}

/** 反转：先下后上的小回旋 */
export function reverse() {
  if (mutedRef.value) return;
  tone(700, 0, 0.1, { type: 'triangle', gain: 0.18, endFreq: 400 });
  tone(400, 0.09, 0.12, { type: 'triangle', gain: 0.18, endFreq: 700 });
}

/** 换手 / 平移：两声交替 */
export function swap() {
  if (mutedRef.value) return;
  tone(660, 0, 0.1, { type: 'triangle', gain: 0.2 });
  tone(440, 0.08, 0.12, { type: 'triangle', gain: 0.2 });
}

export function colorChosen() {
  if (mutedRef.value) return;
  tone(523, 0, 0.16, { type: 'sine', gain: 0.16 });
}

/** 把一帧 game:state 的 events 映射成音效（单一真相源，我/对手动作都经此） */
export function playEvents(events: unknown[], myId: string) {
  if (mutedRef.value) return;
  for (const raw of events || []) {
    const e = raw as { type?: string; playerId?: string; card?: { color?: string; kind?: string }; count?: number; winnerId?: string | null };
    if (!e || typeof e.type !== 'string') continue;
    switch (e.type) {
      case 'cardPlayed':
        playCard(e.card);
        break;
      case 'cardDrawn':
        draw();
        break;
      case 'turn':
        if (e.playerId === myId) turn();
        break;
      case 'skip':
        skip();
        break;
      case 'reverse':
        reverse();
        break;
      case 'pendingDraw':
        if ((e.count ?? 0) > 0) penalty();
        break;
      case 'unoCaught':
        catchUno();
        break;
      case 'colorChosen':
        colorChosen();
        break;
      case 'handSwapped':
      case 'handsRotated':
        swap();
        break;
      case 'settled':
        if (e.winnerId && e.winnerId === myId) win();
        else lose();
        break;
      // unoCalled 不在此处理，由 game:uno 广播统一播 fanfare，避免重复
    }
  }
}
