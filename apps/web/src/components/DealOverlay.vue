<script setup lang="ts">
import { computed } from 'vue';
import CardBack from './CardBack.vue';

const props = defineProps<{
  playerCount: number;
}>();

// 发牌阶段：每人 7 张，从牌堆飞向各座位
const flyCards = computed(() => {
  const total = Math.max(props.playerCount, 2) * 7;
  return Array.from({ length: Math.min(total, 28) }, (_, i) => ({
    i,
    // 轮转发牌：目标角度均分一圈，模拟飞向四周座位
    angle: (Math.floor(i / 2) / Math.ceil(total / 2)) * 360,
    delay: 1.05 + i * 0.055,
  }));
});
</script>

<template>
  <div class="deal-overlay">
    <div class="deal-stage">
      <!-- 洗牌：主牌堆左右摇摆，两沓牌交替切洗 -->
      <div class="deck-main"><CardBack size="lg" /></div>
      <div class="deck-cut c1"><CardBack size="lg" /></div>
      <div class="deck-cut c2"><CardBack size="lg" /></div>
      <!-- 发牌：牌背飞向各玩家 -->
      <div
        v-for="f in flyCards"
        :key="f.i"
        class="deal-fly"
        :style="{ '--da': f.angle + 'deg', '--dd': f.delay + 's' }"
      >
        <CardBack size="sm" />
      </div>
    </div>
    <div class="deal-label">
      <span class="label-text">洗牌 · 发牌</span>
    </div>
  </div>
</template>

<style scoped>
.deal-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.deal-stage {
  position: relative;
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.deck-main {
  animation: shuffleWiggle 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.deck-cut {
  position: absolute;
  top: 50%;
  left: 50%;
  animation: cutOut 0.5s ease-in-out infinite alternate;
}

.deck-cut.c1 {
  animation-delay: 0s;
}

.deck-cut.c2 {
  animation-delay: 0.25s;
}

.deal-fly {
  position: absolute;
  top: 50%;
  left: 50%;
  animation: dealFly 0.6s cubic-bezier(0.3, 0.1, 0.6, 1) forwards;
  animation-delay: var(--dd);
  opacity: 0;
  animation-fill-mode: both;
}

.deal-label {
  margin-top: 26px;
}

.label-text {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 6px;
  color: var(--text-muted);
  animation: labelPulse 1.1s ease-in-out infinite;
}

@keyframes shuffleWiggle {
  0%,
  100% {
    transform: rotate(-8deg) translateX(-4px);
  }
  50% {
    transform: rotate(8deg) translateX(4px);
  }
}

@keyframes cutOut {
  0% {
    transform: translate(-50%, -50%) rotate(-14deg) translateX(0px);
    opacity: 0;
  }
  35% {
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) rotate(-26deg) translateX(-58px);
    opacity: 0;
  }
}

@keyframes dealFly {
  0% {
    transform: translate(-50%, -50%) rotate(0deg) scale(1.1);
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  100% {
    transform: rotate(var(--da)) translateX(min(46vw, 240px)) rotate(calc(var(--da) * -1)) scale(0.5);
    opacity: 0;
  }
}

@keyframes labelPulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}
</style>
