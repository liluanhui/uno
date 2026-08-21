import { defineConfig } from 'vitest/config';

// 关闭结果缓存，避免向 node_modules/.vite 写入（root 所有权/CI 不可写场景）
export default defineConfig({
  test: {
    cache: false,
  },
});
