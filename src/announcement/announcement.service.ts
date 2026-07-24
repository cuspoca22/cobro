import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AuthService } from 'src/auth/auth.service';
import { ValidRoles } from 'src/auth/interfaces';
import { EmpresaService } from 'src/empresa/empresa.service';
import { MessageGateway } from 'src/message/message.gateway';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import {
  Announcement,
  AnnouncementAudience,
  AnnouncementScope,
  AnnouncementSeverity,
  AnnouncementType,
} from './schemas/announcement.schema';
import { AnnouncementReceipt } from './schemas/announcement-receipt.schema';

type ReceiptStatus = 'unread' | 'read' | 'acknowledged' | 'dismissed';

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectModel(Announcement.name)
    private readonly announcementModel: Model<Announcement>,
    @InjectModel(AnnouncementReceipt.name)
    private readonly receiptModel: Model<AnnouncementReceipt>,
    @Inject(forwardRef(() => MessageGateway))
    private readonly messageGateway: MessageGateway,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly empresaService: EmpresaService,
  ) {}

  async create(dto: CreateAnnouncementDto, createdBy: string) {
    const scope = dto.scope ?? AnnouncementScope.GLOBAL;
    const empresaIds = this.normalizeEmpresaIds(dto.empresaIds);

    this.assertScopeEmpresas(scope, empresaIds);

    const doc = await this.announcementModel.create({
      title: dto.title.trim(),
      body: dto.body.trim(),
      type: dto.type ?? AnnouncementType.INFO,
      severity: dto.severity ?? AnnouncementSeverity.INFO,
      scope,
      empresaIds,
      audience:
        dto.audience?.length
          ? dto.audience
          : [AnnouncementAudience.ADMIN, AnnouncementAudience.SUPERVISOR],
      startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      dismissible: dto.dismissible !== false,
      requiresAck: !!dto.requiresAck,
      isActive: dto.isActive !== false,
      createdBy: new Types.ObjectId(createdBy),
    });

    const view = this.toView(doc.toObject());
    if (view.isActive) {
      this.messageGateway.emitAnnouncement(view);
    }
    return view;
  }

  async findAll() {
    const list = await this.announcementModel
      .find()
      .sort({ createdAt: -1 })
      .lean();
    return (list || []).map((doc) => this.toView(doc));
  }

  async findOne(id: string) {
    const doc = await this.announcementModel.findById(id).lean();
    if (!doc) {
      throw new NotFoundException('Aviso no encontrado');
    }
    return this.toView(doc);
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const doc = await this.announcementModel.findById(id);
    if (!doc) {
      throw new NotFoundException('Aviso no encontrado');
    }

    if (dto.title !== undefined) doc.title = dto.title.trim();
    if (dto.body !== undefined) doc.body = dto.body.trim();
    if (dto.type !== undefined) doc.type = dto.type;
    if (dto.severity !== undefined) doc.severity = dto.severity;
    if (dto.scope !== undefined) doc.scope = dto.scope;
    if (dto.empresaIds !== undefined) {
      doc.empresaIds = this.normalizeEmpresaIds(dto.empresaIds);
    }
    if (dto.audience !== undefined) doc.audience = dto.audience;
    if (dto.startsAt !== undefined) doc.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) {
      doc.endsAt = dto.endsAt ? new Date(dto.endsAt) : undefined;
    }
    if (dto.dismissible !== undefined) doc.dismissible = dto.dismissible;
    if (dto.requiresAck !== undefined) doc.requiresAck = dto.requiresAck;
    if (dto.isActive !== undefined) doc.isActive = dto.isActive;

    this.assertScopeEmpresas(doc.scope, doc.empresaIds.map((x) => x.toString()));

    await doc.save();
    // No se resetean receipts al editar (corrección de contenido).
    const view = this.toView(doc.toObject());
    if (view.isActive) {
      this.messageGateway.emitAnnouncement(view);
    }
    return view;
  }

  async deactivate(id: string) {
    return this.update(id, { isActive: false });
  }

  /**
   * Crea (o reabre) un aviso de pago para una empresa.
   * Si ya existe uno activo, limpia receipts para que vuelva a mostrarse.
   */
  async notifyPaymentDue(
    empresaId: string,
    createdBy: string,
    opts?: { dayOfPay?: number; empresaName?: string },
  ) {
    if (!Types.ObjectId.isValid(empresaId)) {
      throw new BadRequestException('empresaId inválido');
    }

    const existing = await this.announcementModel.findOne({
      isActive: true,
      type: AnnouncementType.PAYMENT_REMINDER,
      scope: AnnouncementScope.EMPRESA,
      empresaIds: new Types.ObjectId(empresaId),
    });

    if (existing) {
      await this.receiptModel.deleteMany({ announcementId: existing._id });
      const view = this.toView(existing.toObject());
      this.messageGateway.emitAnnouncement(view);
      return view;
    }

    const dayLabel =
      opts?.dayOfPay != null ? ` (día ${opts.dayOfPay})` : '';
    const name = opts?.empresaName?.trim();

    return this.create(
      {
        title: 'Pago de suscripción pendiente',
        body: name
          ? `La suscripción de ${name} está marcada como no pagada${dayLabel}. Realiza el pago para evitar la suspensión del servicio.`
          : `Tu suscripción está marcada como no pagada${dayLabel}. Realiza el pago para evitar la suspensión del servicio.`,
        type: AnnouncementType.PAYMENT_REMINDER,
        severity: AnnouncementSeverity.CRITICAL,
        scope: AnnouncementScope.EMPRESA,
        empresaIds: [empresaId],
        audience: [AnnouncementAudience.ADMIN, AnnouncementAudience.SUPERVISOR],
        dismissible: true,
        requiresAck: true,
        isActive: true,
      },
      createdBy,
    );
  }

  /** Desactiva recordatorios de pago activos de una empresa. */
  async clearPaymentDue(empresaId: string) {
    if (!Types.ObjectId.isValid(empresaId)) return { ok: true, updated: 0 };

    const result = await this.announcementModel.updateMany(
      {
        isActive: true,
        type: AnnouncementType.PAYMENT_REMINDER,
        empresaIds: new Types.ObjectId(empresaId),
      },
      { $set: { isActive: false } },
    );

    return { ok: true, updated: result.modifiedCount ?? 0 };
  }

  /** Borrado permanente (recomendado solo para avisos ya inactivos). */
  async remove(id: string) {
    const doc = await this.announcementModel.findById(id);
    if (!doc) {
      throw new NotFoundException('Aviso no encontrado');
    }

    if (doc.isActive) {
      throw new BadRequestException(
        'Desactiva el aviso antes de eliminarlo de forma permanente',
      );
    }

    await this.receiptModel.deleteMany({
      announcementId: new Types.ObjectId(id),
    });
    await this.announcementModel.deleteOne({ _id: doc._id });

    return { ok: true, id };
  }

  async findMine(user: {
    id: string;
    rol?: string;
    empresa?: unknown;
  }) {
    if (
      user.rol !== ValidRoles.admin &&
      user.rol !== ValidRoles.supervisor
    ) {
      throw new ForbiddenException('Solo ADMIN o SUPERVISOR pueden ver avisos');
    }

    const empresaId = this.resolveEmpresaId(user.empresa);
    if (!empresaId) {
      return [];
    }

    const now = new Date();
    const list = await this.announcementModel
      .find({
        isActive: true,
        startsAt: { $lte: now },
        $and: [
          {
            $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }],
          },
          {
            $or: [
              { scope: AnnouncementScope.GLOBAL },
              { empresaIds: new Types.ObjectId(empresaId) },
            ],
          },
          { audience: user.rol },
        ],
      })
      .sort({ startsAt: -1 })
      .lean();

    const ids = (list || []).map((d) => d._id);
    const receipts = ids.length
      ? await this.receiptModel
          .find({
            announcementId: { $in: ids },
            userId: new Types.ObjectId(user.id),
          })
          .lean()
      : [];

    const receiptByAnn = new Map(
      receipts.map((r) => [r.announcementId.toString(), r]),
    );

    const severityRank: Record<string, number> = {
      critical: 3,
      warning: 2,
      info: 1,
    };

    return (list || [])
      .map((doc) => {
        const receipt = receiptByAnn.get(doc._id.toString());
        return {
          ...this.toView(doc),
          dismissed: !!receipt?.dismissedAt,
          acknowledged: !!receipt?.acknowledgedAt,
          read: !!(
            receipt?.readAt ||
            receipt?.acknowledgedAt ||
            receipt?.dismissedAt
          ),
        };
      })
      .filter((row) => !row.dismissed)
      .sort(
        (a, b) =>
          (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0),
      );
  }

  /** Marca el aviso como visto (idempotente). */
  async markRead(announcementId: string, userId: string) {
    const announcement = await this.announcementModel.findById(announcementId);
    if (!announcement || !announcement.isActive) {
      throw new NotFoundException('Aviso no encontrado');
    }

    await this.upsertReceiptFlags(announcementId, userId, { markRead: true });
    return { ok: true };
  }

  async dismiss(announcementId: string, userId: string) {
    const announcement = await this.announcementModel.findById(announcementId);
    if (!announcement || !announcement.isActive) {
      throw new NotFoundException('Aviso no encontrado');
    }
    if (!announcement.dismissible) {
      throw new BadRequestException('Este aviso no se puede descartar');
    }

    await this.upsertReceiptFlags(announcementId, userId, {
      markRead: true,
      dismissed: true,
    });

    return { ok: true };
  }

  async acknowledge(announcementId: string, userId: string) {
    const announcement = await this.announcementModel.findById(announcementId);
    if (!announcement || !announcement.isActive) {
      throw new NotFoundException('Aviso no encontrado');
    }

    await this.upsertReceiptFlags(announcementId, userId, {
      markRead: true,
      acknowledged: true,
    });

    return { ok: true };
  }

  /**
   * Reporte SA: audiencia esperada + receipts mergeados.
   * User vía AuthService; nombres empresa vía EmpresaService (V4b).
   */
  async findReceipts(announcementId: string) {
    const doc = await this.announcementModel.findById(announcementId).lean();
    if (!doc) {
      throw new NotFoundException('Aviso no encontrado');
    }

    const audienceRoles = (doc.audience?.length
      ? doc.audience
      : [AnnouncementAudience.ADMIN, AnnouncementAudience.SUPERVISOR]
    ).map((r) => r.toString());

    const scopeEmpresaIds =
      doc.scope === AnnouncementScope.GLOBAL
        ? undefined
        : (doc.empresaIds || []).map((x) => x.toString());

    const audienceUsers =
      await this.authService.findForAnnouncementAudience({
        roles: audienceRoles,
        empresaIds: scopeEmpresaIds,
      });

    const empresaIds = [
      ...new Set(
        audienceUsers
          .map((u) => u.empresaId)
          .filter((id): id is string => !!id),
      ),
    ];
    const empresaNames = await this.empresaService.findNamesByIds(empresaIds);
    const empresaNameById = new Map(
      empresaNames.map((e) => [e.id, e.name]),
    );

    const receipts = await this.receiptModel
      .find({ announcementId: new Types.ObjectId(announcementId) })
      .lean();
    const receiptByUser = new Map(
      receipts.map((r) => [r.userId.toString(), r]),
    );

    const recipients = audienceUsers.map((user) => {
      const receipt = receiptByUser.get(user.id);
      const readAt = receipt?.readAt ?? null;
      const acknowledgedAt = receipt?.acknowledgedAt ?? null;
      const dismissedAt = receipt?.dismissedAt ?? null;
      const status = this.resolveReceiptStatus({
        readAt,
        acknowledgedAt,
        dismissedAt,
      });

      return {
        userId: user.id,
        name: user.nombre,
        username: user.username,
        rol: user.rol,
        empresaId: user.empresaId,
        empresaName: user.empresaId
          ? empresaNameById.get(user.empresaId) || null
          : null,
        readAt: readAt ? new Date(readAt).toISOString() : null,
        acknowledgedAt: acknowledgedAt
          ? new Date(acknowledgedAt).toISOString()
          : null,
        dismissedAt: dismissedAt
          ? new Date(dismissedAt).toISOString()
          : null,
        status,
      };
    });

    recipients.sort((a, b) => {
      const rank: Record<ReceiptStatus, number> = {
        unread: 0,
        read: 1,
        acknowledged: 2,
        dismissed: 3,
      };
      const diff = rank[a.status] - rank[b.status];
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });

    const summary = {
      audienceTotal: recipients.length,
      read: recipients.filter((r) => r.status !== 'unread').length,
      acknowledged: recipients.filter((r) => !!r.acknowledgedAt).length,
      dismissed: recipients.filter((r) => !!r.dismissedAt).length,
      unread: recipients.filter((r) => r.status === 'unread').length,
    };

    return {
      announcementId: doc._id.toString(),
      title: doc.title,
      summary,
      recipients,
    };
  }

  private async upsertReceiptFlags(
    announcementId: string,
    userId: string,
    flags: { markRead?: boolean; dismissed?: boolean; acknowledged?: boolean },
  ) {
    const filter = {
      announcementId: new Types.ObjectId(announcementId),
      userId: new Types.ObjectId(userId),
    };
    const now = new Date();

    const $set: Record<string, Date | Types.ObjectId> = {
      announcementId: filter.announcementId,
      userId: filter.userId,
    };
    if (flags.dismissed) $set.dismissedAt = now;
    if (flags.acknowledged) $set.acknowledgedAt = now;

    // readAt solo si aún no existe (idempotente; sin aggregation pipeline)
    if (flags.markRead) {
      const existing = await this.receiptModel
        .findOne(filter)
        .select('readAt')
        .lean();
      if (!existing?.readAt) {
        $set.readAt = now;
      }
    }

    await this.receiptModel.findOneAndUpdate(
      filter,
      { $set },
      { upsert: true },
    );
  }

  private resolveReceiptStatus(receipt: {
    readAt?: Date | null;
    acknowledgedAt?: Date | null;
    dismissedAt?: Date | null;
  }): ReceiptStatus {
    if (receipt.dismissedAt) return 'dismissed';
    if (receipt.acknowledgedAt) return 'acknowledged';
    if (receipt.readAt) return 'read';
    return 'unread';
  }

  private assertScopeEmpresas(
    scope: AnnouncementScope,
    empresaIds: string[] | Types.ObjectId[],
  ) {
    const ids = (empresaIds || []).map((x) => x.toString()).filter(Boolean);
    if (scope === AnnouncementScope.GLOBAL && ids.length > 0) {
      throw new BadRequestException(
        'Un aviso GLOBAL no debe incluir empresas',
      );
    }
    if (
      (scope === AnnouncementScope.EMPRESA || scope === AnnouncementScope.MULTI) &&
      ids.length === 0
    ) {
      throw new BadRequestException(
        'Debes indicar al menos una empresa para este alcance',
      );
    }
    if (scope === AnnouncementScope.EMPRESA && ids.length !== 1) {
      throw new BadRequestException(
        'Alcance EMPRESA requiere exactamente una empresa',
      );
    }
  }

  private normalizeEmpresaIds(ids?: string[]): Types.ObjectId[] {
    return (ids || [])
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
  }

  private resolveEmpresaId(empresa: unknown): string | null {
    if (!empresa) return null;
    if (typeof empresa === 'string') return empresa;
    if (typeof empresa === 'object') {
      const id =
        (empresa as any)._id?.toString?.() ||
        (empresa as any).id?.toString?.() ||
        null;
      return id;
    }
    return null;
  }

  private toView(doc: any) {
    return {
      id: doc._id?.toString?.() ?? doc.id,
      title: doc.title,
      body: doc.body,
      type: doc.type,
      severity: doc.severity,
      scope: doc.scope,
      empresaIds: (doc.empresaIds || []).map((x: any) => x.toString()),
      audience: doc.audience || [],
      startsAt: doc.startsAt,
      endsAt: doc.endsAt ?? null,
      dismissible: doc.dismissible !== false,
      requiresAck: !!doc.requiresAck,
      isActive: doc.isActive !== false,
      createdBy: doc.createdBy?.toString?.() ?? doc.createdBy,
      createdAt: doc.createdAt ?? null,
      updatedAt: doc.updatedAt ?? null,
    };
  }
}
