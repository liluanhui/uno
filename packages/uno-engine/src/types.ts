export type CardColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
export type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Card {
  id: string;
  color: CardColor;
  kind: CardKind;
  value?: number;
}

export interface HouseRules {
  /** 被加牌时可用 +2/+4 顺延惩罚 */
  stackDraw: boolean;
  /** 7 换手牌、0 全员平移 */
  sevenZero: boolean;
  /** 摸牌一直摸到能出为止（默认只摸 1 张） */
  drawUntilPlayable: boolean;
  /** 最后一张不能是功能牌 */
  lastCardNoAction: boolean;
}

export interface PlayerMeta {
  id: string;
  name: string;
  isAi: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  isAi: boolean;
  hand: Card[];
  calledUno: boolean;
  connected: boolean;
}

export type GamePhase = 'playing' | 'settled';

export type GameEvent =
  | { type: 'cardPlayed'; playerId: string; card: Card; chosenColor?: CardColor }
  | { type: 'cardDrawn'; playerId: string; count: number }
  | { type: 'turn'; playerId: string }
  | { type: 'skip'; playerId: string }
  | { type: 'reverse'; direction: 1 | -1 }
  | { type: 'pendingDraw'; count: number }
  | { type: 'unoCalled'; playerId: string }
  | { type: 'unoCaught'; catcherId: string; targetId: string }
  | { type: 'handSwapped'; aId: string; bId: string }
  | { type: 'handsRotated' }
  | { type: 'colorChosen'; color: CardColor }
  | { type: 'settled'; winnerId: string; scores: Record<string, number> };
