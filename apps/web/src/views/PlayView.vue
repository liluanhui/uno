<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUno } from '../store';
import type { CardT } from '../store';
import UnoCard from '../components/UnoCard.vue';
import CardBack from '../components/CardBack.vue';
import UnoBurst from '../components/UnoBurst.vue';
import DealOverlay from '../components/DealOverlay.vue';

const store = useUno();
const router = useRouter();
const showColorPicker = ref(false);
const showSwapPicker = ref(false);
const copied = ref(false);

const room = computed(() => store.room);
const game = computed(() => store.game);
const myId = computed(() => store.userId);

const isHost = computed(() => room.value?.hostId === myId.value);
const opponents = computed(() => game.value?.players.filter((p) => p.id !== myId.value) || []);
const myHand = computed(() => game.value?.you?.hand || []);
const playableIds = computed(() => new Set(game.value?.you?.playableIds || []));

const canDraw = computed(
  () => game.value?.isYourTurn && !game.value?.drewThisTurn && game.value?.pendingDraw >= 0,
);
const canPass = computed(() => !!game.value?.isYourTurn && !!game.value?.drewThisTurn);
const unoHot = computed(
  () =>
    game.value?.phase === 'playing' &&
    myHand.value.length === 1 &&
    !game.value?.you?.calledUno,
);

const showResult = computed(() => game.value?.phase === 'settled');
const winnerName = computed(
  () => game.value?.players.find((p) => p.id === game.value?.winnerId)?.name || '',
);

const currentIdx = computed(() => game.value?.currentIdx ?? 0);
const currentPlayerName = computed(
  () => game.value?.players[currentIdx.value]?.name || '',
);

function isCurrent(playerId: string): boolean {
  return game.value?.players[currentIdx.value]?.id === playerId;
}

const activeColorClass = computed(() => `ac-${game.value?.activeColor || 'wild'}`);

const paused = computed(() => !!game.value?.paused);
// 仅房主可暂停/继续（solo 模式人类即房主，天然覆盖）
const canControlPause = computed(() => isHost.value);
const showMenu = ref(false);

watch(paused, (p) => {
  // 暂停 → 自动弹出锁定棋盘；恢复 → 自动收起回到牌桌
  showMenu.value = p;
});

function openMenu() {
  showMenu.value = true;
}
function closeMenu() {
  // 暂停期间不允许关闭，棋盘保持锁定
  if (!paused.value) showMenu.value = false;
}
function togglePause() {
  if (paused.value) store.resume();
  else store.pause();
}

// 刷新续局：若 8 秒内仍拿不到房间状态（房间已回收/服务重启），自动回大厅
onMounted(() => {
  setTimeout(() => {
    if (!store.room && !store.game) {
      store.toast('对局房间已失效，请重新开始');
      localStorage.removeItem('uno.room');
      router.replace('/');
    }
  }, 8000);
});

// 剩 1 张时自动提醒喊 UNO（2.5s 后自动喊，可提前手动）
watch(unoHot, (hot) => {
  if (hot) {
    const t = setTimeout(() => {
      if (unoHot.value) store.callUno();
    }, 2500);
    const stop = watch(unoHot, (v) => {
      if (!v) {
        clearTimeout(t);
        stop();
      }
    });
  }
});

// ---------- 弃牌堆「凌乱堆叠」----------
const discardHistory = ref<CardT[]>([]);

watch(
  () => store.dealing,
  (d) => {
    if (d) discardHistory.value = [];
  },
);

watch(
  () => game.value?.topCard,
  (nv, ov) => {
    if (nv && ov && nv.id !== ov.id) {
      discardHistory.value = [ov, ...discardHistory.value].slice(0, 6);
    } else if (nv && !ov) {
      discardHistory.value = [];
    }
  },
);

// 以牌 id 为种子的稳定伪随机，堆叠角度/偏移不闪烁
function seed(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function stackStyle(id: string, i: number) {
  const rot = (seed(id, 1) - 0.5) * 44;
  const dx = (seed(id, 2) - 0.5) * 26;
  const dy = (seed(id, 3) - 0.5) * 20;
  const z = 10 + i;
  return { transform: `rotate(${rot}deg) translate(${dx}px, ${dy}px)`, zIndex: z };
}

// ---------- UNO 爆炸特效 ----------
const burstFx = ref<{ id: number; name: string } | null>(null);
watch(
  () => store.unoFx,
  (fx) => {
    if (!fx) return;
    burstFx.value = { id: fx.id, name: fx.name };
    setTimeout(() => {
      if (burstFx.value?.id === fx.id) burstFx.value = null;
    }, 1750);
  },
);

function onCardClick(card: CardT) {
  if (!game.value?.isYourTurn) {
    store.toast('还没轮到你');
    return;
  }
  if (!playableIds.value.has(card.id)) {
    store.toast('这张牌现在不能出');
    return;
  }
  if (card.color === 'wild') {
    store.pendingWildCard = card;
    showColorPicker.value = true;
    return;
  }
  if (room.value?.rules.sevenZero && card.kind === 'number' && card.value === 7 && myHand.value.length > 1) {
    store.pendingSwapCard = card;
    showSwapPicker.value = true;
    return;
  }
  store.playCard(card.id);
}

function chooseColor(color: string) {
  const card = store.pendingWildCard;
  showColorPicker.value = false;
  if (!card) return;
  store.playCard(card.id, color);
  store.pendingWildCard = null;
}

function chooseSwapTarget(targetId: string) {
  const card = store.pendingSwapCard;
  showSwapPicker.value = false;
  if (!card) return;
  store.playCard(card.id, undefined, targetId);
  store.pendingSwapCard = null;
}

function copyCode() {
  if (!room.value) return;
  navigator.clipboard?.writeText(room.value.code).then(
    () => {
      copied.value = true;
      setTimeout(() => (copied.value = false), 1500);
    },
    () => store.toast(room.value!.code),
  );
}

function leave() {
  store.leaveRoom();
  router.push('/');
}

function avatarColor(name: string): string {
  const colors = ['var(--red)', 'var(--blue)', 'var(--green)', 'var(--yellow)'];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return colors[h % 4];
}

// 对手牌背扇形
function fanCards(count: number) {
  const n = Math.min(count, 5);
  return Array.from({ length: n }, (_, i) => {
    const mid = (n - 1) / 2;
    return {
      rot: (i - mid) * 9,
      dy: Math.abs(i - mid) * 3,
      z: i,
    };
  });
}

const ruleLabels: Record<string, string> = {
  stackDraw: '叠 +2/+4',
  sevenZero: '七换零',
  drawUntilPlayable: '摸到能出',
  lastCardNoAction: '末张非功能牌',
};
</script>

<template>
  <!-- 房间等待页 -->
  <div v-if="room && !room.started" class="wait-wrap">
    <div class="card-panel">
      <div class="muted" style="text-align: center">房间号（告诉朋友来加入）</div>
      <div class="room-code">{{ room.code }}</div>
      <div style="text-align: center">
        <button class="ghost" style="padding: 6px 16px; font-size: 13px" @click="copyCode">
          {{ copied ? '已复制 ✓' : '复制房间号' }}
        </button>
      </div>
      <div class="player-list">
        <div v-for="p in room.players" :key="p.userId" class="player-row">
          <div class="avatar" :style="{ background: avatarColor(p.name) }">{{ p.name.slice(0, 1) }}</div>
          <div>
            <div style="font-weight: 600">
              {{ p.name }}
              <span v-if="p.userId === room.hostId" class="tag">房主</span>
              <span v-if="p.isAi" class="tag">机器人</span>
            </div>
            <div class="muted">{{ p.connected ? '在线' : '离线' }}</div>
          </div>
          <div class="ready-tag">{{ p.ready ? '已准备 ✓' : '未准备' }}</div>
        </div>
        <div v-for="i in room.maxPlayers - room.players.length" :key="'empty' + i" class="player-row" style="opacity: 0.45">
          <div class="avatar" style="background: var(--surface); border: 1px dashed var(--border)">＋</div>
          <div class="muted">等待加入…</div>
        </div>
      </div>
      <div class="muted" style="text-align: center; margin-bottom: 12px">
        房规：
        <span v-for="(label, key) in ruleLabels" :key="key">
          <template v-if="room.rules[key]">{{ label }} · </template>
        </span>
        <template v-if="!Object.keys(ruleLabels).some((k) => room?.rules[k])">官方规则</template>
      </div>
      <div style="display: flex; gap: 10px">
        <button class="primary" style="flex: 1" @click="store.toggleReady(true)">准备</button>
        <button class="ghost" @click="leave">离开</button>
      </div>
      <p class="muted" style="text-align: center; margin: 12px 0 0">
        人数 ≥ 2 且全部准备后自动开始
      </p>
    </div>
  </div>

  <!-- 洗牌发牌动效 -->
  <DealOverlay v-else-if="store.dealing" :player-count="room?.players.length || 2" />

  <!-- 对局页 -->
  <div v-else-if="game" class="play-wrap">
    <div class="seats">
      <div
        v-for="p in opponents"
        :key="p.id"
        class="seat"
        :class="{ active: isCurrent(p.id), offline: !p.connected }"
      >
        <div class="badge-uno" v-if="game.phase === 'playing' && p.count === 1 && !p.calledUno">没喊UNO</div>
        <div class="badge-uno called" v-else-if="p.count === 1">UNO!</div>
        <button
          v-if="game.phase === 'playing' && p.count === 1 && !p.calledUno"
          class="catch-btn"
          @click="store.catchUno(p.id)"
        >
          抓！
        </button>
        <div class="back-fan">
          <div
            v-for="f in fanCards(p.count)"
            :key="f.z"
            class="fan-bk"
            :style="{ transform: `rotate(${f.rot}deg) translateY(${f.dy}px)`, zIndex: f.z }"
          >
            <CardBack size="sm" />
          </div>
          <span class="fan-count" :class="{ low: p.count === 1 }">× {{ p.count }}</span>
        </div>
        <div class="seat-info">
          <div class="avatar sm" :style="{ background: avatarColor(p.name) }">
            {{ p.isAi ? '🤖' : p.name.slice(0, 1) }}
          </div>
          <div class="name">{{ p.name }}</div>
        </div>
      </div>
    </div>

    <div class="table-area">
      <div class="status-row">
        <span class="direction" :class="{ ccw: game.direction === -1 }">{{ game.direction === 1 ? '↻' : '↺' }}</span>
        <span class="color-dot" :class="activeColorClass" title="当前颜色"></span>
        <span v-if="game.pendingDraw > 0" class="pending-badge">待罚 +{{ game.pendingDraw }}</span>
        <span v-if="game.isYourTurn && game.phase === 'playing'" class="turn-banner">轮到你了</span>
        <span v-else-if="game.phase === 'playing'" class="muted">等待 {{ currentPlayerName }} 行动…</span>
        <button class="ghost menu-btn" aria-label="游戏菜单" title="游戏菜单" @click="openMenu">⏸</button>
      </div>
      <div class="piles">
        <!-- 摸牌堆：堆叠牌背 -->
        <div class="draw-stack" :class="{ 'can-draw': canDraw }" @click="canDraw && store.drawCard()">
          <div class="stack-bk b1"><CardBack size="lg" /></div>
          <div class="stack-bk b2"><CardBack size="lg" /></div>
          <div class="stack-bk b3"><CardBack size="lg" /></div>
          <span class="pile-count">{{ game.drawCount }}</span>
          <span v-if="canDraw" class="draw-hint">点我摸牌</span>
        </div>
        <!-- 弃牌堆：凌乱堆叠 -->
        <div class="discard-stack">
          <div
            v-for="(c, i) in discardHistory.slice(0, 5)"
            :key="c.id"
            class="disc-bk"
            :style="stackStyle(c.id, i)"
          >
            <UnoCard :card="c" size="lg" />
          </div>
          <div v-if="game.topCard" :key="game.topCard.id" class="disc-top">
            <UnoCard :card="game.topCard" size="lg" />
          </div>
        </div>
      </div>
    </div>

    <div class="hand-area">
      <TransitionGroup name="handcard" tag="div" class="hand">
        <div
          v-for="c in myHand"
          :key="c.id"
          class="hand-cell"
          :class="{
            playable: game.isYourTurn && playableIds.has(c.id),
            dim: game.isYourTurn && !playableIds.has(c.id),
          }"
          @click="onCardClick(c)"
        >
          <UnoCard :card="c" size="md" />
        </div>
      </TransitionGroup>
    </div>

    <div class="action-bar">
      <button class="uno-btn" :class="{ hot: unoHot }" @click="store.callUno()">UNO!</button>
      <button class="ghost" :disabled="!canPass" @click="store.passTurn()">过</button>
      <span class="hand-total">{{ myHand.length }} 张</span>
    </div>

    <!-- UNO 爆炸特效（全屏，所有玩家可见） -->
    <UnoBurst :fx="burstFx" />

    <!-- 变色选择 -->
    <div v-if="showColorPicker" class="overlay" @click.self="showColorPicker = false">
      <div class="dialog">
        <div style="font-weight: 700; font-size: 16px">选择接下来的颜色</div>
        <div class="color-grid">
          <button class="color-btn" style="background: var(--red)" @click="chooseColor('red')">红</button>
          <button class="color-btn" style="background: var(--blue)" @click="chooseColor('blue')">蓝</button>
          <button class="color-btn" style="background: var(--yellow)" @click="chooseColor('yellow')">黄</button>
          <button class="color-btn" style="background: var(--green)" @click="chooseColor('green')">绿</button>
        </div>
      </div>
    </div>

    <!-- 七换零换牌对象 -->
    <div v-if="showSwapPicker" class="overlay" @click.self="showSwapPicker = false">
      <div class="dialog">
        <div style="font-weight: 700; font-size: 16px">选择换手牌的对象</div>
        <div class="target-list">
          <button v-for="p in opponents" :key="p.id" class="ghost" @click="chooseSwapTarget(p.id)">
            {{ p.name }}（{{ p.count }} 张）
          </button>
        </div>
      </div>
    </div>

    <!-- 游戏菜单 / 暂停 -->
    <div v-if="showMenu" class="overlay" @click.self="closeMenu">
      <div class="dialog pause-dialog">
        <div class="pause-icon">{{ paused ? '⏸' : '☰' }}</div>
        <div style="font-weight: 800; font-size: 18px">{{ paused ? '已暂停' : '游戏菜单' }}</div>
        <div v-if="room && room.mode === 'room'" class="pause-room">
          <span class="muted">房间号</span>
          <button class="ghost mini" @click="copyCode">{{ copied ? '已复制 ✓' : room.code }}</button>
        </div>
        <div class="pause-actions">
          <button
            v-if="!paused"
            class="primary"
            :disabled="!canControlPause"
            :title="canControlPause ? '' : '只有房主可以暂停'"
            @click="togglePause"
          >
            暂停游戏
          </button>
          <button v-else-if="canControlPause" class="primary" @click="togglePause">继续游戏</button>
          <div v-else class="muted" style="align-self: center">等待房主继续…</div>
          <button class="ghost" @click="leave">退出游戏</button>
        </div>
        <button v-if="!paused" class="ghost mini close-menu" @click="closeMenu">关闭</button>
      </div>
    </div>

    <!-- 结算 -->
    <div v-if="showResult" class="overlay">
      <div class="dialog">
        <div style="font-size: 30px">{{ game.winnerId === myId ? '🏆' : '🎉' }}</div>
        <div style="font-weight: 800; font-size: 18px; margin-top: 4px">
          {{ game.winnerId === myId ? '你赢了！' : `${winnerName} 获胜` }}
        </div>
        <div class="result-score">
          {{ store.stats.win }} 胜 · {{ store.stats.lose }} 负<span v-if="store.stats.draw"> · {{ store.stats.draw }} 平</span>
        </div>
        <div class="muted">累计战绩</div>
        <div class="result-actions">
          <template v-if="room && room.mode === 'room'">
            <button v-if="isHost" class="primary" @click="store.restart()">再来一局</button>
            <span v-else class="muted" style="align-self: center">等待房主开始下一局…</span>
          </template>
          <button class="ghost" @click="leave">返回大厅</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 加载中 -->
  <div v-else class="play-wrap" style="justify-content: center; align-items: center">
    <div style="text-align: center">
      <div class="dealing-spinner" style="margin: 0 auto 14px"></div>
      <p class="muted">{{ store.resuming ? '正在重连续局…' : '连接中…' }}</p>
    </div>
  </div>
</template>

<script lang="ts">
export default { name: 'PlayView' };
</script>
