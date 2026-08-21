import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { randomBytes, randomUUID } from 'crypto';
import { DEFAULT_RULES, GameError, HouseRules, RealColor, UnoGame } from '@uno/engine';
import type { GameEvent } from '@uno/engine';

const AI_DELAY_MIN = 700;
const AI_DELAY_MAX = 1400;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 5 * 60_000;
const VALID_COLORS: RealColor[] = ['red', 'yellow', 'green', 'blue'];

export interface User {
  id: string;
  name: string;
  token: string;
}

export interface RoomPlayer {
  userId: string;
  name: string;
  isAi: boolean;
  connected: boolean;
  ready: boolean;
  socketId: string | null;
}

export interface Room {
  code: string;
  mode: 'solo' | 'room';
  hostId: string;
  maxPlayers: number;
  rules: HouseRules;
  difficulty: 'easy' | 'normal';
  players: RoomPlayer[];
  game: UnoGame | null;
  started: boolean;
  paused: boolean;
  aiTimer: NodeJS.Timeout | null;
  cleanupTimer: NodeJS.Timeout | null;
  createdAt: number;
}

export interface GameView {
  phase: 'playing' | 'settled';
  paused: boolean;
  activeColor: string;
  direction: 1 | -1;
  pendingDraw: number;
  topCard: { id: string; color: string; kind: string; value?: number } | null;
  drawCount: number;
  discardCount: number;
  turn: number;
  currentIdx: number;
  isYourTurn: boolean;
  drewThisTurn: boolean;
  you: {
    id: string;
    hand: { id: string; color: string; kind: string; value?: number }[];
    calledUno: boolean;
    playableIds: string[];
  } | null;
  players: {
    id: string;
    name: string;
    isAi: boolean;
    connected: boolean;
    count: number;
    calledUno: boolean;
  }[];
  winnerId: string | null;
  scores: Record<string, number>;
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger('Room');
  private server: Server | null = null;
  private users = new Map<string, User>(); // token -> user
  private userIds = new Map<string, User>(); // userId -> user
  private rooms = new Map<string, Room>();
  /** 在线连接引用计数（userId -> 活跃 socket 数），用于安全回收用户记录 */
  private onlineCount = new Map<string, number>();

  setServer(server: Server) {
    this.server = server;
  }

  // ---------- 身份 ----------

  getUserByToken(token?: string): User | undefined {
    if (!token) return undefined;
    return this.users.get(token);
  }

  createUser(rawName?: string): User {
    const id = 'u' + randomUUID().slice(0, 8);
    const token = 'tk_' + randomBytes(24).toString('hex');
    const user: User = { id, name: this.sanitizeName(rawName) || `玩家${id.slice(1, 5).toUpperCase()}`, token };
    this.users.set(token, user);
    this.userIds.set(id, user);
    return user;
  }

  markOnline(userId: string) {
    this.onlineCount.set(userId, (this.onlineCount.get(userId) || 0) + 1);
  }

  markOffline(userId: string) {
    const c = (this.onlineCount.get(userId) || 0) - 1;
    if (c <= 0) this.onlineCount.delete(userId);
    else this.onlineCount.set(userId, c);
  }

  /** 回收不在任何房间且已离线的用户记录，防止 users Map 无限增长 */
  gcUser(userId: string) {
    if (this.onlineCount.has(userId)) return; // 仍在线
    for (const room of this.rooms.values()) {
      if (room.players.some((p) => p.userId === userId)) return; // 仍在房间（重连窗口）
    }
    const user = this.userIds.get(userId);
    if (!user) return;
    this.userIds.delete(userId);
    this.users.delete(user.token);
  }

  rename(userId: string, name: string) {
    const user = this.userIds.get(userId);
    if (!user) return;
    user.name = this.sanitizeName(name) || user.name;
    // 同步到所有房间里的玩家副本，避免改名后房内仍显示旧名
    for (const room of this.rooms.values()) {
      const rp = room.players.find((p) => p.userId === userId);
      if (rp) rp.name = user.name;
    }
  }

  private sanitizeName(name?: string): string {
    return (name || '').trim().slice(0, 12);
  }

  private parseColor(c?: string): RealColor | undefined {
    if (!c) return undefined;
    if (!VALID_COLORS.includes(c as RealColor)) throw new GameError('bad_color', '颜色非法');
    return c as RealColor;
  }

  // ---------- 房间 ----------

  createRoom(
    host: User,
    opts: { mode?: 'solo' | 'room'; maxPlayers?: number; rules?: Partial<HouseRules>; difficulty?: string } = {},
  ): Room {
    const mode = opts.mode === 'solo' ? 'solo' : 'room';
    const maxPlayers = mode === 'solo' ? 2 : Math.min(4, Math.max(2, opts.maxPlayers ?? 2));
    const rules: HouseRules = { ...DEFAULT_RULES, ...(opts.rules || {}) };
    const difficulty: 'easy' | 'normal' = opts.difficulty === 'easy' ? 'easy' : 'normal';
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = {
      code,
      mode,
      hostId: host.id,
      maxPlayers,
      rules,
      difficulty,
      players: [
        { userId: host.id, name: host.name, isAi: false, connected: false, ready: mode === 'solo', socketId: null },
      ],
      game: null,
      started: false,
      paused: false,
      aiTimer: null,
      cleanupTimer: null,
      createdAt: Date.now(),
    };
    if (mode === 'solo') {
      const aiName = difficulty === 'easy' ? 'UNO 新手机器人' : 'UNO 机器人';
      room.players.push({ userId: `ai:${code}`, name: aiName, isAi: true, connected: true, ready: true, socketId: null });
    }
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get((code || '').toUpperCase().trim());
  }

  joinRoom(code: string, user: User, socketId: string): { room: Room; game?: UnoGame } {
    const room = this.getRoom(code);
    if (!room) throw new GameError('room_not_found', '房间不存在');
    let player = room.players.find((p) => p.userId === user.id);
    if (player) {
      // 重连：清理可能残留的 AI 托管定时器，让玩家自行接管回合
      player.connected = true;
      player.socketId = socketId;
      this.clearTimer(room, 'aiTimer');
      this.clearTimer(room, 'cleanupTimer');
    } else {
      if (room.started) throw new GameError('room_started', '对局已开始，无法加入');
      if (room.players.length >= room.maxPlayers) throw new GameError('room_full', '房间已满');
      player = { userId: user.id, name: user.name, isAi: false, connected: true, ready: false, socketId };
      room.players.push(player);
    }
    this.maybeStart(room);
    return { room, game: room.game || undefined };
  }

  leaveRoom(code: string, userId: string, socketId: string) {
    const room = this.getRoom(code);
    if (!room) return;
    const player = room.players.find((p) => p.userId === userId);
    if (!player || (player.socketId && player.socketId !== socketId)) return;
    player.connected = false;
    player.socketId = null;
    if (!room.started) {
      room.players = room.players.filter((p) => p !== player);
      if (room.hostId === userId && room.players.length > 0) {
        const next = room.players.find((p) => !p.isAi);
        if (next) room.hostId = next.userId;
      }
    }
    this.broadcastRoomState(room);
    const anyConnected = room.players.some((p) => !p.isAi && p.connected);
    if (!anyConnected) {
      // 无人在线，稍后回收房间
      this.clearTimer(room, 'cleanupTimer');
      room.cleanupTimer = setTimeout(() => this.destroyRoom(room), ROOM_TTL_MS);
    } else if (!room.paused && room.started && room.game?.phase === 'playing' && room.game.current.id === userId) {
      // 掉线者正处于回合 → AI 托管，避免对局卡死
      this.scheduleAi(room);
    }
  }

  setReady(code: string, userId: string, ready: boolean) {
    const room = this.getRoom(code);
    if (!room) throw new GameError('room_not_found', '房间不存在');
    if (room.started) return;
    const player = room.players.find((p) => p.userId === userId);
    if (!player) throw new GameError('not_in_room', '你不在房间里');
    player.ready = ready;
    this.broadcastRoomState(room);
    this.maybeStart(room);
  }

  restart(code: string, userId: string) {
    const room = this.getRoom(code);
    if (!room) throw new GameError('room_not_found', '房间不存在');
    if (userId !== room.hostId) throw new GameError('not_host', '只有房主能开始新一局');
    if (!room.started) return;
    this.clearTimer(room, 'aiTimer');
    this.startGame(room);
  }

  // ---------- 暂停 / 继续 ----------

  pause(code: string, userId: string) {
    const room = this.requireGame(code);
    if (room.paused) return;
    if (room.game!.phase !== 'playing') throw new GameError('not_playing', '当前阶段不能暂停');
    if (userId !== room.hostId) throw new GameError('not_host', '只有房主能暂停');
    room.paused = true;
    // 冻结 AI 托管，避免暂停期间继续推进
    this.clearTimer(room, 'aiTimer');
    this.broadcastGameState(room, []);
    this.logger.log(`房间 ${room.code} 已暂停（by ${userId}）`);
  }

  resume(code: string, userId: string) {
    const room = this.requireGame(code);
    if (!room.paused) return;
    if (userId !== room.hostId) throw new GameError('not_host', '只有房主能继续');
    room.paused = false;
    this.broadcastGameState(room, []);
    // 按当前回合重新调度（人 → 回合定时器；AI/掉线 → 托管）
    this.afterTurn(room);
    this.logger.log(`房间 ${room.code} 已继续（by ${userId}）`);
  }

  private maybeStart(room: Room) {
    if (room.started) return;
    if (room.mode === 'solo') {
      this.startGame(room);
      return;
    }
    const humans = room.players.filter((p) => !p.isAi);
    if (humans.length >= 2 && humans.every((p) => p.ready)) {
      this.startGame(room);
    }
  }

  private startGame(room: Room) {
    const metas = room.players.map((p) => ({ id: p.userId, name: p.name, isAi: p.isAi }));
    room.game = new UnoGame(metas, room.rules);
    room.started = true;
    room.paused = false;
    for (const p of room.players) p.ready = false;
    this.logger.log(`房间 ${room.code} 开始对局，${room.players.length} 名玩家`);
    this.broadcastRoomState(room);
    // 先广播发牌动画事件，客户端播完洗牌/发牌动效再亮出牌桌
    this.emitToRoom(room, 'game:dealing', { players: room.players.length });
    this.broadcastGameState(room, []);
    this.afterTurn(room);
  }

  // ---------- 对局操作 ----------

  playCard(code: string, userId: string, cardId: string, chosenColor?: string, targetPlayerId?: string) {
    const room = this.requireActiveGame(code);
    const color = this.parseColor(chosenColor);
    const events = room.game!.playCard(userId, cardId, color, targetPlayerId);
    this.broadcastGameState(room, events);
    this.afterTurn(room);
  }

  drawCard(code: string, userId: string) {
    const room = this.requireActiveGame(code);
    const events = room.game!.drawCard(userId);
    this.broadcastGameState(room, events);
    this.afterTurn(room);
  }

  pass(code: string, userId: string) {
    const room = this.requireActiveGame(code);
    const events = room.game!.pass(userId);
    this.broadcastGameState(room, events);
    this.afterTurn(room);
  }

  callUno(code: string, userId: string) {
    const room = this.requireActiveGame(code);
    const events = room.game!.callUno(userId);
    this.broadcastGameState(room, events);
  }

  catchUno(code: string, userId: string, targetId: string) {
    const room = this.requireActiveGame(code);
    const events = room.game!.catchUno(userId, targetId);
    this.broadcastGameState(room, events);
  }

  private requireGame(code: string): Room {
    const room = this.getRoom(code);
    if (!room?.game) throw new GameError('room_not_found', '房间或对局不存在');
    return room;
  }

  /** 对局操作前置：暂停期间拒绝一切写操作 */
  private requireActiveGame(code: string): Room {
    const room = this.requireGame(code);
    if (room.paused) throw new GameError('paused', '对局已暂停，等待继续');
    return room;
  }

  // ---------- 回合调度 ----------

  private afterTurn(room: Room) {
    if (room.paused) return;
    const game = room.game;
    if (!game || game.phase !== 'playing') {
      this.clearTimer(room, 'aiTimer');
      this.broadcastRoomState(room);
      return;
    }
    this.clearTimer(room, 'aiTimer');
    const cur = game.current;
    const roomPlayer = room.players.find((p) => p.userId === cur.id);
    // 仅 AI 玩家与掉线人类需要托管；在线人类玩家不设倒计时，由其自主出牌
    const needAi = cur.isAi || !roomPlayer || !roomPlayer.connected;
    if (needAi) this.scheduleAi(room);
  }

  private scheduleAi(room: Room) {
    if (room.paused) return;
    this.clearTimer(room, 'aiTimer');
    const delay = AI_DELAY_MIN + Math.random() * (AI_DELAY_MAX - AI_DELAY_MIN);
    room.aiTimer = setTimeout(() => {
      const game = room.game;
      if (!game || game.phase !== 'playing') return;
      const cur = game.current;
      // 硬防御：仅 AI 玩家与掉线人类才托管出牌；在线人类回合一律不自动出牌，
      // 即便上游 needAi 因竞态误判，这里也能兜住，绝不替在线玩家出牌
      const rp = room.players.find((p) => p.userId === cur.id);
      if (!cur.isAi && rp && rp.connected) {
        this.afterTurn(room);
        return;
      }
      try {
        // 复用引擎的 forceAction（摸牌后继续决策等逻辑统一在引擎内），避免双份实现漂移
        let events: GameEvent[] = game.forceAction(cur.id, room.difficulty);
        // AI 剩 1 张时大概率自动喊 UNO（少数情况漏喊，可被玩家抓）
        const aiPlayer = game.players.find((p) => p.id === cur.id);
        if (game.phase === 'playing' && aiPlayer && aiPlayer.hand.length === 1 && !aiPlayer.calledUno) {
          if (Math.random() < 0.85) events = [...events, ...game.callUno(cur.id)];
        }
        this.broadcastGameState(room, events);
        this.afterTurn(room);
      } catch (e) {
        this.logger.warn(`AI 执行失败: ${(e as Error).message}`);
        // 兜底推进回合，避免对局卡死
        try {
          this.afterTurn(room);
        } catch {
          /* ignore */
        }
      }
    }, delay);
  }

  private clearTimer(room: Room, key: 'aiTimer' | 'cleanupTimer') {
    if (room[key]) {
      clearTimeout(room[key]!);
      room[key] = null;
    }
  }

  private destroyRoom(room: Room) {
    this.clearTimer(room, 'aiTimer');
    this.clearTimer(room, 'cleanupTimer');
    const humanUserIds = room.players.filter((p) => !p.isAi).map((p) => p.userId);
    this.rooms.delete(room.code);
    this.logger.log(`房间 ${room.code} 已回收`);
    for (const uid of humanUserIds) this.gcUser(uid);
  }

  // ---------- 广播 ----------

  private emitToRoom(room: Room, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(`room:${room.code}`).emit(event, payload);
  }

  broadcastRoomState(room: Room) {
    if (!this.server) return;
    this.emitToRoom(room, 'room:state', this.roomState(room));
  }

  broadcastGameState(room: Room, events: GameEvent[]) {
    if (!this.server) return;
    // UNO 宣言 → 全房间广播特效事件（所有玩家屏幕播放 UNO 爆炸）
    for (const ev of events) {
      if (ev.type === 'unoCalled') {
        const p = room.players.find((x) => x.userId === ev.playerId);
        this.emitToRoom(room, 'game:uno', { userId: ev.playerId, name: p?.name || '' });
      }
    }
    for (const player of room.players) {
      if (player.isAi || !player.socketId) continue;
      const view = this.viewFor(room, player.userId);
      if (!view) continue;
      const socket = this.server.sockets.sockets.get(player.socketId);
      if (!socket) continue;
      socket.emit('game:state', { events, state: view });
    }
  }

  sendGameStateTo(room: Room, socketId: string, userId: string) {
    if (!this.server) return;
    const view = this.viewFor(room, userId);
    if (!view) return;
    const socket = this.server.sockets.sockets.get(socketId);
    if (!socket) return;
    socket.emit('game:state', { events: [], state: view });
  }

  roomState(room: Room) {
    return {
      code: room.code,
      mode: room.mode,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      rules: room.rules,
      difficulty: room.difficulty,
      started: room.started,
      players: room.players.map((p) => ({
        userId: p.userId,
        name: p.name,
        isAi: p.isAi,
        connected: p.connected,
        ready: p.ready,
      })),
    };
  }

  viewFor(room: Room, userId: string): GameView | null {
    const game = room.game;
    if (!game) return null;
    const me = game.players.find((p) => p.id === userId);
    const isYourTurn = game.current.id === userId;
    return {
      phase: game.phase,
      paused: room.paused,
      activeColor: game.activeColor,
      direction: game.direction,
      pendingDraw: game.pendingDraw,
      topCard: game.top,
      drawCount: game.drawPile.length,
      discardCount: game.discardPile.length,
      turn: game.turn,
      currentIdx: game.currentIdx,
      isYourTurn,
      drewThisTurn: isYourTurn && game.drewThisTurn,
      you: me
        ? {
            id: me.id,
            hand: me.hand,
            calledUno: me.calledUno,
            playableIds: isYourTurn ? me.hand.filter((c) => game.canPlay(c)).map((c) => c.id) : [],
          }
        : null,
      players: game.players.map((p) => ({
        id: p.id,
        name: p.name,
        isAi: p.isAi,
        connected: p.connected,
        count: p.hand.length,
        calledUno: p.calledUno,
      })),
      winnerId: game.winnerId,
      scores: game.scores,
    };
  }
}
