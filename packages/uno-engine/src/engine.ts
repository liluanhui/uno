import { Card, GameError, GameEvent, GamePhase, HouseRules, PlayerMeta, PlayerState, RealColor } from './types';
import { createDeck, shuffle } from './deck';
import { aiChoose, AiLevel } from './ai';

export const DEFAULT_RULES: HouseRules = {
  stackDraw: true,
  sevenZero: false,
  drawUntilPlayable: false,
  lastCardNoAction: false,
};

const VALID_COLORS: RealColor[] = ['red', 'yellow', 'green', 'blue'];

export class UnoGame {
  phase: GamePhase = 'playing';
  players: PlayerState[];
  drawPile: Card[] = [];
  discardPile: Card[] = [];
  activeColor!: RealColor;
  direction: 1 | -1 = 1;
  currentIdx = 0;
  pendingDraw = 0;
  rules: HouseRules;
  /** 当前回合玩家本回合是否已摸过牌 */
  drewThisTurn = false;
  turn = 0;
  winnerId: string | null = null;

  constructor(metas: PlayerMeta[], rules: HouseRules = DEFAULT_RULES, rng: () => number = Math.random) {
    this.rules = { ...rules };
    this.players = metas.map((m) => ({
      id: m.id,
      name: m.name,
      isAi: m.isAi,
      hand: [],
      calledUno: false,
      connected: true,
    }));
    const deck = shuffle(createDeck(), rng);
    for (let r = 0; r < 7; r++) {
      for (const p of this.players) p.hand.push(deck.pop()!);
    }
    // 翻出的首张不能是万能牌
    const wilds: Card[] = [];
    let first = deck.pop()!;
    while (first.color === 'wild') {
      wilds.push(first);
      first = deck.pop()!;
    }
    deck.push(...wilds);
    this.drawPile = deck;
    this.discardPile.push(first);
    // while 循环已保证 first 非万能牌
    this.activeColor = first.color as RealColor;
  }

  get current(): PlayerState {
    return this.players[this.currentIdx];
  }

  get top(): Card {
    return this.discardPile[this.discardPile.length - 1];
  }

  find(playerId: string): PlayerState {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new GameError('player_not_found', '玩家不存在');
    return p;
  }

  /** 判断一张牌在当前局面下是否可出 */
  canPlay(card: Card): boolean {
    if (this.pendingDraw > 0) {
      if (!this.rules.stackDraw) return false;
      return card.kind === 'draw2' || card.kind === 'wild4';
    }
    if (card.color === 'wild') return true;
    if (card.color === this.activeColor) return true;
    const top = this.top;
    if (card.kind === 'number' && top.kind === 'number') return card.value === top.value;
    if (card.kind !== 'number' && card.kind === top.kind) return true;
    return false;
  }

  playableCards(playerId: string): Card[] {
    const p = this.find(playerId);
    return p.hand.filter((c) => this.canPlay(c));
  }

  /** 出牌；万能牌需带 chosenColor，房规七换零需带 targetPlayerId */
  playCard(playerId: string, cardId: string, chosenColor?: RealColor, targetPlayerId?: string): GameEvent[] {
    this.assertPlaying();
    if (this.current.id !== playerId) throw new GameError('not_your_turn', '还没轮到你');
    const player = this.find(playerId);
    const ci = player.hand.findIndex((c) => c.id === cardId);
    if (ci < 0) throw new GameError('card_not_in_hand', '手牌里没有这张牌');
    const card = player.hand[ci];
    if (!this.canPlay(card)) throw new GameError('illegal_card', '这张牌现在不能出');
    // 万能牌必须选合法颜色：校验通过后 chosenColor 在本函数内视为已确定
    const chosen = card.color === 'wild' ? this.resolveWildColor(chosenColor) : null;
    if (this.rules.lastCardNoAction && player.hand.length === 1 && card.kind !== 'number') {
      throw new GameError('last_card_action', '按房规，最后一张不能是功能牌');
    }
    const sevenSwap =
      this.rules.sevenZero && card.kind === 'number' && card.value === 7 && player.hand.length > 1;
    if (sevenSwap) {
      if (!targetPlayerId) throw new GameError('target_required', '请选择换牌对象');
      if (targetPlayerId === playerId) throw new GameError('bad_target', '不能和自己换牌');
      this.find(targetPlayerId);
    }

    const events: GameEvent[] = [];
    player.hand.splice(ci, 1);
    this.discardPile.push(card);
    events.push({ type: 'cardPlayed', playerId, card });

    if (card.color === 'wild') {
      // chosen 已由 resolveWildColor 校验为合法颜色
      this.activeColor = chosen!;
      events.push({ type: 'colorChosen', color: chosen! });
    } else {
      this.activeColor = card.color;
    }
    if (player.hand.length > 1) player.calledUno = false;

    if (player.hand.length === 0) {
      this.settle(player.id, events);
      return events;
    }

    // 房规：七换零
    if (this.rules.sevenZero) {
      if (sevenSwap) {
        const target = this.find(targetPlayerId!);
        const tmp = player.hand;
        player.hand = target.hand;
        target.hand = tmp;
        // 被动获得手牌的玩家无需喊 UNO（不是自己出到 1 张）
        for (const p of [player, target]) {
          if (p.hand.length === 1) p.calledUno = true;
          else if (p.hand.length > 1) p.calledUno = false;
        }
        events.push({ type: 'handSwapped', aId: player.id, bId: target.id });
      } else if (card.kind === 'number' && card.value === 0 && this.players.length > 1) {
        const hands = this.players.map((p) => p.hand);
        if (this.direction === 1) {
          const last = hands.pop()!;
          hands.unshift(last);
        } else {
          const first = hands.shift()!;
          hands.push(first);
        }
        this.players.forEach((p, i) => {
          p.hand = hands[i];
          if (p.hand.length === 1) p.calledUno = true;
          else if (p.hand.length > 1) p.calledUno = false;
        });
        events.push({ type: 'handsRotated' });
      }
    }

    // 叠 +2 / +4 响应
    if (this.pendingDraw > 0) {
      this.pendingDraw += card.kind === 'draw2' ? 2 : 4;
      events.push({ type: 'pendingDraw', count: this.pendingDraw });
      this.advance(1, events);
      return events;
    }

    const twoPlayer = this.players.length === 2;
    switch (card.kind) {
      case 'skip': {
        const skipped = this.playerAt(1);
        events.push({ type: 'skip', playerId: skipped.id });
        this.advance(2, events);
        break;
      }
      case 'reverse':
        this.direction = this.direction === 1 ? -1 : 1;
        events.push({ type: 'reverse', direction: this.direction });
        if (twoPlayer) this.advance(2, events);
        else this.advance(1, events);
        break;
      case 'draw2':
        this.pendingDraw = 2;
        events.push({ type: 'pendingDraw', count: 2 });
        this.advance(1, events);
        break;
      case 'wild4':
        this.pendingDraw = 4;
        events.push({ type: 'pendingDraw', count: 4 });
        this.advance(1, events);
        break;
      default:
        this.advance(1, events);
    }
    return events;
  }

  /** 摸牌：有累积惩罚则吃牌并被跳过，否则摸 1 张 */
  drawCard(playerId: string): GameEvent[] {
    this.assertPlaying();
    if (this.current.id !== playerId) throw new GameError('not_your_turn', '还没轮到你');
    const player = this.find(playerId);
    const events: GameEvent[] = [];
    if (this.pendingDraw > 0) {
      const n = this.pendingDraw;
      this.pendingDraw = 0;
      const drawn = this.giveCards(player, n);
      if (drawn > 0) events.push({ type: 'cardDrawn', playerId: player.id, count: drawn });
      this.advance(1, events);
      return events;
    }
    if (this.drewThisTurn) throw new GameError('already_drew', '本回合已摸过牌');
    if (this.rules.drawUntilPlayable) {
      // 摸到能出为止；聚合成单个 cardDrawn 事件，count 与真实摸牌数一致
      let guard = 0;
      let drawn = 0;
      do {
        const d = this.giveCards(player, 1);
        if (d === 0) break; // 牌堆耗尽，无法继续摸
        drawn += d;
        guard++;
      } while (guard < 30 && !player.hand.some((c) => this.canPlay(c)));
      if (drawn > 0) events.push({ type: 'cardDrawn', playerId: player.id, count: drawn });
    } else {
      const drawn = this.giveCards(player, 1);
      if (drawn > 0) events.push({ type: 'cardDrawn', playerId: player.id, count: drawn });
    }
    this.drewThisTurn = true;
    return events;
  }

  /** 摸牌后放弃出牌，轮到下家 */
  pass(playerId: string): GameEvent[] {
    this.assertPlaying();
    if (this.current.id !== playerId) throw new GameError('not_your_turn', '还没轮到你');
    if (!this.drewThisTurn) throw new GameError('must_draw_first', '需要先摸一张牌');
    const events: GameEvent[] = [];
    this.advance(1, events);
    return events;
  }

  /** 剩 1 张牌时喊 UNO */
  callUno(playerId: string): GameEvent[] {
    this.assertPlaying();
    const player = this.find(playerId);
    if (player.hand.length !== 1) throw new GameError('not_one_card', '只剩 1 张牌时才能喊 UNO');
    player.calledUno = true;
    return [{ type: 'unoCalled', playerId }];
  }

  /** 抓没喊 UNO 的玩家 */
  catchUno(catcherId: string, targetId: string): GameEvent[] {
    this.assertPlaying();
    if (catcherId === targetId) throw new GameError('bad_target', '不能抓自己');
    const target = this.find(targetId);
    if (target.hand.length !== 1 || target.calledUno) {
      throw new GameError('bad_catch', '对方已喊 UNO 或手牌数不对');
    }
    const events: GameEvent[] = [{ type: 'unoCaught', catcherId, targetId }];
    const drawn = this.giveCards(target, 2);
    if (drawn > 0) events.push({ type: 'cardDrawn', playerId: target.id, count: drawn });
    return events;
  }

  /** 超时托管 / 断线托管：自动执行当前玩家回合 */
  forceAction(playerId: string, level: AiLevel = 'normal', rng: () => number = Math.random): GameEvent[] {
    this.assertPlaying();
    const action = aiChoose(this, playerId, level, rng);
    if (action.kind === 'play') {
      return this.playCard(playerId, action.cardId, action.chosenColor, action.targetPlayerId);
    }
    if (action.kind === 'draw') {
      const ev = this.drawCard(playerId);
      if (this.phase === 'playing' && this.current.id === playerId && this.drewThisTurn) {
        const again = aiChoose(this, playerId, level, rng);
        if (again.kind === 'play') {
          return [...ev, ...this.playCard(playerId, again.cardId, again.chosenColor, again.targetPlayerId)];
        }
        if (again.kind === 'pass') return [...ev, ...this.pass(playerId)];
      }
      return ev;
    }
    return this.pass(playerId);
  }

  /** 校验万能牌选色并返回合法颜色（非法则抛错） */
  private resolveWildColor(chosenColor: RealColor | undefined): RealColor {
    if (!chosenColor) throw new GameError('color_required', '请选择颜色');
    if (!VALID_COLORS.includes(chosenColor)) throw new GameError('bad_color', '颜色非法');
    return chosenColor;
  }

  private playerAt(steps: number): PlayerState {
    return this.players[this.idxAt(steps)];
  }

  private idxAt(steps: number): number {
    const n = this.players.length;
    return ((this.currentIdx + this.direction * steps) % n + n) % n;
  }

  private advance(steps: number, events: GameEvent[]) {
    this.currentIdx = this.idxAt(steps);
    this.drewThisTurn = false;
    this.turn++;
    // 牌堆彻底耗尽且无人可出 → 平局，避免对局死锁
    if (this.isDeadlocked()) {
      this.settleDraw(events);
      return;
    }
    events.push({ type: 'turn', playerId: this.current.id });
  }

  /** 实际发牌，返回真实摸牌数（牌堆耗尽时可能 < n） */
  private giveCards(player: PlayerState, n: number): number {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (this.drawPile.length === 0) {
        if (this.discardPile.length <= 1) break;
        const top = this.discardPile.pop()!;
        this.drawPile = shuffle(this.discardPile);
        this.discardPile = [top];
      }
      const card = this.drawPile.pop();
      if (!card) break;
      player.hand.push(card);
      drawn++;
    }
    if (player.hand.length > 1) player.calledUno = false;
    return drawn;
  }

  private isDeadlocked(): boolean {
    if (this.drawPile.length > 0 || this.discardPile.length > 1) return false;
    return this.players.every((p) => !p.hand.some((c) => this.canPlay(c)));
  }

  private settle(winnerId: string, events: GameEvent[]) {
    this.phase = 'settled';
    this.winnerId = winnerId;
    events.push({ type: 'settled', winnerId });
  }

  private settleDraw(events: GameEvent[]) {
    this.phase = 'settled';
    this.winnerId = null;
    events.push({ type: 'settled', winnerId: null });
  }

  private assertPlaying() {
    if (this.phase !== 'playing') throw new GameError('game_over', '本局已结束');
  }
}
