<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUno } from '../store';
import type { CardT } from '../store';
import UnoCard from '../components/UnoCard.vue';

const store = useUno();
const router = useRouter();
const showColorPicker = ref(false);
const showSwapPicker = ref(false);
const copied = ref(false);

const room = computed(() => store.room);
const game = computed(() => store.game);
const myId = computed(() => store.userId);

const isHost = computed(() => room.value?.hostId === myId.value);
const me = computed(() => game.value?.players.find((p) => p.id === myId.value) || null);
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

const emojis = ['👍', '😂', '😱', '😡', '🎉', '👋'];

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
        <template v-if="!Object.keys(ruleLabels).some((k) => room.rules[k])">官方规则</template>
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

  <!-- 对局页 -->
  <div v-else-if="game" class="play-wrap">
    <div class="seats">
      <div
        v-for="p in opponents"
        :key="p.id"
        class="seat"
        :class="{ active: isCurrent(p.id), offline: !p.connected }"
      >
        <div class="name">{{ p.name }}</div>
        <div class="count">{{ p.count }} 张</div>
        <div v-if="p.count === 1 && !p.calledUno" class="badge-uno">没喊UNO</div>
        <div v-else-if="p.count === 1" class="badge-uno" style="background: var(--green)">UNO!</div>
        <button
          v-if="game.phase === 'playing' && p.count === 1 && !p.calledUno"
          class="catch-btn"
          @click="store.catchUno(p.id)"
        >
          抓！
        </button>
      </div>
    </div>

    <div class="table-area">
      <div class="status-row">
        <span class="direction" :class="{ ccw: game.direction === -1 }">{{ game.direction === 1 ? '↻' : '↺' }}</span>
        <span v-if="game.pendingDraw > 0" class="pending-badge">待罚 +{{ game.pendingDraw }}</span>
        <span v-if="game.isYourTurn && game.phase === 'playing'" class="turn-banner">轮到你了</span>
        <span v-else-if="game.phase === 'playing'" class="muted">等待 {{ currentPlayerName }} 行动…</span>
      </div>
      <div class="piles">
        <div class="draw-pile" :class="{ 'can-draw': canDraw }" @click="canDraw && store.drawCard()">
          <strong>{{ game.drawCount }}</strong>
          <span>摸牌堆</span>
        </div>
        <div class="top-card-slot">
          <UnoCard v-if="game.topCard" :card="game.topCard" />
        </div>
      </div>
    </div>

    <div class="hand-area">
      <div class="hand">
        <UnoCard
          v-for="c in myHand"
          :key="c.id"
          :card="c"
          :playable="game.isYourTurn && playableIds.has(c.id)"
          :dim="game.isYourTurn && !playableIds.has(c.id)"
          @click="onCardClick(c)"
        />
      </div>
    </div>

    <div class="action-bar">
      <button class="uno-btn" :class="{ hot: unoHot }" @click="store.callUno()">UNO!</button>
      <button class="ghost" :disabled="!canPass" @click="store.passTurn()">过</button>
      <div class="emoji-bar">
        <button v-for="e in emojis" :key="e" @click="store.chat(e)">{{ e }}</button>
      </div>
    </div>

    <!-- 聊天气泡 -->
    <div class="chat-float">
      <div v-for="c in store.chats" :key="c.id" class="chat-bubble">{{ c.name }}：{{ c.emoji }}</div>
    </div>

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

    <!-- 结算 -->
    <div v-if="showResult" class="overlay">
      <div class="dialog">
        <div style="font-size: 30px">{{ game.winnerId === myId ? '🏆' : '🎉' }}</div>
        <div style="font-weight: 800; font-size: 18px; margin-top: 4px">
          {{ game.winnerId === myId ? '你赢了！' : `${winnerName} 获胜` }}
        </div>
        <div class="result-score">+{{ game.scores[game.winnerId || ''] || 0 }} 分</div>
        <div class="muted">胜者获得对手剩余手牌总分</div>
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
    <p class="muted">连接中…</p>
  </div>
</template>

<script lang="ts">
export default { name: 'PlayView' };
</script>
