import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomService } from './rooms';

@Module({
  providers: [RoomService, GameGateway],
})
export class AppModule {}
