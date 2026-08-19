<script setup lang="ts">
import { ref, watch } from 'vue';
import { useUno } from '../store';
import UnoCard from '../components/UnoCard.vue';
import CardBack from '../components/CardBack.vue';

const store = useUno();
const nameInput = ref(store.name);
const activePanel = ref<'none' | 'solo' | 'create' | 'join'>('none');

watch(nameInput, (v) => {
  if (v.trim() && v !== store.name) store.setName(v.trim());
});

const difficulty = ref<'easy' | 'normal'>('normal');
const maxPlayers = ref(2);
const joinCode = ref('');
const rules = ref({
  stackDraw: true,
  sevenZero: false,
  drawUntilPlayable: false,
  lastCardNoAction: false,
});

const ruleLabels: Record<string, string> = {
  stackDraw: '叠 +2 / +4（可顺延惩罚）',
  sevenZero: '七换零（7 换手牌、0 平移）',
  drawUntilPlayable: '摸牌摸到能出为止',
  lastCardNoAction: '最后一张不能是功能牌',
};

const demoCards = {
  solo: { id: 'demo-s', color: 'red', kind: 'number', value: 7 },
  create: { id: 'demo-c', color: 'blue', kind: 'reverse' },
  join: { id: 'demo-j', color: 'yellow', kind: 'number', value: 3 },
} as const;

function togglePanel(panel: 'solo' | 'create' | 'join') {
  activePanel.value = activePanel.value === panel ? 'none' : panel;
}

function startSolo() {
  store.startSolo(difficulty.value);
}

function createRoom() {
  store.createRoom({ maxPlayers: maxPlayers.value, rules: { ...rules.value } });
}

function joinRoom() {
  const code = joinCode.value.trim().toUpperCase();
  if (code.length < 3) {
    store.toast('请输入房间号');
    return;
  }
  store.joinRoom(code);
}
</script>

<template>
  <div class="home-wrap">
    <div class="hero">
      <div class="hero-cards">
        <div class="hc hc1"><UnoCard :card="demoCards.solo" size="sm" /></div>
        <div class="hc hc2"><CardBack size="sm" /></div>
        <div class="hc hc3"><UnoCard :card="demoCards.create" size="sm" /></div>
        <div class="hc hc4"><UnoCard :card="demoCards.join" size="sm" /></div>
      </div>
      <h1>UNO</h1>
      <p>经典纸牌对战 · 人机 1V1 / 多人房间</p>
    </div>

    <!-- 玩法入口 -->
    <div class="entries">
      <div class="entry-tile t-solo" :class="{ open: activePanel === 'solo' }" @click="togglePanel('solo')">
        <div class="tile-card"><UnoCard :card="demoCards.solo" size="sm" /></div>
        <div class="tile-text">
          <div class="tile-title">人机对战</div>
          <div class="tile-desc">随时开局 · 与机器人 1V1</div>
        </div>
        <span class="tile-arrow">{{ activePanel === 'solo' ? '▾' : '▸' }}</span>
      </div>

      <div class="entry-tile t-create" :class="{ open: activePanel === 'create' }" @click="togglePanel('create')">
        <div class="tile-card"><UnoCard :card="demoCards.create" size="sm" /></div>
        <div class="tile-text">
          <div class="tile-title">创建房间</div>
          <div class="tile-desc">建房邀请朋友 · 2–4 人</div>
        </div>
        <span class="tile-arrow">{{ activePanel === 'create' ? '▾' : '▸' }}</span>
      </div>

      <div class="entry-tile t-join" :class="{ open: activePanel === 'join' }" @click="togglePanel('join')">
        <div class="tile-card"><UnoCard :card="demoCards.join" size="sm" /></div>
        <div class="tile-text">
          <div class="tile-title">加入房间</div>
          <div class="tile-desc">输入房间号 · 立刻开黑</div>
        </div>
        <span class="tile-arrow">{{ activePanel === 'join' ? '▾' : '▸' }}</span>
      </div>
    </div>

    <!-- 入口展开面板 -->
    <Transition name="panel">
      <div v-if="activePanel === 'solo'" class="card-panel panel-box">
        <div class="section-title">难度</div>
        <div class="seg" style="margin-bottom: 12px">
          <button :class="{ on: difficulty === 'easy' }" @click="difficulty = 'easy'">简单</button>
          <button :class="{ on: difficulty === 'normal' }" @click="difficulty = 'normal'">普通</button>
        </div>
        <button class="primary" style="width: 100%" @click="startSolo">开始人机 1V1</button>
      </div>

      <div v-else-if="activePanel === 'create'" class="card-panel panel-box">
        <div class="section-title">人数</div>
        <div class="seg" style="margin-bottom: 12px">
          <button v-for="n in [2, 3, 4]" :key="n" :class="{ on: maxPlayers === n }" @click="maxPlayers = n">
            {{ n }} 人
          </button>
        </div>
        <div class="section-title" style="margin-top: 4px">房规</div>
        <div v-for="(label, key) in ruleLabels" :key="key" class="rule-item">
          <span>{{ label }}</span>
          <div class="switch" :class="{ on: rules[key] }" @click="rules[key] = !rules[key]">
            <i></i>
          </div>
        </div>
        <button class="primary" style="width: 100%; margin-top: 14px" @click="createRoom">创建并进入房间</button>
      </div>

      <div v-else-if="activePanel === 'join'" class="card-panel panel-box">
        <div class="section-title">房间号</div>
        <div style="display: flex; gap: 10px">
          <input v-model="joinCode" placeholder="输入 4 位房间号" maxlength="4" style="text-transform: uppercase" />
          <button class="primary" @click="joinRoom">加入</button>
        </div>
      </div>
    </Transition>

    <div class="card-panel nick-panel">
      <span class="muted">昵称</span>
      <input v-model="nameInput" placeholder="输入昵称（自动保存）" maxlength="12" />
    </div>

    <p class="muted" style="text-align: center">
      规则：与牌堆顶同色 / 同数字 / 同符号即可出牌，剩最后 1 张记得喊 UNO！
    </p>
  </div>
</template>
