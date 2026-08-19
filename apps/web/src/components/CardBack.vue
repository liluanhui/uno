<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  size?: 'md' | 'sm' | 'lg';
  tilt?: boolean;
}>();

const uid = 'bk' + Math.random().toString(36).slice(2, 9);
const FONT = "'Arial Black','Avenir Next Heavy',Helvetica,sans-serif";

const svg = computed(() => `<svg viewBox="0 0 120 180" xmlns="http://www.w3.org/2000/svg" class="uno-svg">
  <defs>
    <linearGradient id="${uid}-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#26272f"/>
      <stop offset="1" stop-color="#14151b"/>
    </linearGradient>
    <linearGradient id="${uid}-gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.22"/>
    </linearGradient>
    <radialGradient id="${uid}-oval" cx="0.4" cy="0.32" r="0.9">
      <stop offset="0" stop-color="#f4534e"/>
      <stop offset="0.55" stop-color="#e2322d"/>
      <stop offset="1" stop-color="#b5201c"/>
    </radialGradient>
  </defs>
  <rect x="3" y="3" width="114" height="174" rx="14" fill="url(#${uid}-bg)"/>
  <rect x="3" y="3" width="114" height="174" rx="14" fill="url(#${uid}-gloss)"/>
  <rect x="7" y="7" width="106" height="166" rx="11" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="5"/>
  <ellipse cx="60" cy="90" rx="36" ry="58" fill="url(#${uid}-oval)" transform="rotate(34 60 90)"/>
  <ellipse cx="60" cy="90" rx="29" ry="51" fill="none" stroke="#14151b" stroke-width="5" transform="rotate(34 60 90)"/>
  <text x="60" y="92" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="${FONT}"
    font-weight="900" font-style="italic" font-size="38" letter-spacing="1" transform="rotate(34 60 90)">UNO</text>
</svg>`);
</script>

<template>
  <div class="card-back" :class="size ? 'sz-' + size : 'sz-md'" v-html="svg"></div>
</template>

<style scoped>
.card-back {
  position: relative;
  border-radius: 10px;
  flex: none;
  user-select: none;
  filter: drop-shadow(0 3px 6px rgba(15, 16, 24, 0.35));
}

.card-back :deep(.uno-svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.sz-md { width: var(--cw-md, 62px); height: calc(var(--cw-md, 62px) * 1.5); }
.sz-lg { width: var(--cw-lg, 78px); height: calc(var(--cw-lg, 78px) * 1.5); }
.sz-sm { width: var(--cw-sm, 30px); height: calc(var(--cw-sm, 30px) * 1.5); }
</style>
