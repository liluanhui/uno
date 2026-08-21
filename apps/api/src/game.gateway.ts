import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { UseFilters } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { GameError } from '@uno/engine';
import { RoomService, User } from './rooms';
import { WsExceptionsFilter } from './ws-exception.filter';
import {
  CatchUnoDto,
  CreateRoomDto,
  JoinRoomDto,
  PlayCardDto,
  ReadyDto,
  SetNameDto,
} from './dto';
import { CONFIG } from './config';

interface SocketInfo {
  token: string;
  userId: string;
  roomCode: string | null;
  /** 最近一次写操作时间，用于简单防刷 */
  lastActionAt: number;
}

/** 写操作最小间隔，防止客户端连点导致状态错乱 */
const RATE_LIMIT_MS = 200;

@WebSocketGateway({ cors: { origin: CONFIG.corsOrigin } })
@UseFilters(new WsExceptionsFilter())
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
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
    this.sockets.set(client.id, { token, userId: user.id, roomCode: null, lastActionAt: 0 });
    this.rooms.markOnline(user.id);
    client.emit('identity', { token, userId: user.id, name: user.name, isNew });
  }

  handleDisconnect(client: Socket) {
    const info = this.sockets.get(client.id);
    this.sockets.delete(client.id);
    if (!info) return;
    if (info.roomCode) {
      this.rooms.leaveRoom(info.roomCode, info.userId, client.id);
    }
    this.rooms.markOffline(info.userId);
    // 离线且不在任何房间才回收用户记录，避免无限增长
    this.rooms.gcUser(info.userId);
  }

  private user(client: Socket): { user: User; info: SocketInfo } {
    const info = this.sockets.get(client.id);
    if (!info) throw new GameError('no_identity', '身份未初始化');
    const user = this.rooms.getUserByToken(info.token);
    if (!user) throw new GameError('no_identity', '身份失效，请刷新页面');
    return { user, info };
  }

  /** 写操作节流：连点会被拒绝，统一经 WsExceptionsFilter 下发 app:error */
  private rateLimit(info: SocketInfo) {
    const now = Date.now();
    if (now - info.lastActionAt < RATE_LIMIT_MS) {
      throw new GameError('rate_limited', '操作太快了，请稍候');
    }
    info.lastActionAt = now;
  }

  private async join(client: Socket, code: string) {
    const info = this.sockets.get(client.id);
    if (info) info.roomCode = code;
    // 等待真正进入房间后再广播，避免漏发
    await client.join(`room:${code}`);
  }

  @SubscribeMessage('identity:setName')
  onSetName(client: Socket, payload: SetNameDto) {
    const { user } = this.user(client);
    this.rooms.rename(user.id, payload.name || '');
    client.emit('identity', { token: user.token, userId: user.id, name: user.name, isNew: false });
  }

  @SubscribeMessage('room:create')
  async onCreateRoom(client: Socket, payload: CreateRoomDto) {
    const { user, info } = this.user(client);
    this.rateLimit(info);
    const room = this.rooms.createRoom(user, {
      mode: payload.mode,
      maxPlayers: payload.maxPlayers,
      rules: payload.rules,
      difficulty: payload.difficulty,
    });
    await this.join(client, room.code);
    // 先告知房间号，再进房（进房可能立即触发 solo 开局广播）
    client.emit('room:created', { code: room.code });
    // 创建者进入房间（绑定 socket、触发 solo 自动开局 / 满员自动开始）
    this.rooms.joinRoom(room.code, user, client.id);
    this.rooms.broadcastRoomState(room);
    if (room.game) this.rooms.sendGameStateTo(room, client.id, user.id);
  }

  @SubscribeMessage('room:join')
  async onJoinRoom(client: Socket, payload: JoinRoomDto) {
    const { user, info } = this.user(client);
    this.rateLimit(info);
    const { room, game } = this.rooms.joinRoom(payload.code, user, client.id);
    await this.join(client, room.code);
    this.rooms.broadcastRoomState(room);
    if (game) this.rooms.sendGameStateTo(room, client.id, user.id);
    client.emit('room:joined', { code: room.code });
  }

  @SubscribeMessage('room:ready')
  onReady(client: Socket, payload: ReadyDto) {
    const { user, info } = this.user(client);
    this.rateLimit(info);
    if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
    this.rooms.setReady(info.roomCode, user.id, !!payload.ready);
    const room = this.rooms.getRoom(info.roomCode);
    if (room?.game) this.rooms.sendGameStateTo(room, client.id, user.id);
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
    const { user, info } = this.user(client);
    this.rateLimit(info);
    if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
    this.rooms.restart(info.roomCode, user.id);
  }

  @SubscribeMessage('game:playCard')
  onPlayCard(client: Socket, payload: PlayCardDto) {
    const { user, info } = this.user(client);
    this.rateLimit(info);
    if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
    this.rooms.playCard(info.roomCode, user.id, payload.cardId, payload.chosenColor, payload.targetPlayerId);
  }

  @SubscribeMessage('game:draw')
  onDraw(client: Socket) {
    const { user, info } = this.user(client);
    this.rateLimit(info);
    if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
    this.rooms.drawCard(info.roomCode, user.id);
  }

  @SubscribeMessage('game:pass')
  onPass(client: Socket) {
    const { user, info } = this.user(client);
    this.rateLimit(info);
    if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
    this.rooms.pass(info.roomCode, user.id);
  }

  @SubscribeMessage('game:callUno')
  onCallUno(client: Socket) {
    const { user, info } = this.user(client);
    this.rateLimit(info);
    if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
    this.rooms.callUno(info.roomCode, user.id);
  }

  @SubscribeMessage('game:catchUno')
  onCatchUno(client: Socket, payload: CatchUnoDto) {
    const { user, info } = this.user(client);
    this.rateLimit(info);
    if (!info.roomCode) throw new GameError('not_in_room', '你不在房间里');
    this.rooms.catchUno(info.roomCode, user.id, payload.targetId);
  }
}
