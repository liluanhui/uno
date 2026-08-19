import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { aiChoose, DEFAULT_RULES, GameError, HouseRules, UnoGame } from '@uno/engine';

const TURN_TIMEOUT_MS = 30_000;
const AI_DELAY_MIN = 700;
const AI_DELAY_MAX = 1400;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 5 * 60_000;

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
  players: RoomPlayer[];
  game: UnoGame | null;
  started: boolean;
  turnTimer: NodeJS.Timeout | null;
  aiTimer: NodeJS.Timeout | null;
  cleanupTimer: NodeJS.Timeout | null;
  createdAt: number;
}

export interface GameView {
  phase: 'playing' | 'settled';
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

  setServer(server: Server) {
    this.server = server;
  }

  // ---------- 身份 ----------

  getUserByToken(token?: string): User | undefined {
    if (!token) return undefined;
    return this.users.get(token);
  }

  createUser(rawName?: string): User {
    const id = 'u' + Math.random().toString(36).slice(2, 10);
    const token = 'tk_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const user: User = { id, name: this.sanitizeName(rawName) || `玩家${id.slice(1, 5).toUpperCase()}`, token };
    this.users.set(token, user);
    this.userIds.set(id, user);
    return user;
  }

  rename(userId: string, name: string) {
    const user = this.userIds.get(userId);
    if (user) user.name = this.sanitizeName(name) || user.name;
  }

  private sanitizeName(name?: string): string {
    return (name || '').trim().slice(0, 12);
  }

  // ---------- 房间 ----------

  createRoom(
    host: User,
    opts: { mode?: 'solo' | 'room'; maxPlayers?: number; rules?: Partial<HouseRules>; difficulty?: string } = {},
  ): Room {
    const mode = opts.mode === 'solo' ? 'solo' : 'room';
    const maxPlayers = mode === 'solo' ? 2 : Math.min(4, Math.max(2, opts.maxPlayers ?? 2));
    const rules: HouseRules = { ...DEFAULT_RULES, ...(opts.rules || {}) };
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
      players: [
        { userId: host.id, name: host.name, isAi: false, connected: false, ready: mode === 'solo', socketId: null },
      ],
      game: null,
      started: false,
      turnTimer: null,
      aiTimer: null,
      cleanupTimer: null,
      createdAt: Date.now(),
    };
    if (mode === 'solo') {
      const aiName = opts.difficulty === 'easy' ? 'UNO 新手机器人' : 'UNO 机器人';
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
      // 重连
      player.connected = true;
      player.socketId = socketId;
      this.clearTimer(room, 'cleanupTimer');
      // 若正处于托管中且轮到该玩家，交还控制权
      if (room.game && room.game.phase === 'playing' && room.game.current.id === user.id) {
        this.clearTimer(room, 'aiTimer');
        this.scheduleTurn(room);
      }
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
      // 无人在线，稍后回收
      this.clearTimer(room, 'cleanupTimer');
      room.cleanupTimer = setTimeout(() => this.rooms.delete(room.code), ROOM_TTL_MS);
    } else if (room.started && room.game?.phase === 'playing' && room.game.current.id === userId) {
      // 掉线者正处于回合 → 托管
      this.clearTimer(room, 'turnTimer');
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
    this.clearTimer(room, 'turnTimer');
    this.clearTimer(room, 'aiTimer');
    this.startGame(room);
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
    for (const p of room.players) p.ready = false;
    this.logger.log(`房间 ${room.code} 开始对局，${room.players.length} 名玩家`);
    this.broadcastRoomState(room);
    this.broadcastGameState(room, []);
    this.afterTurn(room);
  }

  // ---------- 对局操作 ----------

  playCard(code: string, userId: string, cardId: string, chosenColor?: string, targetPlayerId?: string) {
    const room = this.requireGame(code);
    const events = room.game!.playCard(userId, cardId, chosenColor as never, targetPlayerId);
    this.broadcastGameState(room, events);
    this.afterTurn(room);
  }

  drawCard(code: string, userId: string) {
    const room = this.requireGame(code);
    const events = room.game!.drawCard(userId);
    this.broadcastGameState(room, events);
    this.afterTurn(room);
  }

  pass(code: string, userId: string) {
    const room = this.requireGame(code);
    const events = room.game!.pass(userId);
    this.broadcastGameState(room, events);
    this.afterTurn(room);
  }

  callUno(code: string, userId: string) {
    const room = this.requireGame(code);
    const events = room.game!.callUno(userId);
    this.broadcastGameState(room, events);
  }

  catchUno(code: string, userId: string, targetId: string) {
    const room = this.requireGame(code);
    const events = room.game!.catchUno(userId, targetId);
    this.broadcastGameState(room, events);
  }

  chat(code: string, userId: string, emoji: string) {
    const room = this.getRoom(code);
    if (!room || !this.server) return;
    const player = room.players.find((p) => p.userId === userId);
    if (!player) return;
    this.emitToRoom(room, 'game:chat', { userId, name: player.name, emoji: String(emoji).slice(0, 8) });
  }

  private requireGame(code: string): Room {
    const room = this.getRoom(code);
    if (!room?.game) throw new GameError('room_not_found', '房间或对局不存在');
    return room;
  }

  // ---------- 回合调度 ----------

  private afterTurn(room: Room) {
    const game = room.game;
    if (!game || game.phase !== 'playing') {
      this.clearTimer(room, 'turnTimer');
      this.clearTimer(room, 'aiTimer');
      this.broadcastRoomState(room);
      return;
    }
    this.clearTimer(room, 'turnTimer');
    this.clearTimer(room, 'aiTimer');
    const cur = game.current;
    const roomPlayer = room.players.find((p) => p.userId === cur.id);
    const needAi = cur.isAi || !roomPlayer || !roomPlayer.connected;
    if (needAi) this.scheduleAi(room);
    else this.scheduleTurn(room);
  }

  private scheduleTurn(room: Room) {
    room.turnTimer = setTimeout(() => {
      const game = room.game;
      if (!game || game.phase !== 'playing') return;
      const cur = game.current;
      try {
        const events = game.forceAction(cur.id);
        this.broadcastGameState(room, events);
        this.afterTurn(room);
      } catch (e) {
        this.logger.warn(`超时托管失败: ${(e as Error).message}`);
      }
    }, TURN_TIMEOUT_MS);
  }

  private scheduleAi(room: Room) {
    const delay = AI_DELAY_MIN + Math.random() * (AI_DELAY_MAX - AI_DELAY_MIN);
    room.aiTimer = setTimeout(() => {
      const game = room.game;
      if (!game || game.phase !== 'playing') return;
      const cur = game.current;
      const roomPlayer = room.players.find((p) => p.userId === cur.id);
      const level = room.mode === 'solo' && roomPlayer?.name.includes('新手') ? 'easy' : 'normal';
      try {
        const action = aiChoose(game, cur.id, level as 'easy' | 'normal');
        let events: ReturnType<UnoGame['drawCard']> = [];
        if (action.kind === 'play') {
          events = game.playCard(cur.id, action.cardId, action.chosenColor, action.targetPlayerId);
        } else if (action.kind === 'draw') {
          events = game.drawCard(cur.id);
          if (game.phase === 'playing' && game.current.id === cur.id && game.drewThisTurn) {
            const again = aiChoose(game, cur.id, level as 'easy' | 'normal');
            if (again.kind === 'play') {
              events = [...events, ...game.playCard(cur.id, again.cardId, again.chosenColor, again.targetPlayerId)];
            } else if (again.kind === 'pass') {
              events = [...events, ...game.pass(cur.id)];
            }
          }
        } else {
          events = game.pass(cur.id);
        }
        this.broadcastGameState(room, events);
        this.afterTurn(room);
      } catch (e) {
        this.logger.warn(`AI 执行失败: ${(e as Error).message}`);
        try {
          const events = game.forceAction(cur.id);
          this.broadcastGameState(room, events);
          this.afterTurn(room);
        } catch {
          /* ignore */
        }
      }
    }, delay);
  }

  private clearTimer(room: Room, key: 'turnTimer' | 'aiTimer' | 'cleanupTimer') {
    if (room[key]) {
      clearTimeout(room[key]!);
      room[key] = null;
    }
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

  broadcastGameState(room: Room, events: unknown[]) {
    if (!this.server) return;
    for (const player of room.players) {
      if (player.isAi || !player.socketId) continue;
      const socket = this.server.sockets.sockets.get(player.socketId);
      if (!socket) continue;
      socket.emit('game:state', { events, state: this.viewFor(room, player.userId) });
    }
  }

  sendGameStateTo(room: Room, socketId: string, userId: string) {
    if (!this.server) return;
    const socket = this.server.sockets.sockets.get(socketId);
    if (!socket) return;
    socket.emit('game:state', { events: [], state: this.viewFor(room, userId) });
  }

  roomState(room: Room) {
    return {
      code: room.code,
      mode: room.mode,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      rules: room.rules,
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

  viewFor(room: Room, userId: string): GameView {
    const game = room.game;
    if (!game) {
      return null as never;
    }
    const me = game.players.find((p) => p.id === userId);
    const isYourTurn = game.current.id === userId;
    return {
      phase: game.phase,
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
