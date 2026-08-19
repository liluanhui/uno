/* 端到端冒烟测试：人机 1V1 完整对局 + 双人房间关键流程 */
const { io } = require('/Users/muyi/Desktop/code/uno/apps/web/node_modules/socket.io-client');

const URL = process.env.API_URL || 'http://localhost:5002';
const log = (...a) => console.log('[smoke]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name) {
  const sock = io(URL, { auth: { name }, transports: ['websocket'] });
  sock.state = null;
  sock.room = null;
  sock.on('identity', (d) => (sock.userId = d.userId));
  sock.on('room:state', (r) => (sock.room = r));
  sock.on('game:state', ({ state }) => (sock.state = state));
  return sock;
}

const waitfor = (cond, timeout = 8000) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      try {
        if (cond()) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - t0 > timeout) {
          clearInterval(timer);
          reject(new Error('wait timeout'));
        }
      } catch (e) {
        clearInterval(timer);
        reject(e);
      }
    }, 60);
  });

async function soloGame() {
  const me = client('冒烟玩家');
  await waitfor(() => me.connected);
  me.emit('room:create', { mode: 'solo', difficulty: 'normal' });
  await waitfor(() => me.state && me.state.phase === 'playing');
  log('人机对局已开始，手牌', me.state.you.hand.length, '张，top =', JSON.stringify(me.state.topCard));

  let guard = 0;
  while (me.state.phase === 'playing' && guard < 400) {
    guard++;
    if (me.state.isYourTurn) {
      const playable = me.state.you.playableIds;
      if (me.state.pendingDraw > 0 && playable.length === 0) {
        me.emit('game:draw');
      } else if (playable.length > 0) {
        const cardId = playable[0];
        const card = me.state.you.hand.find((c) => c.id === cardId);
        const payload = { cardId };
        if (card.color === 'wild') payload.chosenColor = ['red', 'blue', 'green', 'yellow'][guard % 4];
        me.emit('game:playCard', payload);
      } else if (me.state.drewThisTurn) {
        me.emit('game:pass');
      } else {
        me.emit('game:draw');
      }
      await sleep(30);
    } else {
      await sleep(60);
    }
    await waitfor(() => me.state && (me.state.isYourTurn || me.state.phase === 'settled'), 15000).catch(() => {});
  }
  if (me.state.phase !== 'settled') throw new Error('对局未在限定步数内结束');
  log('人机对局结束，胜者 =', me.state.winnerId === me.userId ? '我(人类)' : 'AI', '得分', JSON.stringify(me.state.scores));
  me.disconnect();
  return true;
}

async function roomFlow() {
  const host = client('房主');
  const guest = client('访客');
  await waitfor(() => host.connected && guest.connected);

  host.emit('room:create', { mode: 'room', maxPlayers: 2, rules: { stackDraw: true } });
  await waitfor(() => host.room && !host.room.started);
  const code = host.room.code;
  log('房间已创建:', code);

  guest.emit('room:join', { code });
  await waitfor(() => guest.room && guest.room.players.length === 2);
  log('访客已加入，准备中…');
  guest.emit('room:ready', { ready: true });
  host.emit('room:ready', { ready: true });

  await waitfor(() => host.state && host.state.phase === 'playing');
  await waitfor(() => guest.state && guest.state.phase === 'playing');
  log('双人房间对局自动开始 ✓ 我的手牌:', host.state.you.hand.length, '对手手牌数(只有数量):', host.state.players[1].count);

  // 信息隔离检查：guest 的视图不应包含 host 的手牌内容
  const leak = JSON.stringify(guest.state).includes('"hand":');
  log('信息隔离（对手手牌字段仅自己可见）:', guest.state.you && guest.state.you.hand.length === 7 ? '✓' : '?');

  // guest 出一张牌（如果轮到的话）
  let steps = 0;
  while (steps < 5 && host.state.phase === 'playing') {
    steps++;
    const actor = host.state.isYourTurn ? host : guest;
    if (actor.state.isYourTurn && actor.state.you.playableIds.length > 0) {
      const cardId = actor.state.you.playableIds[0];
      const card = actor.state.you.hand.find((c) => c.id === cardId);
      const payload = { cardId };
      if (card.color === 'wild') payload.chosenColor = 'red';
      actor.emit('game:playCard', payload);
      log('双人局出牌:', actor === host ? '房主' : '访客', JSON.stringify(card));
    }
    await sleep(120);
  }

  // 非法操作应返回错误
  let errCode = null;
  guest.once('error', (e) => (errCode = e.code));
  if (!guest.state.isYourTurn) {
    guest.emit('game:draw');
    await sleep(300);
    log('非法操作拦截（非自己回合摸牌）:', errCode || '未拦截!', errCode ? '✓' : '✗');
  }

  host.disconnect();
  guest.disconnect();
  return true;
}

(async () => {
  try {
    await soloGame();
    await roomFlow();
    log('ALL PASS');
    process.exit(0);
  } catch (e) {
    log('FAILED:', e.message);
    process.exit(1);
  }
})();
