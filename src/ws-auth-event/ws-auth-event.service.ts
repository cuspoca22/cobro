import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { ListWsAuthEventsDto } from './dto/list-ws-auth-events.dto';
import {
  WsAuthEvent,
  WsAuthFailureReason,
} from './schemas/ws-auth-event.schema';

export type RecordWsAuthFailureInput = {
  reason: WsAuthFailureReason;
  message: string;
  userId?: string;
  username?: string;
  userNombre?: string;
  userRol?: string;
  empresaId?: string;
  userEstado?: boolean;
  tokenSid?: string;
  hasActiveSession?: boolean;
  activeSessionExpiresAt?: Date | string | null;
  socketId?: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class WsAuthEventService {
  private readonly logger = new Logger(WsAuthEventService.name);

  constructor(
    @InjectModel(WsAuthEvent.name)
    private readonly wsAuthEventModel: Model<WsAuthEvent>,
  ) {}

  /** Persistencia fire-and-forget desde MessageGateway. */
  async recordFailure(input: RecordWsAuthFailureInput): Promise<void> {
    try {
      await this.wsAuthEventModel.create({
        reason: input.reason,
        message: input.message,
        userId: input.userId,
        username: input.username,
        userNombre: input.userNombre,
        userRol: input.userRol,
        empresaId: input.empresaId,
        userEstado: input.userEstado,
        tokenSid: input.tokenSid,
        hasActiveSession: input.hasActiveSession,
        activeSessionExpiresAt: input.activeSessionExpiresAt
          ? new Date(input.activeSessionExpiresAt)
          : undefined,
        socketId: input.socketId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo guardar WS auth event: ${(error as Error).message}`,
      );
    }
  }

  async findAll(query: ListWsAuthEventsDto) {
    const hours = query.hours ?? 48;
    const limit = query.limit ?? 100;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const filter: Record<string, unknown> = {
      createdAt: { $gte: since },
    };
    if (query.reason) {
      filter.reason = query.reason;
    }

    const [items, total] = await Promise.all([
      this.wsAuthEventModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec(),
      this.wsAuthEventModel.countDocuments(filter).exec(),
    ]);

    const byReason = await this.wsAuthEventModel.aggregate<{
      _id: WsAuthFailureReason;
      count: number;
    }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return {
      items,
      total,
      hours,
      limit,
      summary: byReason.map((r) => ({ reason: r._id, count: r.count })),
    };
  }
}
