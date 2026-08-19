import { Card, CardColor } from './types';

const COLORS: CardColor[] = ['red', 'yellow', 'green', 'blue'];
let uidCounter = 0;

function mk(color: CardColor, kind: Card['kind'], value?: number): Card {
  return { id: `${color}-${kind}-${value ?? 'x'}-${uidCounter++}`, color, kind, value };
}

/** 标准 108 张牌组 */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const color of COLORS) {
    cards.push(mk(color, 'number', 0));
    for (let v = 1; v <= 9; v++) {
      cards.push(mk(color, 'number', v));
      cards.push(mk(color, 'number', v));
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      cards.push(mk(color, kind));
      cards.push(mk(color, kind));
    }
  }
  for (let i = 0; i < 4; i++) {
    cards.push(mk('wild', 'wild'));
    cards.push(mk('wild', 'wild4'));
  }
  return cards;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 计分：数字牌面值，功能牌 20，万能牌 50 */
export function cardPoints(card: Card): number {
  if (card.kind === 'number') return card.value ?? 0;
  if (card.kind === 'wild' || card.kind === 'wild4') return 50;
  return 20;
}

export const COLORS_LIST = COLORS;
