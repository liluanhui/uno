import type { Card, RealColor } from './types';

let uidCounter = 0;

function mkNumber(color: RealColor, value: number): Card {
  return { id: `${color}-number-${value}-${uidCounter++}`, color, kind: 'number', value };
}

function mkAction(color: RealColor, kind: 'skip' | 'reverse' | 'draw2'): Card {
  return { id: `${color}-${kind}-${uidCounter++}`, color, kind };
}

function mkWild(kind: 'wild' | 'wild4'): Card {
  return { id: `wild-${kind}-${uidCounter++}`, color: 'wild', kind };
}

const COLORS: RealColor[] = ['red', 'yellow', 'green', 'blue'];

/** 标准 108 张牌组 */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const color of COLORS) {
    cards.push(mkNumber(color, 0));
    for (let v = 1; v <= 9; v++) {
      cards.push(mkNumber(color, v));
      cards.push(mkNumber(color, v));
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      cards.push(mkAction(color, kind));
      cards.push(mkAction(color, kind));
    }
  }
  for (let i = 0; i < 4; i++) {
    cards.push(mkWild('wild'));
    cards.push(mkWild('wild4'));
  }
  return cards;
}

/** Fisher–Yates 洗牌；rng()=1.0 时做越界防御 */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(Math.floor(rng() * (i + 1)), i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const COLORS_LIST = COLORS;
