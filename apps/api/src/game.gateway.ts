import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { GameError } from '@uno/engine';
import { RoomService, User } from './rooms';

interface SocketInfo {
  token: string;
  userId: string;
  roomCode: string | null;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('Gateway');
  private sockets = new Map<string, SocketInfo>();

  constructor(private readonly rooms: RoomService) {}

  afterInit(server: Server) {
    this.rooms.setServer(server);
  }

  handleConnection(client: Socket) {
    const auth = (client.handshake.auth || {}) as { token?: string; name?: string };
    let token = auth.token || '';
    let user: User | undefined = this.rooms.getUserByToken(token);
    let isNew = false;
    if (!user) {
      user = this.rooms.createUser(auth.name);
      token = user.token;
      isNew = true;
    }
    this.sockets.set(client.id, { token, userId: user.id, roomCode: null });
    client.emit('identity', { token, userId: user.id, name: user.name, isNew });
  }

  handleDisconnect(client: Socket) {
    const info = this.sockets.get(client.id);
    this.sockets.delete(client.id);
    if (!info) return;
    if (info.roomCode) {
      this.rooms.leaveRoom(info.roomCode, info.userId, client.id);
    }
  }

  private user(client: Socket): { user: User; info: SocketInfo } {
    const info = this.sockets.get(client.id);
    if (!info) throw new GameError('no_identity', '身份未初始化');
    const user = this.rooms.getUserByToken(info.token);
    if (!user) throw new GameError('no_identity', '身份失效，请刷新页面');
    return { user, info };
  }

  private join(client: Socket, code: string) {
    const info = this.sockets.get(client.id);
    if (info) info.roomCode = code;
    void client.join(`room:${code}`);
  }

  @SubscribeMessage('identity:setName')
  onSetName(client: Socket, payload: { name?: string }) {
    const { user } = this.user(client);
    this.rooms.rename(user.id, payload?.name || '');
    client.emit('identity', { token: user.token, userId: user.id, name: user.name, isNew: false });
  }

  @SubscribeMessage('room:create')
  onCreateRoom(
    client: Socket,
    payload: { mode?: 'solo' | 'room'; maxPlayers?: number; rules?: Record<string, boolean>; difficulty?: string },
  ) {
    try {
      const { user } = this.user(client);
      const room = this.rooms.createRoom(user, {
        mode: payload?.mode,
        maxPlayers: payload?.maxPlayers,
        rules: payload?.rules,
        difficulty: payload?.difficulty,
      });
      this.join(client, room.code);
      // 先告知房间号，再进房（进房可能立即触发 solo 开局广播）
      client.emit('room:created', { code: room.code });
      // 创建者进入房间（绑定 socket、触发 solo 自动开局 / 满员自动开始）
      this.rooms.joinRoom(room.code, user, client.id);
      this.rooms.broadcastRoomState(room);
      if (room.game) this.rooms.sendGameStateTo(room, client.id, user.id);
    } catch (e) {
      this.replyError(client, e);
    }
  }

  @SubscribeMessage('room:join')
  onJoinRoom(client: Socket, payload: { code?: string }) {
    try {
      const { user } = this.user(client);
      const { room, game } = this.rooms.joinRoom(payload?.code || '', user, client.id);
      this.join(client, room.code);
      this.rooms.broadcastRoomState(room);
      if (game) this.rooms.sendGameStateTo(room, client.id, user.id);
      client.emit('room:joined', { code: room.code });
    } catch (e) {
      this.replyError(client, e);
    }
  }

  @SubscribeMessage('room:ready')
  onReady(client: Socket, payload: { ready?: boolean }) {
    try {
      const { user, info } = this.user(client);
      if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
      this.rooms.setReady(info.roomCode, user.id, !!payload?.ready);
      const room = this.rooms.getRoom(info.roomCode);
      if (room?.game) this.rooms.sendGameStateTo(room, client.id, user.id);
    } catch (e) {
      this.replyError(client, e);
    }
  }

  @SubscribeMessage('room:leave')
  onLeave(client: Socket) {
    const info = this.sockets.get(client.id);
    if (info?.roomCode) {
      this.rooms.leaveRoom(info.roomCode, info.userId, client.id);
      void client.leave(`room:${info.roomCode}`);
      info.roomCode = null;
      client.emit('room:left');
    }
  }

  @SubscribeMessage('room:restart')
  onRestart(client: Socket) {
    try {
      const { user, info } = this.user(client);
      if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
      this.rooms.restart(info.roomCode, user.id);
    } catch (e) {
      this.replyError(client, e);
    }
  }

  @SubscribeMessage('game:playCard')
  onPlayCard(client: Socket, payload: { cardId?: string; chosenColor?: string; targetPlayerId?: string }) {
    try {
      const { user, info } = this.user(client);
      if (!info.roomCode || !payload?.cardId) throw new GameError('bad_request', '参数错误');
      this.rooms.playCard(info.roomCode, user.id, payload.cardId, payload.chosenColor, payload.targetPlayerId);
    } catch (e) {
      this.replyError(client, e);
    }
  }

  @SubscribeMessage('game:draw')
  onDraw(client: Socket) {
    try {
      const { user, info } = this.user(client);
      if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
      this.rooms.drawCard(info.roomCode, user.id);
    } catch (e) {
      this.replyError(client, e);
    }
  }

  @SubscribeMessage('game:pass')
  onPass(client: Socket) {
    try {
      const { user, info } = this.user(client);
      if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
      this.rooms.pass(info.roomCode, user.id);
    } catch (e) {
      this.replyError(client, e);
    }
  }

  @SubscribeMessage('game:callUno')
  onCallUno(client: Socket) {
    try {
      const { user, info } = this.user(client);
      if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
      this.rooms.callUno(info.roomCode, user.id);
    } catch (e) {
      this.replyError(client, e);
    }
  }

  @SubscribeMessage('game:catchUno')
  onCatchUno(client: Socket, payload: { targetId?: string }) {
    try {
      const { user, info } = this.user(client);
      if (!info.roomCode || !payload?.targetId) throw new GameError('bad_request', '参数错误');
      this.rooms.catchUno(info.roomCode, user.id, payload.targetId);
    } catch (e) {
      this.replyError(client, e);
    }
  }

  private replyError(client: Socket, e: unknown) {
    const err = e as GameError;
    const code = err?.code || 'unknown';
    const message = err?.message || '服务器开小差了';
    this.logger.warn(`${code}: ${message}`);
    client.emit('error', { code, message });
  }
}
