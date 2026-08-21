<script setup lang="ts">
import { onMounted, watch, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUno } from './store';
import { muted as soundMuted, toggleMute } from './sfx';

const store = useUno();
const router = useRouter();
const theme = ref(localStorage.getItem('uno.theme') || 'light');

function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme.value);
  localStorage.setItem('uno.theme', theme.value);
}

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light';
  applyTheme();
}

onMounted(() => {
  applyTheme();
  store.connect();
});

watch(
  () => store.room,
  (room) => {
    if (room && router.currentRoute.value.path !== '/play') router.push('/play');
    if (!room && router.currentRoute.value.path === '/play') router.push('/');
  },
);
</script>

<template>
  <header class="app-header">
    <div class="logo">
      <span class="logo-dots">
        <i style="background: var(--red)"></i><i style="background: var(--blue)"></i>
        <i style="background: var(--yellow)"></i><i style="background: var(--green)"></i>
      </span>
      UNO
    </div>
    <div class="header-actions">
      <button
        class="ghost icon-btn"
        @click="toggleMute"
        :aria-label="soundMuted ? '开启音效' : '关闭音效'"
        :title="soundMuted ? '开启音效' : '关闭音效'"
      >
        {{ soundMuted ? '🔇' : '🔊' }}
      </button>
      <button class="ghost theme-btn" @click="toggleTheme">{{ theme === 'light' ? '夜间' : '日间' }}</button>
    </div>
  </header>

  <router-view />

  <div class="toast-wrap">
    <div v-for="t in store.toasts" :key="t.id" class="toast">{{ t.text }}</div>
  </div>
</template>
