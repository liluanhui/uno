import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import * as sfx from './sfx';

export interface CardT {
  id: string;
  color: string;
  kind: string;
  value?: number;
}

export interface RoomStateT {
  code: string;
  mode: 'solo' | 'room';
  hostId: string;
  maxPlayers: number;
  rules: Record<string, boolean>;
  started: boolean;
  players: { userId: string; name: string; isAi: boolean; connected: boolean; ready: boolean }[];
}

export interface GameViewT {
  phase: 'playing' | 'settled';
  paused: boolean;
  activeColor: string;
  direction: 1 | -1;
  pendingDraw: number;
  topCard: CardT | null;
  drawCount: number;
  discardCount: number;
  turn: number;
  currentIdx: number;
  isYourTurn: boolean;
  drewThisTurn: boolean;
  you: { id: string; hand: CardT[]; calledUno: boolean; playableIds: string[] } | null;
  players: { id: string; name: string; isAi: boolean; connected: boolean; count: number; calledUno: boolean }[];
  winnerId: string | null;
}

export interface UnoFx {
  id: number;
  userId: string;
  name: string;
}

export interface UnoStats {
  win: number;
  lose: number;
  draw: number;
}

function loadStats(): UnoStats {
  try {
    const raw = localStorage.getItem('uno.stats');
    if (raw) {
      const s = JSON.parse(raw);
      return { win: s.win || 0, lose: s.lose || 0, draw: s.draw || 0 };
    }
  } catch {
    /* ignore */
  }
  return { win: 0, lose: 0, draw: 0 };
}

let socket: Socket | null = null;
let toastSeq = 0;
let fxSeq = 0;

export const useUno = defineStore('uno', {
  state: () => ({
    token: localStorage.getItem('uno.token') || '',
    userId: '',
    name: localStorage.getItem('uno.name') || '',
    connected: false,
    resuming: false,
    room: null as RoomStateT | null,
    game: null as GameViewT | null,
    lastEvents: [] as any[],
    toasts: [] as { id: number; text: string }[],
    pendingWildCard: null as CardT | null,
    pendingSwapCard: null as CardT | null,
    dealing: false,
    unoFx: null as UnoFx | null,
    stats: loadStats(),
  }),
  getters: {
    myId(state): string {
      return state.userId;
    },
  },
  actions: {
    connect() {
      if (socket) return;
      socket = io({ auth: { token: this.token || undefined, name: this.name || undefined } });
      socket.on('connect', () => {
        this.connected = true;
        // 刷新/断线重连后自动回到上次的房间（服务端按 token 识别身份并重新绑定 socket）
        const code = this.room?.code || localStorage.getItem('uno.room') || '';
        if (code) {
          this.resuming = !this.room;
          socket!.emit('room:join', { code });
        }
      });
      socket.on('disconnect', () => (this.connected = false));
      socket.on('identity', (data: { token: string; userId: string; name: string; isNew: boolean }) => {
        this.token = data.token;
        this.userId = data.userId;
        this.name = data.name;
        localStorage.setItem('uno.token', data.token);
        localStorage.setItem('uno.name', data.name);
      });
      socket.on('room:state', (room: RoomStateT) => {
        this.room = room;
        this.resuming = false;
        localStorage.setItem('uno.room', room.code);
      });
      socket.on('game:state', (payload: { events: any[]; state: GameViewT }) => {
        this.game = payload.state;
        this.lastEvents = payload.events || [];
        this.pendingWildCard = null;
        this.pendingSwapCard = null;
        sfx.playEvents(payload.events || [], this.userId);
        // 仅当本批次事件含 settled 时记录胜负，避免重连补发（events 为空）重复计数
        if (payload.state.phase === 'settled' && (payload.events || []).some((e: any) => e?.type === 'settled')) {
          this.recordResult(payload.state.winnerId);
        }
      });
      // 开局：洗牌发牌动效（约 2.8s 后亮出牌桌）
      socket.on('game:dealing', () => {
        this.dealing = true;
        sfx.deal();
        setTimeout(() => (this.dealing = false), 2800);
      });
      // 有人喊 UNO：全屏爆炸特效
      socket.on('game:uno', (data: { userId: string; name: string }) => {
        this.unoFx = { id: ++fxSeq, userId: data.userId, name: data.name || '有人' };
        sfx.uno();
      });
      socket.on('app:error', (e: { code: string; message: string }) => {
        sfx.error();
        this.toast(e.message || '出错了');
        // 续局失败（房间已回收等）：清除本地房间号，避免每次重连都失败
        if (this.resuming || !this.room) {
          if (['room_not_found', 'room_started', 'room_full'].includes(e.code)) {
            this.resuming = false;
            localStorage.removeItem('uno.room');
          }
        }
      });
      socket.on('room:left', () => {
        this.room = null;
        this.game = null;
        localStorage.removeItem('uno.room');
      });
    },
    toast(text: string) {
      const id = ++toastSeq;
      this.toasts.push({ id, text });
      setTimeout(() => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
      }, 2600);
    },
    setName(name: string) {
      this.name = name;
      localStorage.setItem('uno.name', name);
      socket?.emit('identity:setName', { name });
    },
    startSolo(difficulty: 'easy' | 'normal') {
      socket?.emit('room:create', { mode: 'solo', difficulty });
    },
    createRoom(opts: { maxPlayers: number; rules: Record<string, boolean> }) {
      socket?.emit('room:create', { mode: 'room', ...opts });
    },
    joinRoom(code: string) {
      socket?.emit('room:join', { code });
    },
    toggleReady(ready: boolean) {
      socket?.emit('room:ready', { ready });
    },
    leaveRoom() {
      socket?.emit('room:leave');
      this.room = null;
      this.game = null;
      this.dealing = false;
      this.unoFx = null;
      localStorage.removeItem('uno.room');
    },
    restart() {
      socket?.emit('room:restart');
    },
    playCard(cardId: string, chosenColor?: string, targetPlayerId?: string) {
      socket?.emit('game:playCard', { cardId, chosenColor, targetPlayerId });
    },
    drawCard() {
      socket?.emit('game:draw');
    },
    passTurn() {
      socket?.emit('game:pass');
    },
    callUno() {
      socket?.emit('game:callUno');
    },
    catchUno(targetId: string) {
      socket?.emit('game:catchUno', { targetId });
    },
    pause() {
      socket?.emit('game:pause');
    },
    resume() {
      socket?.emit('game:resume');
    },
    recordResult(winnerId: string | null) {
      if (winnerId === null) this.stats.draw++;
      else if (winnerId === this.userId) this.stats.win++;
      else this.stats.lose++;
      localStorage.setItem('uno.stats', JSON.stringify(this.stats));
    },
  },
});
