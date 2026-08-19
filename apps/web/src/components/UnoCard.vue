<script setup lang="ts">
import { computed } from 'vue';
import type { CardT } from '../store';

const props = defineProps<{
  card: CardT;
  playable?: boolean;
  dim?: boolean;
  size?: 'md' | 'sm' | 'lg';
}>();

const uid = 'uc' + Math.random().toString(36).slice(2, 9);

const PALETTE: Record<string, { main: string; edge: string }> = {
  red: { main: '#e9403b', edge: '#b52a26' },
  blue: { main: '#0a8fdd', edge: '#0a6fae' },
  yellow: { main: '#f5be18', edge: '#cc9a06' },
  green: { main: '#3faa28', edge: '#2f811b' },
  wild: { main: '#222228', edge: '#0c0c10' },
};

const FONT = "'Arial Black','Avenir Next Heavy','PingFang SC',Helvetica,sans-serif";

// 反转牌的双箭头（局部坐标，指向 dir 方向）
function arrowPath(dir: 1 | -1): string {
  return dir === 1
    ? 'M-20 -8 h13 v-10 l23 18 -23 18 v-10 h-13 z'
    : 'M20 -8 h-13 v-10 l-23 18 23 18 v-10 h-13 z';
}

const svg = computed(() => {
  const col = PALETTE[props.card.color] || PALETTE.wild;
  const k = props.card.kind;
  const isWild = props.card.color === 'wild';
  const ink = isWild ? '#fff' : col.main;
  let oval = '';
  let center = '';
  let cornerTL = '';
  let cornerBR = '';

  if (k === 'number') {
    center = `<text x="60" y="93" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-family="${FONT}" font-weight="900" font-style="italic" font-size="64">${props.card.value}</text>`;
    cornerTL = `<text x="18" y="20" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="${FONT}" font-weight="900" font-style="italic" font-size="22">${props.card.value}</text>`;
    cornerBR = `<text x="102" y="160" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="${FONT}" font-weight="900" font-style="italic" font-size="22" transform="rotate(180 102 160)">${props.card.value}</text>`;
  } else if (k === 'skip') {
    const icon = (r: number, sw: number, fill: string) =>
      `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${fill}" stroke-width="${sw}"/><line x1="${-r * 0.68}" y1="${-r * 0.68}" x2="${r * 0.68}" y2="${r * 0.68}" stroke="${fill}" stroke-width="${sw}"/>`;
    center = `<g transform="translate(60 90)">${icon(25, 9, ink)}</g>`;
    cornerTL = `<g transform="translate(18 20) scale(0.42)">${icon(25, 9, '#fff')}</g>`;
    cornerBR = `<g transform="translate(102 160) scale(0.42) rotate(180)">${icon(25, 9, '#fff')}</g>`;
  } else if (k === 'reverse') {
    const icon = (s: number, fill: string) =>
      `<g transform="scale(${s})"><path d="${arrowPath(1)}" transform="translate(0 -17)" fill="${fill}"/><path d="${arrowPath(-1)}" transform="translate(0 17)" fill="${fill}"/></g>`;
    center = `<g transform="translate(60 90) rotate(-40)">${icon(1.15, ink)}</g>`;
    cornerTL = `<g transform="translate(18 20) rotate(-40) scale(0.3)">${icon(1.15, '#fff')}</g>`;
    cornerBR = `<g transform="translate(102 160) rotate(-40) scale(0.3) rotate(180)">${icon(1.15, '#fff')}</g>`;
  } else if (k === 'draw2') {
    const icon = (s: number, fill: string) =>
      `<g transform="scale(${s})"><rect x="-30" y="-25" width="27" height="40" rx="4" fill="${fill}" stroke="#fff" stroke-width="3" transform="rotate(-14 -16 -5)"/><rect x="-4" y="-15" width="27" height="40" rx="4" fill="${fill}" stroke="#fff" stroke-width="3" transform="rotate(10 9 5)"/></g>`;
    center = `<g transform="translate(60 90)">${icon(1.1, ink)}</g>`;
    cornerTL = `<text x="18" y="20" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="${FONT}" font-weight="900" font-style="italic" font-size="21">+2</text>`;
    cornerBR = `<text x="102" y="160" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="${FONT}" font-weight="900" font-style="italic" font-size="21" transform="rotate(180 102 160)">+2</text>`;
  } else if (k === 'wild') {
    // 万能变色：斜椭圆四色分区
    oval = `<defs><clipPath id="${uid}"><ellipse cx="60" cy="90" rx="37" ry="60"/></clipPath></defs>
      <g transform="rotate(34 60 90)"><g clip-path="url(#${uid})">
        <rect x="23" y="30" width="37" height="60" fill="#e9403b"/>
        <rect x="60" y="30" width="37" height="60" fill="#0a8fdd"/>
        <rect x="23" y="90" width="37" height="60" fill="#f5be18"/>
        <rect x="60" y="90" width="37" height="60" fill="#3faa28"/>
      </g></g>`;
  } else if (k === 'wild4') {
    // 万能 +4：白椭圆 + 四色小牌扇
    center = `<g transform="translate(60 92)">
      <rect x="-36" y="-24" width="23" height="35" rx="3" fill="#e9403b" stroke="#fff" stroke-width="2.5" transform="rotate(-30 -24 -6)"/>
      <rect x="-16" y="-28" width="23" height="35" rx="3" fill="#0a8fdd" stroke="#fff" stroke-width="2.5" transform="rotate(-11 -4 -10)"/>
      <rect x="3" y="-24" width="23" height="35" rx="3" fill="#f5be18" stroke="#fff" stroke-width="2.5" transform="rotate(10 14 -6)"/>
      <rect x="-12" y="-16" width="23" height="35" rx="3" fill="#3faa28" stroke="#fff" stroke-width="2.5" transform="rotate(28 0 1)"/>
    </g>`;
    cornerTL = `<text x="19" y="20" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="${FONT}" font-weight="900" font-style="italic" font-size="20">+4</text>`;
    cornerBR = `<text x="101" y="160" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="${FONT}" font-weight="900" font-style="italic" font-size="20" transform="rotate(180 101 160)">+4</text>`;
  }

  const whiteOval =
    k === 'wild' || k === 'wild4'
      ? ''
      : `<ellipse cx="60" cy="90" rx="37" ry="60" fill="#fff" transform="rotate(34 60 90)"/>`;

  return `<svg viewBox="0 0 120 180" xmlns="http://www.w3.org/2000/svg" class="uno-svg">
    <defs>
      <linearGradient id="${uid}-gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.30"/>
        <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.05"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.16"/>
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="114" height="174" rx="14" fill="${col.main}"/>
    <rect x="3" y="3" width="114" height="174" rx="14" fill="url(#${uid}-gloss)"/>
    <rect x="7" y="7" width="106" height="166" rx="11" fill="none" stroke="#ffffff" stroke-width="5"/>
    ${whiteOval}
    ${oval}
    ${cornerTL}
    ${cornerBR}
    ${center}
  </svg>`;
});
</script>

<template>
  <div
    class="uno-card"
    :class="[size ? 'sz-' + size : 'sz-md', playable ? 'playable' : '', dim ? 'dim' : '']"
    v-html="svg"
  ></div>
</template>

<style scoped>
.uno-card {
  position: relative;
  border-radius: 10px;
  flex: none;
  user-select: none;
  filter: drop-shadow(0 3px 6px rgba(15, 16, 24, 0.35));
  transition: transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.3), filter 0.18s ease;
}

.uno-card :deep(.uno-svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.sz-md { width: 62px; height: 93px; }
.sz-lg { width: 78px; height: 117px; }
.sz-sm { width: 30px; height: 45px; }

.uno-card.dim {
  filter: grayscale(0.6) brightness(0.72) drop-shadow(0 2px 4px rgba(15, 16, 24, 0.3));
}

.uno-card.playable {
  cursor: pointer;
}
</style>
