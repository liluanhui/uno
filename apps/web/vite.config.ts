import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    proxy: {
      '/socket.io': {
        target: `http://localhost:${process.env.API_PORT || 5001}`,
        ws: true,
      },
    },
  },
});
