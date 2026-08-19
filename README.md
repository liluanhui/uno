# UNO 网页对战

移动端优先的网页 UNO 游戏：人机 1V1 + 房间多人对战（2–4 人）。

## 技术栈

- **前端** `apps/web`：Vue 3 + TypeScript + Vite + Pinia + Vue Router + socket.io-client
- **后端** `apps/api`：NestJS + Socket.IO（权威判定全在服务端）
- **核心引擎** `packages/uno-engine`：纯 TS 状态机（108 张牌全套规则 + AI 策略），前后端共享

## 快速开始

```bash
pnpm install

# 1. 启动 API（默认端口 5001，可用 PORT 覆盖）
pnpm build:api && pnpm dev:api

# 2. 启动前端（默认端口 5173，已代理 socket.io；可用 WEB_PORT / API_PORT 覆盖）
pnpm dev:web
```

打开 http://localhost:5173 即可游玩。

> 若默认端口被占用：`PORT=5002 pnpm dev:api` + `API_PORT=5002 WEB_PORT=5174 pnpm dev:web`，
> 冒烟测试同样支持 `API_URL=http://localhost:5002 node scripts/smoke.cjs`。

## 测试

```bash
pnpm test:engine      # 引擎单元测试（25 例）
node scripts/smoke.cjs # 端到端冒烟测试（需先启动 API）
```

## 玩法与规则

- 与弃牌堆顶**同色 / 同数字 / 同符号**即可出牌，万能牌任何时候可出
- 功能牌：跳过 ⊘ / 反转 ⇄ / +2；万能：变色 / 变色 +4
- 剩 1 张牌时记得喊 **UNO!**，没喊被对手抓到罚摸 2 张
- 摸 1 张后仍无可出可"过"；+2/+4 默认可叠（房规可关）

### 房规（创建房间时配置）

| 房规 | 说明 |
|------|------|
| 叠 +2/+4 | 被加牌时可用 +2/+4 顺延惩罚 |
| 七换零 | 打 7 与指定玩家换手牌，打 0 全员手牌平移 |
| 摸到能出 | 摸牌一直摸到有牌可出 |
| 末张非功能牌 | 最后一张必须是数字牌 |

## 架构说明

- 所有出牌判定在服务端 `uno-engine` 完成，客户端只做表现层；广播的对局快照**不包含其他玩家手牌**
- 对局状态为纯 JSON 快照，天然支持断线重连（重连保留座位，掉线期间 AI 托管）
- 回合 30 秒超时自动托管；房间全员准备后自动开局
- 游客自动登录（token 存 localStorage），无需注册

## 视觉与动效

- 牌面为 SVG 绘制的经典 UNO 样式（斜椭圆 + 角标 + 功能牌图标 + 四色万能牌 + UNO 字标牌背）
- 开局有洗牌、发牌动效（服务端广播 `game:dealing`）；喊 UNO 时全房间播放爆炸特效（`game:uno`）
- 对手手牌以牌背扇形 + 张数展示；弃牌堆呈随机角度堆叠的"凌乱"效果
- 出牌/摸牌均有飞入飞出动画；移动端优先布局，支持亮/暗主题
