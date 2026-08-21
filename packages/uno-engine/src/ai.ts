import type { UnoGame } from './engine';
import type { Card, PlayerState, RealColor } from './types';
import { GameError } from './types';

export type AiLevel = 'easy' | 'normal';

export type AiAction =
  | { kind: 'play'; cardId: string; chosenColor?: RealColor; targetPlayerId?: string }
  | { kind: 'draw' }
  | { kind: 'pass' };

/** 为指定玩家生成 AI 决策 */
export function aiChoose(
  game: UnoGame,
  playerId: string,
  level: AiLevel = 'normal',
  rng: () => number = Math.random,
): AiAction {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) throw new GameError('player_not_found', '玩家不存在');
  const playable = player.hand.filter((c) => game.canPlay(c));

  if (game.pendingDraw > 0) {
    if (game.rules.stackDraw && playable.length > 0) {
      return playDecision(game, player, playable, level, rng);
    }
    return { kind: 'draw' };
  }
  if (playable.length === 0) {
    if (game.drewThisTurn) return { kind: 'pass' };
    return { kind: 'draw' };
  }
  return playDecision(game, player, playable, level, rng);
}

function playDecision(
  game: UnoGame,
  player: PlayerState,
  playable: Card[],
  level: AiLevel,
  rng: () => number,
): AiAction {
  const card = level === 'easy' ? playable[Math.floor(rng() * playable.length)] : pickBest(game, player, playable);
  const chosenColor =
    card.color === 'wild' ? dominantColor(player.hand.filter((c) => c.id !== card.id), rng) : undefined;
  let targetPlayerId: string | undefined;
  if (game.rules.sevenZero && card.kind === 'number' && card.value === 7 && player.hand.length > 1) {
    const others = game.players.filter((p) => p.id !== player.id);
    if (others.length > 0) {
      targetPlayerId = others.reduce((min, p) => (p.hand.length < min.hand.length ? p : min), others[0]).id;
    }
  }
  return { kind: 'play', cardId: card.id, chosenColor, targetPlayerId };
}

function pickBest(game: UnoGame, player: PlayerState, playable: Card[]): Card {
  // 对手只剩 1 张时优先攻击（双人局 reverse 等同 skip，也算攻击牌）
  const threat = game.players.some((p) => p.id !== player.id && p.hand.length === 1);
  if (threat) {
    const twoPlayer = game.players.length === 2;
    const attack =
      playable.find((c) => c.kind === 'wild4') ||
      playable.find((c) => c.kind === 'draw2') ||
      playable.find((c) => c.kind === 'skip') ||
      (twoPlayer ? playable.find((c) => c.kind === 'reverse') : undefined);
    if (attack) return attack;
  }
  // 优先出数字牌，其次普通功能牌，万能牌留后手；同组内出手牌最多的颜色
  const numbers = playable.filter((c) => c.kind === 'number');
  const actions = playable.filter((c) => c.kind === 'skip' || c.kind === 'reverse' || c.kind === 'draw2');
  const wilds = playable.filter((c) => c.color === 'wild');
  const pool = numbers.length > 0 ? numbers : actions.length > 0 ? actions : wilds;
  if (pool.length === 0) return playable[0];
  const count: Record<string, number> = {};
  for (const c of player.hand) {
    if (c.color !== 'wild') count[c.color] = (count[c.color] || 0) + 1;
  }
  return pool.reduce((best, c) => ((count[c.color] || 0) > (count[best.color] || 0) ? c : best), pool[0]);
}

function dominantColor(hand: Card[], rng: () => number): RealColor {
  const count: Record<string, number> = {};
  for (const c of hand) {
    if (c.color !== 'wild') count[c.color] = (count[c.color] || 0) + 1;
  }
  const entries = Object.entries(count);
  if (entries.length === 0) {
    const colors: RealColor[] = ['red', 'yellow', 'green', 'blue'];
    return colors[Math.floor(rng() * 4)];
  }
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0] as RealColor;
}
