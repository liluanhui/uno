<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  fx: { id: number; name: string } | null;
}>();

const COLORS = ['#e9403b', '#0a8fdd', '#f5be18', '#3faa28'];

// 以 fx.id 为种子的伪随机，保证每次特效粒子方向稳定渲染
function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const particles = computed(() => {
  if (!props.fx) return [];
  return Array.from({ length: 16 }, (_, i) => {
    const a = rand(props.fx!.id * 31 + i) * Math.PI * 2;
    const dist = 130 + rand(props.fx!.id * 17 + i) * 150;
    const size = 10 + Math.round(rand(props.fx!.id * 7 + i) * 12);
    return {
      tx: `${Math.cos(a) * dist}px`,
      ty: `${Math.sin(a) * dist}px`,
      rot: `${Math.round(rand(props.fx!.id * 13 + i) * 360)}deg`,
      color: COLORS[i % 4],
      size: `${size}px`,
      delay: `${(rand(props.fx!.id * 3 + i) * 0.12).toFixed(2)}s`,
    };
  });
});
</script>

<template>
  <div v-if="fx" class="uno-burst" :key="fx.id">
    <div class="burst-ring r1"></div>
    <div class="burst-ring r2"></div>
    <div class="burst-ring r3"></div>
    <span
      v-for="(p, i) in particles"
      :key="i"
      class="burst-particle"
      :style="{
        '--tx': p.tx,
        '--ty': p.ty,
        '--rot': p.rot,
        '--pc': p.color,
        '--ps': p.size,
        '--pd': p.delay,
      }"
    ></span>
    <div class="burst-word">UNO!</div>
    <div class="burst-name">{{ fx.name }} 只剩最后一张牌</div>
  </div>
</template>

<style scoped>
.uno-burst {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  animation: burstFade 1.7s ease forwards;
}

.burst-word {
  font-size: clamp(72px, 24vw, 160px);
  font-weight: 900;
  font-style: italic;
  letter-spacing: 2px;
  line-height: 1;
  background: linear-gradient(100deg, #e9403b 12%, #f5be18 34%, #3faa28 55%, #0a8fdd 82%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 4px 18px rgba(20, 21, 27, 0.45)) drop-shadow(0 0 26px rgba(244, 83, 78, 0.55));
  animation: unoBoom 0.85s cubic-bezier(0.16, 1.5, 0.3, 1) both;
}

.burst-name {
  margin-top: 10px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  background: rgba(20, 21, 27, 0.72);
  padding: 5px 16px;
  border-radius: 999px;
  animation: namePop 0.5s 0.35s cubic-bezier(0.2, 1.2, 0.3, 1.2) both;
}

.burst-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 110px;
  height: 110px;
  margin: -55px 0 0 -55px;
  border-radius: 50%;
  border: 5px solid #fff;
  animation: ringOut 0.9s ease-out both;
}

.burst-ring.r2 {
  animation-delay: 0.14s;
  border-color: rgba(244, 83, 78, 0.85);
}

.burst-ring.r3 {
  animation-delay: 0.28s;
  border-color: rgba(255, 255, 255, 0.5);
}

.burst-particle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--ps);
  height: calc(var(--ps) * 1.5);
  border-radius: 4px;
  background: var(--pc);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  animation: particleFly 0.85s var(--pd) cubic-bezier(0.15, 0.8, 0.35, 1) both;
}

@keyframes unoBoom {
  0% {
    transform: scale(0.1) rotate(-18deg);
    opacity: 0;
  }
  55% {
    transform: scale(1.18) rotate(3deg);
    opacity: 1;
  }
  75% {
    transform: scale(0.96) rotate(-2deg);
  }
  100% {
    transform: scale(1) rotate(-3deg);
    opacity: 1;
  }
}

@keyframes namePop {
  from {
    transform: translateY(10px) scale(0.8);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

@keyframes ringOut {
  0% {
    transform: scale(0.2);
    opacity: 0.95;
  }
  100% {
    transform: scale(4.2);
    opacity: 0;
  }
}

@keyframes particleFly {
  0% {
    transform: translate(0, 0) rotate(0deg) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(0.4);
    opacity: 0;
  }
}

@keyframes burstFade {
  0%,
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
</style>
