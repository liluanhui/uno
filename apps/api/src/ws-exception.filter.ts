import { ArgumentsHost, Catch } from '@nestjs/common';
import { Socket } from 'socket.io';
import { GameError } from '@uno/engine';

interface ValidationResponse {
  message?: string | string[];
}

/**
 * WebSocket 全局异常过滤器：把 GameError / ValidationPipe 校验错误 / 未知异常
 * 统一转成 'app:error' 事件下发给客户端（避免使用 Socket.IO 保留的 'error' 事件）。
 */
@Catch()
export class WsExceptionsFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();
    const raw = exception as GameError & { response?: ValidationResponse };

    let code = raw?.code || 'unknown';
    let message = raw?.message || '服务器开小差了';

    // ValidationPipe 抛出的 BadRequestException 带 response.message（数组）
    const resMsg = raw?.response?.message;
    if (resMsg) {
      message = Array.isArray(resMsg) ? resMsg.join('；') : String(resMsg);
      if (!raw?.code) code = 'bad_request';
    }

    client.emit('app:error', { code, message });
  }
}
