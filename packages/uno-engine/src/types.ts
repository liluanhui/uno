export type RealColor = 'red' | 'yellow' | 'green' | 'blue';
export type CardColor = RealColor | 'wild';
export type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

/**
 * 可辨识联合：编译期消灭非法卡牌组合
 *  - 数字牌：RealColor + value
 *  - 功能牌：RealColor，无 value
 *  - 万能牌：color 固定 'wild'
 */
export type Card =
  | { id: string; color: RealColor; kind: 'number'; value: number }
  | { id: string; color: RealColor; kind: 'skip' | 'reverse' | 'draw2' }
  | { id: string; color: 'wild'; kind: 'wild' | 'wild4' };

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
  | { type: 'cardPlayed'; playerId: string; card: Card }
  | { type: 'cardDrawn'; playerId: string; count: number }
  | { type: 'turn'; playerId: string }
  | { type: 'skip'; playerId: string }
  | { type: 'reverse'; direction: 1 | -1 }
  | { type: 'pendingDraw'; count: number }
  | { type: 'unoCalled'; playerId: string }
  | { type: 'unoCaught'; catcherId: string; targetId: string }
  | { type: 'handSwapped'; aId: string; bId: string }
  | { type: 'handsRotated' }
  | { type: 'colorChosen'; color: RealColor }
  | { type: 'settled'; winnerId: string | null };

/** 引擎抛出的业务错误，附带稳定 code 供消费方分支处理 */
export class GameError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'GameError';
  }
}
