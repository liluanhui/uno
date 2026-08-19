<script setup lang="ts">
import { computed } from 'vue';
import type { CardT } from '../store';

const props = defineProps<{
  card: CardT;
  playable?: boolean;
  dim?: boolean;
  size?: 'md' | 'sm';
}>();

const colorClass = computed(() => `c-${props.card.color}`);

const glyph = computed(() => {
  const c = props.card;
  if (c.kind === 'number') return String(c.value);
  if (c.kind === 'skip') return '⊘';
  if (c.kind === 'reverse') return '⇄';
  if (c.kind === 'draw2') return '+2';
  if (c.kind === 'wild4') return '+4';
  return '';
});

const isWild = computed(() => props.card.color === 'wild');
</script>

<template>
  <div
    class="uno-card"
    :class="[colorClass, size === 'sm' ? 'sm' : '', playable ? 'playable' : '', dim ? 'dim' : '']"
  >
    <span v-if="!isWild" class="corner">{{ glyph }}</span>
    <span v-if="isWild" class="wild-quads">
      <i style="background: var(--red)"></i><i style="background: var(--blue)"></i>
      <i style="background: var(--yellow)"></i><i style="background: var(--green)"></i>
    </span>
    <span v-else>{{ glyph }}</span>
    <span v-if="card.kind === 'wild4'" class="wild4-tag">+4</span>
    <span v-if="card.kind === 'draw2'" class="card-plus">+2</span>
  </div>
</template>

<style scoped>
.wild4-tag {
  position: absolute;
  bottom: 6px;
  right: 8px;
  font-size: 13px;
  font-weight: 800;
}
</style>
