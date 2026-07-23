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

import { ValidRoles } from 'src/auth/interfaces';
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

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectModel(Announcement.name)
    private readonly announcementModel: Model<Announcement>,
    @InjectModel(AnnouncementReceipt.name)
    private readonly receiptModel: Model<AnnouncementReceipt>,
    @Inject(forwardRef(() => MessageGateway))
    private readonly messageGateway: MessageGateway,
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
        };
      })
      .filter((row) => !row.dismissed)
      .sort(
        (a, b) =>
          (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0),
      );
  }

  async dismiss(announcementId: string, userId: string) {
    const announcement = await this.announcementModel.findById(announcementId);
    if (!announcement || !announcement.isActive) {
      throw new NotFoundException('Aviso no encontrado');
    }
    if (!announcement.dismissible) {
      throw new BadRequestException('Este aviso no se puede descartar');
    }

    await this.receiptModel.findOneAndUpdate(
      {
        announcementId: new Types.ObjectId(announcementId),
        userId: new Types.ObjectId(userId),
      },
      { $set: { dismissedAt: new Date() } },
      { upsert: true, returnDocument: 'after' },
    );

    return { ok: true };
  }

  async acknowledge(announcementId: string, userId: string) {
    const announcement = await this.announcementModel.findById(announcementId);
    if (!announcement || !announcement.isActive) {
      throw new NotFoundException('Aviso no encontrado');
    }

    await this.receiptModel.findOneAndUpdate(
      {
        announcementId: new Types.ObjectId(announcementId),
        userId: new Types.ObjectId(userId),
      },
      { $set: { acknowledgedAt: new Date() } },
      { upsert: true, returnDocument: 'after' },
    );

    return { ok: true };
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
