import { describe, expect, it } from 'vitest';
import { aiChoose, cardPoints, createDeck, DEFAULT_RULES, GameError, HouseRules, UnoGame } from '../src';

const P = [
  { id: 'a', name: 'Alice', isAi: false },
  { id: 'b', name: 'Bob', isAi: false },
  { id: 'c', name: 'Cara', isAi: false },
];

function newGame(rules: HouseRules = DEFAULT_RULES, players = P): UnoGame {
  return new UnoGame(players, rules, Math.random);
}

function firstPlayable(g: UnoGame): string | null {
  const card = g.playableCards(g.current.id)[0];
  return card ? card.id : null;
}

describe('牌组', () => {
  it('共 108 张，结构正确', () => {
    const deck = createDeck();
    expect(deck.length).toBe(108);
    expect(deck.filter((c) => c.kind === 'number').length).toBe(76);
    expect(deck.filter((c) => c.kind === 'skip').length).toBe(8);
    expect(deck.filter((c) => c.kind === 'reverse').length).toBe(8);
    expect(deck.filter((c) => c.kind === 'draw2').length).toBe(8);
    expect(deck.filter((c) => c.kind === 'wild').length).toBe(4);
    expect(deck.filter((c) => c.kind === 'wild4').length).toBe(4);
  });

  it('计分规则正确', () => {
    expect(cardPoints({ id: 'x', color: 'red', kind: 'number', value: 9 })).toBe(9);
    expect(cardPoints({ id: 'x', color: 'red', kind: 'skip' })).toBe(20);
    expect(cardPoints({ id: 'x', color: 'wild', kind: 'wild4' })).toBe(50);
  });
});

describe('开局', () => {
  it('每人 7 张，首张弃牌不是万能牌', () => {
    const g = newGame();
    expect(g.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(g.top.color).not.toBe('wild');
    expect(g.drawPile.length).toBe(108 - 21 - 1);
  });
});

describe('出牌合法性', () => {
  it('不是你的回合不能出', () => {
    const g = newGame();
    const other = g.players.find((p) => p.id !== g.current.id)!;
    expect(() => g.playCard(other.id, other.hand[0].id)).toThrow(GameError);
  });

  it('同色可出、杂牌不可出、同数字跨色可出', () => {
    const g = newGame();
    const me = g.current;
    const color = g.activeColor;
    const good = { id: 't1', color, kind: 'number' as const, value: 1 };
    me.hand.push(good);
    expect(() => g.playCard(me.id, good.id)).not.toThrow();

    const g2 = newGame();
    const me2 = g2.current;
    const colors = ['red', 'yellow', 'green', 'blue'] as const;
    const wrongColor = colors.find((c) => c !== g2.activeColor && c !== g2.top.color)!;
    const bad = { id: 't2', color: wrongColor, kind: 'number' as const, value: 1 };
    me2.hand.push(bad);
    expect(() => g2.playCard(me2.id, bad.id)).toThrow(/不能出/);

    // 同数字跨色
    const g3 = newGame();
    const me3 = g3.current;
    const sameValue = { id: 't3', color: wrongColor, kind: 'number' as const, value: g3.top.kind === 'number' ? g3.top.value : 5 };
    me3.hand.push(sameValue);
    if (g3.top.kind === 'number' && sameValue.value === g3.top.value) {
      expect(g3.canPlay(sameValue)).toBe(true);
    }
  });

  it('万能牌必须选颜色', () => {
    const g = newGame();
    const me = g.current;
    const wild = { id: 'w1', color: 'wild' as const, kind: 'wild' as const };
    me.hand.push(wild);
    expect(() => g.playCard(me.id, wild.id)).toThrow(/颜色/);
    const ev = g.playCard(me.id, wild.id, 'blue');
    expect(g.activeColor).toBe('blue');
    expect(ev[1].type).toBe('colorChosen');
  });

  it('万能牌选色非法被拒', () => {
    const g = newGame();
    const me = g.current;
    const wild = { id: 'wbad', color: 'wild' as const, kind: 'wild' as const };
    me.hand.push(wild);
    expect(() => g.playCard(me.id, wild.id, 'purple' as never)).toThrow(/颜色非法/);
    expect(() => g.playCard(me.id, wild.id, undefined as never)).toThrow(/颜色/);
  });
});

describe('功能牌', () => {
  it('跳过：下家被跳过', () => {
    const g = newGame();
    const me = g.current;
    const skip = { id: 's1', color: g.activeColor, kind: 'skip' as const };
    me.hand.push(skip);
    const before = g.currentIdx;
    g.playCard(me.id, skip.id);
    const n = g.players.length;
    expect(g.currentIdx).toBe((before + 2 * g.direction + n) % n);
  });

  it('反转：方向改变', () => {
    const g = newGame();
    const me = g.current;
    const rev = { id: 'r1', color: g.activeColor, kind: 'reverse' as const };
    me.hand.push(rev);
    g.playCard(me.id, rev.id);
    expect(g.direction).toBe(-1);
  });

  it('双人局反转等同跳过', () => {
    const g = newGame(DEFAULT_RULES, [P[0], P[1]]);
    const me = g.current;
    const rev = { id: 'r2', color: g.activeColor, kind: 'reverse' as const };
    me.hand.push(rev);
    g.playCard(me.id, rev.id);
    expect(g.current.id).toBe(me.id);
  });

  it('+2：下家摸 2 且被跳过', () => {
    const g = newGame();
    const me = g.current;
    const d2 = { id: 'd1', color: g.activeColor, kind: 'draw2' as const };
    me.hand.push(d2);
    g.playCard(me.id, d2.id);
    expect(g.pendingDraw).toBe(2);
    const victim = g.current;
    const handBefore = victim.hand.length;
    g.drawCard(victim.id);
    expect(victim.hand.length).toBe(handBefore + 2);
    expect(g.pendingDraw).toBe(0);
    expect(g.current.id).not.toBe(victim.id);
  });

  it('叠 +2：房规开启时可顺延惩罚', () => {
    const g = newGame({ ...DEFAULT_RULES, stackDraw: true });
    const me = g.current;
    const d2a = { id: 'd2', color: g.activeColor, kind: 'draw2' as const };
    me.hand.push(d2a);
    g.playCard(me.id, d2a.id);
    const victim = g.current;
    const d2b = { id: 'd3', color: g.activeColor, kind: 'draw2' as const };
    victim.hand.push(d2b);
    g.playCard(victim.id, d2b.id);
    expect(g.pendingDraw).toBe(4);
  });

  it('叠 +2：房规关闭时只能吃牌', () => {
    const g = newGame({ ...DEFAULT_RULES, stackDraw: false });
    const me = g.current;
    const d2 = { id: 'd4', color: g.activeColor, kind: 'draw2' as const };
    me.hand.push(d2);
    g.playCard(me.id, d2.id);
    const victim = g.current;
    expect(victim.hand.filter((c) => g.canPlay(c)).length).toBe(0);
  });
});

describe('摸牌与过牌', () => {
  it('过牌前必须先摸', () => {
    const g = newGame();
    const me = g.current;
    expect(() => g.pass(me.id)).toThrow(/先摸/);
    g.drawCard(me.id);
    expect(() => g.pass(me.id)).not.toThrow();
  });

  it('摸牌后轮到别人，别人不能重复摸', () => {
    const g = newGame();
    const me = g.current;
    g.drawCard(me.id);
    expect(() => g.drawCard(me.id)).toThrow(/已摸过/);
  });

  it('drawUntilPlayable：摸到能出为止', () => {
    const g = newGame({ ...DEFAULT_RULES, drawUntilPlayable: true });
    const me = g.current;
    const ev = g.drawCard(me.id);
    expect(me.hand.some((c) => g.canPlay(c))).toBe(true);
    expect(ev.filter((e) => e.type === 'cardDrawn').length).toBeGreaterThanOrEqual(1);
  });

  it('drawUntilPlayable 摸牌事件 count 与真实摸牌数一致', () => {
    const g = newGame({ ...DEFAULT_RULES, drawUntilPlayable: true });
    const me = g.current;
    const before = me.hand.length;
    const ev = g.drawCard(me.id);
    const total = ev.reduce((s, e) => (e.type === 'cardDrawn' ? s + e.count : s), 0);
    expect(me.hand.length - before).toBe(total);
  });
});

describe('UNO 宣言', () => {
  it('剩 1 张喊 UNO，被抓者罚摸 2', () => {
    const g = newGame();
    const me = g.current;
    // 构造剩 1 张（不出，停留在回合内）
    me.hand = [me.hand[0]];
    expect(me.hand.length).toBe(1);
    const catcher = g.players.find((p) => p.id !== me.id)!;
    const before = me.hand.length;
    g.catchUno(catcher.id, me.id);
    expect(me.hand.length).toBe(before + 2);

    // 手牌回到 1 张并喊 UNO 后，抓不了
    me.hand = [me.hand[0]];
    g.callUno(me.id);
    expect(me.calledUno).toBe(true);
    expect(() => g.catchUno(catcher.id, me.id)).toThrow(/已喊 UNO 或手牌数不对/);
  });

  it('抓 UNO：未喊者罚摸 2', () => {
    const g = newGame();
    const me = g.current;
    me.hand = [me.hand[0]];
    expect(me.hand.length).toBe(1);
    expect(me.calledUno).toBe(false);
    const catcher = g.players.find((p) => p.id !== me.id)!;
    const before = me.hand.length;
    g.catchUno(catcher.id, me.id);
    expect(me.hand.length).toBe(before + 2);

    // 喊过之后抓不了
    me.hand = [me.hand[0]];
    g.callUno(me.id);
    expect(() => g.catchUno(catcher.id, me.id)).toThrow(/已喊 UNO 或手牌数不对/);
  });

  it('手牌多于 1 张不能喊 UNO', () => {
    const g = newGame();
    const me = g.current;
    expect(() => g.callUno(me.id)).toThrow(/1 张/);
  });
});

describe('胜利与计分', () => {
  it('出完最后一牌即获胜并计分', () => {
    const g = newGame();
    const me = g.current;
    const last = g.playableCards(me.id)[0];
    me.hand = [last];
    const ev = g.playCard(me.id, last.id, last.color === 'wild' ? 'red' : undefined);
    expect(g.phase).toBe('settled');
    expect(g.winnerId).toBe(me.id);
    const expected = g.players
      .filter((p) => p.id !== me.id)
      .reduce((s, p) => s + p.hand.reduce((a, c) => a + cardPoints(c), 0), 0);
    expect(g.scores[me.id]).toBe(expected);
    // 败者也有计分条目（0 分）
    for (const p of g.players) expect(g.scores[p.id]).toBeDefined();
    expect(ev.at(-1)!.type).toBe('settled');
  });

  it('lastCardNoAction 房规：最后一张不能是功能牌', () => {
    const g = newGame({ ...DEFAULT_RULES, lastCardNoAction: true });
    const me = g.current;
    const bad = { id: 's9', color: g.activeColor, kind: 'skip' as const };
    me.hand = [bad];
    expect(() => g.playCard(me.id, bad.id)).toThrow(/功能牌/);
  });
});

describe('七换零房规', () => {
  it('打 7 换手牌', () => {
    const g = newGame({ ...DEFAULT_RULES, sevenZero: true });
    const me = g.current;
    const seven = { id: 'n7', color: g.activeColor, kind: 'number' as const, value: 7 };
    me.hand.push(seven);
    const target = g.players.find((p) => p.id !== me.id)!;
    const myHand = me.hand.filter((c) => c.id !== seven.id);
    const theirHand = [...target.hand];
    expect(() => g.playCard(me.id, seven.id)).toThrow(/换牌对象/);
    g.playCard(me.id, seven.id, undefined, target.id);
    expect(me.hand.map((c) => c.id).sort()).toEqual(theirHand.map((c) => c.id).sort());
    expect(target.hand.map((c) => c.id).sort()).toEqual(myHand.map((c) => c.id).sort());
  });

  it('打 0 全员手牌平移', () => {
    const g = newGame({ ...DEFAULT_RULES, sevenZero: true });
    const me = g.current;
    const zero = { id: 'n0', color: g.activeColor, kind: 'number' as const, value: 0 };
    me.hand.push(zero);
    // 打出后的各家手牌（打出者的手牌少了 zero）
    const afterPlay = g.players.map((p) => [...p.hand.map((c) => c.id)]);
    const meIdx = g.players.indexOf(me);
    afterPlay[meIdx] = afterPlay[meIdx].filter((id) => id !== zero.id);
    g.playCard(me.id, zero.id);
    // 顺时针：每人拿到"上家"打出后的手牌
    const n = g.players.length;
    g.players.forEach((p, i) => {
      const sourceIdx = (i - g.direction + n) % n;
      expect(p.hand.map((c) => c.id).sort()).toEqual([...afterPlay[sourceIdx]].sort());
    });
  });

  it('7 换后被动获得 1 张不被误抓 UNO', () => {
    const g = newGame({ ...DEFAULT_RULES, sevenZero: true });
    const me = g.current;
    const seven = { id: 'n7a', color: g.activeColor, kind: 'number' as const, value: 7 };
    me.hand.push(seven);
    const target = g.players.find((p) => p.id !== me.id)!;
    target.hand = [target.hand[0]]; // target 只剩 1 张
    g.playCard(me.id, seven.id, undefined, target.id);
    expect(me.hand.length).toBe(1);
    expect(me.calledUno).toBe(true); // 被动获得，无需喊
    const catcher = g.players.find((p) => p.id !== me.id)!.id;
    expect(() => g.catchUno(catcher, me.id)).toThrow(/已喊 UNO 或手牌数不对/);
  });

  it('0 平移后被动获得 1 张不被误抓 UNO', () => {
    const g = newGame({ ...DEFAULT_RULES, sevenZero: true });
    const me = g.current;
    const zero = { id: 'n0a', color: g.activeColor, kind: 'number' as const, value: 0 };
    me.hand.push(zero);
    const victim = g.players.find((p) => p.id !== me.id)!;
    victim.hand = [victim.hand[0]]; // 制造一张 1 张手牌
    g.playCard(me.id, zero.id);
    for (const p of g.players) {
      if (p.hand.length === 1) {
        expect(p.calledUno).toBe(true);
        const catcher = g.players.find((x) => x.id !== p.id)!.id;
        expect(() => g.catchUno(catcher, p.id)).toThrow(/已喊 UNO 或手牌数不对/);
      }
    }
  });
});

describe('AI 与托管', () => {
  it('AI 决策合法：出牌或摸牌', () => {
    const g = newGame();
    for (let i = 0; i < 30; i++) {
      const cur = g.current;
      const action = aiChoose(g, cur.id, 'normal');
      if (action.kind === 'play') {
        g.playCard(cur.id, action.cardId, action.chosenColor, action.targetPlayerId);
      } else if (action.kind === 'draw') {
        g.drawCard(cur.id);
        // 摸牌后若仍是自己的回合且可出，则继续决策
        if (g.phase === 'playing' && g.current.id === cur.id && g.drewThisTurn) {
          const after = aiChoose(g, cur.id, 'normal');
          if (after.kind === 'play') {
            g.playCard(cur.id, after.cardId, after.chosenColor, after.targetPlayerId);
          } else if (after.kind === 'pass') {
            g.pass(cur.id);
          }
        }
      } else {
        g.pass(cur.id);
      }
      if (g.phase === 'settled') break;
    }
    expect(['playing', 'settled']).toContain(g.phase);
  });

  it('forceAction 托管能推进对局直到结束', () => {
    const g = newGame();
    let guard = 0;
    while (g.phase === 'playing' && guard < 500) {
      g.forceAction(g.current.id);
      guard++;
    }
    expect(g.phase).toBe('settled');
    expect(g.winnerId).toBeTruthy();
  });

  it('forceAction 支持简单难度并推进对局', () => {
    const g = newGame();
    let guard = 0;
    while (g.phase === 'playing' && guard < 500) {
      g.forceAction(g.current.id, 'easy');
      guard++;
    }
    expect(g.phase).toBe('settled');
  });

  it('aiChoose 对不存在玩家抛错', () => {
    const g = newGame();
    expect(() => aiChoose(g, 'no-such-player', 'normal')).toThrow(GameError);
  });

  it('快照可恢复', () => {
    const g = newGame();
    const cardId = firstPlayable(g);
    if (cardId) {
      const me = g.current;
      const cardObj = me.hand.find((c) => c.id === cardId);
      g.playCard(g.current.id, cardId, cardObj?.color === 'wild' ? 'red' : undefined);
    }
    const snap = JSON.parse(JSON.stringify(g));
    const g2 = Object.assign(Object.create(Object.getPrototypeOf(g)), snap) as UnoGame;
    expect(g2.current.id).toBe(g.current.id);
    expect(g2.players.map((p) => p.hand.length)).toEqual(g.players.map((p) => p.hand.length));
    expect(g2.canPlay(g2.current.hand[0])).toBe(g.canPlay(g.current.hand[0]));
  });
});
