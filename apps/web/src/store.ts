import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';

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
  scores: Record<string, number>;
}

export interface ChatBubble {
  id: number;
  userId: string;
  name: string;
  emoji: string;
}

let socket: Socket | null = null;
let toastSeq = 0;
let chatSeq = 0;

export const useUno = defineStore('uno', {
  state: () => ({
    token: localStorage.getItem('uno.token') || '',
    userId: '',
    name: localStorage.getItem('uno.name') || '',
    connected: false,
    room: null as RoomStateT | null,
    game: null as GameViewT | null,
    lastEvents: [] as any[],
    toasts: [] as { id: number; text: string }[],
    chats: [] as ChatBubble[],
    pendingWildCard: null as CardT | null,
    pendingSwapCard: null as CardT | null,
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
      socket.on('connect', () => (this.connected = true));
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
      });
      socket.on('game:state', (payload: { events: any[]; state: GameViewT }) => {
        this.game = payload.state;
        this.lastEvents = payload.events || [];
        this.pendingWildCard = null;
        this.pendingSwapCard = null;
      });
      socket.on('game:chat', (data: { userId: string; name: string; emoji: string }) => {
        const bubble: ChatBubble = { id: ++chatSeq, ...data };
        this.chats.push(bubble);
        setTimeout(() => {
          this.chats = this.chats.filter((c) => c.id !== bubble.id);
        }, 3000);
      });
      socket.on('error', (e: { code: string; message: string }) => {
        this.toast(e.message || '出错了');
      });
      socket.on('room:left', () => {
        this.room = null;
        this.game = null;
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
      this.chats = [];
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
    chat(emoji: string) {
      socket?.emit('game:chat', { emoji });
    },
  },
});
