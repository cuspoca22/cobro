import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { WsAuthFailureReason } from '../schemas/ws-auth-event.schema';

export class ListWsAuthEventsDto {
  @IsOptional()
  @IsEnum(WsAuthFailureReason)
  reason?: WsAuthFailureReason;

  /** Ventana hacia atrás en horas (default 48). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  hours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
