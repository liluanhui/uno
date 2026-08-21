/** 统一运行时配置入口，避免端口/CORS 等散落多处漂移 */
export const CONFIG = {
  port: Number(process.env.PORT) || 5001,
  // 默认放行所有来源（本地开发）；生产可通过 CORS_ORIGIN=http://xxx 收敛
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
