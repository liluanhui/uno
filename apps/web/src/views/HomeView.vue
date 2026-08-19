<script setup lang="ts">
import { ref, watch } from 'vue';
import { useUno } from '../store';

const store = useUno();
const nameInput = ref(store.name);

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

function avatarColor(name: string): string {
  const colors = ['var(--red)', 'var(--blue)', 'var(--green)', 'var(--yellow)'];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return colors[h % 4];
}
</script>

<template>
  <div class="home-wrap">
    <div class="hero">
      <h1>UNO</h1>
      <p>经典纸牌对战 · 人机 1V1 / 多人房间</p>
    </div>

    <div class="card-panel">
      <div class="section-title">你的昵称</div>
      <input v-model="nameInput" placeholder="输入昵称（自动保存）" maxlength="12" />
    </div>

    <div class="card-panel">
      <div class="section-title">人机对战</div>
      <div class="seg" style="margin-bottom: 12px">
        <button :class="{ on: difficulty === 'easy' }" @click="difficulty = 'easy'">简单</button>
        <button :class="{ on: difficulty === 'normal' }" @click="difficulty = 'normal'">普通</button>
      </div>
      <button class="primary" style="width: 100%" @click="startSolo">开始人机 1V1</button>
    </div>

    <div class="card-panel">
      <div class="section-title">创建房间</div>
      <div class="muted" style="margin-bottom: 6px">人数</div>
      <div class="seg" style="margin-bottom: 10px">
        <button v-for="n in [2, 3, 4]" :key="n" :class="{ on: maxPlayers === n }" @click="maxPlayers = n">
          {{ n }} 人
        </button>
      </div>
      <div class="muted" style="margin-bottom: 2px">房规</div>
      <div v-for="(label, key) in ruleLabels" :key="key" class="rule-item">
        <span>{{ label }}</span>
        <div class="switch" :class="{ on: rules[key] }" @click="rules[key] = !rules[key]">
          <i></i>
        </div>
      </div>
      <button class="primary" style="width: 100%; margin-top: 14px" @click="createRoom">创建并进入房间</button>
    </div>

    <div class="card-panel">
      <div class="section-title">加入房间</div>
      <div style="display: flex; gap: 10px">
        <input v-model="joinCode" placeholder="输入 4 位房间号" maxlength="4" style="text-transform: uppercase" />
        <button class="primary" @click="joinRoom">加入</button>
      </div>
    </div>

    <p class="muted" style="text-align: center">
      规则：与牌堆顶同色 / 同数字 / 同符号即可出牌，剩最后 1 张记得喊 UNO！
    </p>
  </div>
</template>
