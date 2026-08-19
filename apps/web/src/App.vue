<script setup lang="ts">
import { onMounted, watch, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUno } from './store';

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
    <button class="ghost theme-btn" @click="toggleTheme">{{ theme === 'light' ? '夜间' : '日间' }}</button>
  </header>

  <router-view />

  <div class="toast-wrap">
    <div v-for="t in store.toasts" :key="t.id" class="toast">{{ t.text }}</div>
  </div>
</template>
