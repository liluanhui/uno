import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 修改昵称 */
export class SetNameDto {
  @IsOptional()
  @IsString()
  @MaxLength(12)
  name?: string;
}

/** 创建房间 */
export class CreateRoomDto {
  @IsOptional()
  @IsIn(['solo', 'room'])
  mode?: 'solo' | 'room';

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(4)
  maxPlayers?: number;

  @IsOptional()
  @IsObject()
  rules?: Record<string, boolean>;

  @IsOptional()
  @IsIn(['easy', 'normal'])
  difficulty?: 'easy' | 'normal';
}

/** 加入房间 */
export class JoinRoomDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

/** 准备 */
export class ReadyDto {
  @IsOptional()
  @IsBoolean()
  ready?: boolean;
}

/** 出牌（万能牌选色 / 7-0 换手目标可选） */
export class PlayCardDto {
  @IsString()
  @IsNotEmpty()
  cardId!: string;

  @IsOptional()
  @IsIn(['red', 'yellow', 'green', 'blue'])
  chosenColor?: string;

  @IsOptional()
  @IsString()
  targetPlayerId?: string;
}

/** 抓 UNO */
export class CatchUnoDto {
  @IsString()
  @IsNotEmpty()
  targetId!: string;
}
