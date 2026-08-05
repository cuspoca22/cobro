import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AuthService } from 'src/auth/auth.service';
import { ValidRoles } from 'src/auth/interfaces';
import { User } from 'src/auth/schemas/user.schema';
import { EmpresaService } from 'src/empresa/empresa.service';
import { Empresa } from 'src/empresa/schemas/empresa.schema';
import { ConvertLeadDto, CreateLeadDto, UpdateLeadDto } from './dto';
import { Lead, LeadStatus } from './schemas/lead.schema';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectModel(Lead.name)
    private readonly leadModel: Model<Lead>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Empresa.name)
    private readonly empresaModel: Model<Empresa>,
    private readonly empresaService: EmpresaService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateLeadDto) {
    if (dto.website?.trim()) {
      this.logger.warn(`Lead honeypot triggered for email=${dto.email}`);
      return {
        ok: true,
        message: 'Solicitud recibida',
      };
    }

    const email = dto.email.trim().toLowerCase();

    const existing = await this.leadModel
      .findOne({
        email,
        status: { $in: [LeadStatus.NEW, LeadStatus.CONTACTED] },
      })
      .lean();

    if (existing) {
      throw new ConflictException(
        'Ya existe una solicitud pendiente con este correo',
      );
    }

    try {
      const lead = await this.leadModel.create({
        nombre: dto.nombre.trim(),
        email,
        phone: dto.phone.trim(),
        empresaNombre: dto.empresaNombre.trim(),
        origen: dto.origen?.trim() || 'landing',
        status: LeadStatus.NEW,
      });

      return {
        ok: true,
        message: 'Solicitud recibida',
        id: lead._id,
      };
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException(
          'Ya existe una solicitud pendiente con este correo',
        );
      }
      this.logger.error(`Error creando lead: ${error?.message}`);
      throw error;
    }
  }

  async findAll(status?: LeadStatus) {
    const filter = status ? { status } : {};
    return this.leadModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findOne(id: string) {
    const lead = await this.leadModel.findById(id).lean();
    if (!lead) {
      throw new NotFoundException(`Solicitud ${id} no encontrada`);
    }
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto) {
    const lead = await this.leadModel.findById(id);
    if (!lead) {
      throw new NotFoundException(`Solicitud ${id} no encontrada`);
    }

    if (lead.status === LeadStatus.CONVERTED) {
      throw new BadRequestException(
        'No se puede modificar una solicitud ya convertida',
      );
    }

    if (dto.status === LeadStatus.CONVERTED) {
      throw new BadRequestException(
        'Usa el endpoint /convert para aprobar la solicitud',
      );
    }

    if (dto.status !== undefined) {
      lead.status = dto.status;
    }
    if (dto.notas !== undefined) {
      lead.notas = dto.notas;
    }

    await lead.save();
    return lead.toObject();
  }

  async convert(
    id: string,
    dto: ConvertLeadDto,
    actor?: { rol?: string; id?: string },
  ) {
    const lead = await this.leadModel.findById(id);
    if (!lead) {
      throw new NotFoundException(`Solicitud ${id} no encontrada`);
    }

    if (
      lead.status !== LeadStatus.NEW &&
      lead.status !== LeadStatus.CONTACTED
    ) {
      throw new BadRequestException(
        `La solicitud no se puede convertir (status=${lead.status})`,
      );
    }

    const country = dto.country?.trim() || 'Guatemala';
    let empresaId: string | null = null;
    let userId: string | null = null;

    try {
      const empresa = await this.empresaService.create({
        name: lead.empresaNombre,
        email: lead.email,
        phone: lead.phone,
        country,
        dayOfPay: dto.dayOfPay,
        owner: undefined,
        employes: [],
        rutas: [],
      } as any);

      empresaId = empresa._id.toString();

      const user = await this.authService.create(
        {
          nombre: lead.nombre,
          username: dto.username.trim(),
          password: dto.password,
          rol: ValidRoles.admin,
          empresa: empresaId,
          estado: true,
        },
        actor,
      );

      userId = user._id.toString();

      // Solo dueño (como addOwner): no va en employes
      const empresaDoc = await this.empresaModel.findById(empresaId);
      if (!empresaDoc) {
        throw new NotFoundException(`Empresa ${empresaId} no encontrada`);
      }

      empresaDoc.owner = user._id as any;
      await empresaDoc.save();

      lead.status = LeadStatus.CONVERTED;
      lead.empresaId = empresaDoc._id as any;
      lead.userId = user._id as any;
      await lead.save();

      return {
        ok: true,
        empresaId,
        userId,
        lead: {
          id: lead._id.toString(),
          status: lead.status,
          nombre: lead.nombre,
          email: lead.email,
          empresaNombre: lead.empresaNombre,
        },
      };
    } catch (error) {
      // Compensación ligera (sin cascada pesada que cuelga el request)
      try {
        if (userId) {
          await this.userModel.findByIdAndDelete(userId);
        }
        if (empresaId) {
          await this.empresaModel.findByIdAndDelete(empresaId);
        }
      } catch (cleanupError: any) {
        this.logger.error(
          `Fallo compensación convert lead=${id}: ${cleanupError?.message}`,
        );
      }
      throw error;
    }
  }

  async remove(id: string) {
    const lead = await this.leadModel.findByIdAndDelete(id);
    if (!lead) {
      throw new NotFoundException(`Solicitud ${id} no encontrada`);
    }
    return { ok: true, message: 'Solicitud eliminada' };
  }
}
