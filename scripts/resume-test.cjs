// 续局（刷新重连）场景验证：
// 1) 建 solo 对局，等到轮到我且我未行动时快照手牌
// 2) 立即断开（等效刷新页面）
// 3) 用同一 token 重连并自动 room:join
// 4) 应收到 room:state + game:state，手牌完全一致、仍是我的回合
const { io } = require('../apps/web/node_modules/socket.io-client');
const URL = process.env.API_URL || 'http://localhost:5002';

function connect(token, name) {
  return io(URL, { auth: { token: token || undefined, name }, transports: ['websocket'] });
}

const s1 = connect(null, 'resume-test');
let token = '';
let code = '';
let handBefore = null;
let step = 'init';
let results = { roomState: false, phase: false, sameHand: false, myTurn: false };

s1.on('identity', (d) => {
  token = d.token;
  s1.emit('room:create', { mode: 'solo', difficulty: 'easy' });
});
s1.on('room:created', (d) => (code = d.code));
s1.on('game:state', (p) => {
  if (step === 'init' && p.state.isYourTurn && !p.state.drewThisTurn) {
    handBefore = p.state.you.hand.map((c) => c.id).sort();
    step = 'disconnected';
    s1.disconnect(); // 模拟刷新
    setTimeout(reconnect, 700);
  }
});
s1.on('error', (e) => console.log('阶段1 error:', e.code, e.message));

function reconnect() {
  const s2 = connect(token, 'resume-test');
  s2.on('connect', () => s2.emit('room:join', { code }));
  s2.on('room:state', (r) => {
    if (r.code === code && r.started) results.roomState = true;
  });
  s2.on('game:state', (p) => {
    if (step === 'disconnected') {
      step = 'done';
      results.phase = p.state.phase === 'playing';
      const handAfter = p.state.you ? p.state.you.hand.map((c) => c.id).sort() : null;
      results.sameHand = JSON.stringify(handAfter) === JSON.stringify(handBefore);
      results.myTurn = p.state.isYourTurn;
      s2.emit('room:leave');
      setTimeout(() => {
        console.log('room:state 恢复:', results.roomState ? 'PASS' : 'FAIL');
        console.log('对局仍在进行:', results.phase ? 'PASS' : 'FAIL');
        console.log('手牌完全一致:', results.sameHand ? 'PASS' : 'FAIL');
        console.log('回合未丢失(仍轮到我):', results.myTurn ? 'PASS' : 'FAIL');
        const all = Object.values(results).every(Boolean);
        console.log(all ? 'ALL PASS' : 'HAS FAIL');
        process.exit(all ? 0 : 1);
      }, 400);
    }
  });
  s2.on('error', (e) => console.log('阶段2 error:', e.code, e.message));
}

setTimeout(() => {
  console.log('超时退出: step=' + step);
  process.exit(1);
}, 15000);
