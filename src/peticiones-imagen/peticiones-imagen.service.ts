import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { PeticionesImagen } from './schema/peticiones-imagen.schema';
import { CreatePeticionesImagenDto } from './dto/create-peticiones-imagen.dto';
import { PeticionesImagenEntity } from './entities/peticiones-imagen.entity';
import { UserEntity } from 'src/auth/entities/user.entity';
import { ValidRoles } from 'src/auth/interfaces';
import { ClienteService, ImagenesCliente } from 'src/cliente/cliente.service';
import { getScopedRutaIds, normalizeId } from 'src/common/helpers';
import { isHttpsImageUrl } from 'src/common/validators/is-https-image-url.validator';

const CAMPOS_IMAGEN = ['document_image', 'business_image', 'house_image'] as const;
type CampoImagen = (typeof CAMPOS_IMAGEN)[number];

type FotoCambio = { anterior: string; nueva: string };

@Injectable()
export class PeticionesImagenService {
  private readonly logger = new Logger(PeticionesImagenService.name);

  constructor(
    @InjectModel(PeticionesImagen.name)
    private readonly peticionesImagenModel: Model<PeticionesImagen>,
    private readonly clienteSvc: ClienteService,
  ) {}

  /**
   * Crea o sustituye la única solicitud pendiente del cliente.
   * No modifica las fotos publicadas.
   */
  async create(
    dto: CreatePeticionesImagenDto,
    user: UserEntity,
  ): Promise<PeticionesImagenEntity> {
    try {
      const actuales = await this.clienteSvc.getImagenes(dto.id_cliente);
      this.assertEmpresa(user, actuales.empresa);
      this.assertRuta(user, actuales.ruta);

      const empresaId = normalizeId(user.empresa);
      const usuarioId = normalizeId(user.id);
      if (!empresaId) {
        throw new BadRequestException('El usuario no tiene una empresa asignada');
      }
      if (!usuarioId) {
        throw new BadRequestException('Usuario inválido');
      }
      if (!actuales.ruta) {
        throw new BadRequestException('El cliente no tiene ruta');
      }

      const cambios = this.armarCambios(dto, actuales);
      const idCliente = new Types.ObjectId(dto.id_cliente);
      const comunes = {
        id_usuario: new Types.ObjectId(usuarioId),
        id_ruta: new Types.ObjectId(actuales.ruta),
        id_empresa: new Types.ObjectId(empresaId),
        fecha_actualizacion: new Date(),
      };

      const existente = await this.peticionesImagenModel.findOne({
        id_cliente: idCliente,
        estado: 'pendiente',
      });

      if (existente) {
        await this.reemplazarPendiente(existente._id, cambios, comunes);
        return this.findOne(existente._id.toString());
      }

      const doc: Record<string, unknown> = {
        ...comunes,
        id_cliente: idCliente,
        estado: 'pendiente',
        fecha_solicitud: new Date(),
      };
      for (const campo of CAMPOS_IMAGEN) {
        if (cambios[campo]) doc[campo] = cambios[campo];
      }

      try {
        const created = await this.peticionesImagenModel.create(doc);
        return this.findOne(created._id.toString());
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const concurrente = await this.peticionesImagenModel.findOne({
          id_cliente: idCliente,
          estado: 'pendiente',
        });
        if (!concurrente) throw error;
        await this.reemplazarPendiente(concurrente._id, cambios, comunes);
        return this.findOne(concurrente._id.toString());
      }
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  async findAll(filters?: {
    estado?: string;
    id_cliente?: string;
    id_ruta?: string;
    id_empresa?: string;
    fecha_desde?: Date;
    fecha_hasta?: Date;
    rutaIds?: string[];
  }): Promise<PeticionesImagenEntity[]> {
    try {
      if (filters?.rutaIds && !filters.rutaIds.length) return [];

      const requests = await this.peticionesImagenModel
        .find(this.buildQuery(filters))
        .populate('id_usuario', 'nombre username')
        .populate('id_cliente', 'nombre alias')
        .populate('id_ruta', 'nombre')
        .populate('id_empresa', 'name')
        .sort({ fecha_solicitud: -1 })
        .exec();

      return requests.map((req) => PeticionesImagenEntity.fromObject(req));
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  async findOne(id: string): Promise<PeticionesImagenEntity> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('ID de solicitud inválido');
      }

      const request = await this.peticionesImagenModel
        .findById(id)
        .populate('id_usuario', 'nombre username')
        .populate('id_cliente', 'nombre alias')
        .populate('id_ruta', 'nombre')
        .populate('id_empresa', 'name')
        .exec();

      if (!request) {
        throw new NotFoundException('Solicitud de fotos no encontrada');
      }

      return PeticionesImagenEntity.fromObject(request);
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  async contar(filters?: {
    estado?: string;
    id_cliente?: string;
    id_ruta?: string;
    id_empresa?: string;
    fecha_desde?: Date;
    fecha_hasta?: Date;
    rutaIds?: string[];
  }): Promise<number> {
    try {
      if (filters?.rutaIds && !filters.rutaIds.length) return 0;
      return await this.peticionesImagenModel.countDocuments(this.buildQuery(filters));
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  /**
   * Reclama la solicitud y, si se aprueba, escribe las fotos.
   * Si la escritura falla, la solicitud vuelve a pendiente.
   */
  async revisar(id: string, esAprobado: boolean, user: UserEntity): Promise<PeticionesImagenEntity> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('ID de solicitud inválido');
      }

      const existing = await this.peticionesImagenModel.findById(id);
      if (!existing) {
        throw new NotFoundException('Solicitud de fotos no encontrada');
      }
      if (existing.estado !== 'pendiente') {
        throw new BadRequestException('La solicitud ya fue revisada');
      }

      this.assertEmpresa(user, existing.id_empresa?.toString());
      const actuales = await this.clienteSvc.getImagenes(existing.id_cliente.toString());
      this.assertEmpresa(user, actuales.empresa);
      this.assertRuta(user, actuales.ruta);

      const claimed = await this.peticionesImagenModel.findOneAndUpdate(
        { _id: existing._id, estado: 'pendiente' },
        {
          $set: {
            estado: esAprobado ? 'aceptada' : 'rechazada',
            fecha_actualizacion: new Date(),
          },
        },
      );
      if (!claimed) {
        throw new BadRequestException('La solicitud ya fue revisada');
      }

      if (esAprobado) {
        const imagenes: Partial<Record<CampoImagen, string>> = {};
        for (const campo of CAMPOS_IMAGEN) {
          const foto = existing.get(campo) as FotoCambio | undefined;
          if (foto?.nueva) imagenes[campo] = foto.nueva;
        }
        try {
          await this.clienteSvc.replaceImagenes(existing.id_cliente.toString(), imagenes);
        } catch (error) {
          await this.peticionesImagenModel.updateOne(
            { _id: existing._id, estado: 'aceptada' },
            { $set: { estado: 'pendiente', fecha_actualizacion: new Date() } },
          );
          throw error;
        }
      }

      return this.findOne(id);
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  private async reemplazarPendiente(
    id: Types.ObjectId,
    cambios: Partial<Record<CampoImagen, FotoCambio>>,
    comunes: Record<string, unknown>,
  ): Promise<void> {
    const $set: Record<string, unknown> = { ...comunes };
    const $unset: Record<string, 1> = {};
    for (const campo of CAMPOS_IMAGEN) {
      if (cambios[campo]) $set[campo] = cambios[campo];
      else $unset[campo] = 1;
    }
    await this.peticionesImagenModel.updateOne(
      { _id: id },
      {
        $set,
        ...(Object.keys($unset).length ? { $unset } : {}),
      },
    );
  }

  private armarCambios(
    dto: CreatePeticionesImagenDto,
    actuales: ImagenesCliente,
  ): Partial<Record<CampoImagen, FotoCambio>> {
    const cambios: Partial<Record<CampoImagen, FotoCambio>> = {};

    for (const campo of CAMPOS_IMAGEN) {
      const nueva = dto[campo];
      if (!nueva) continue;
      if (!isHttpsImageUrl(nueva, false)) {
        throw new BadRequestException('La imagen debe ser una URL de Firebase Storage');
      }
      cambios[campo] = {
        anterior: actuales[campo] || '',
        nueva,
      };
    }

    if (Object.keys(cambios).length === 0) {
      throw new BadRequestException('Selecciona al menos una foto');
    }

    return cambios;
  }

  private assertEmpresa(user: UserEntity, empresaId?: string): void {
    if (user.rol === ValidRoles.superAdmin) return;
    const propia = normalizeId(user.empresa);
    if (!propia || !empresaId || propia !== String(empresaId)) {
      throw new ForbiddenException('No tienes permiso para operar sobre esta empresa');
    }
  }

  private buildQuery(filters?: {
    estado?: string;
    id_cliente?: string;
    id_ruta?: string;
    id_empresa?: string;
    fecha_desde?: Date;
    fecha_hasta?: Date;
    rutaIds?: string[];
  }): Record<string, unknown> {
    const query: Record<string, unknown> = {};
    if (!filters) return query;

    if (filters.estado) query.estado = filters.estado;
    if (filters.id_cliente) query.id_cliente = new Types.ObjectId(filters.id_cliente);
    if (filters.id_ruta) {
      query.id_ruta = new Types.ObjectId(filters.id_ruta);
    } else if (filters.rutaIds) {
      query.id_ruta = { $in: filters.rutaIds.map((id) => new Types.ObjectId(id)) };
    }
    if (filters.id_empresa) query.id_empresa = new Types.ObjectId(filters.id_empresa);
    if (filters.fecha_desde || filters.fecha_hasta) {
      const rango: Record<string, Date> = {};
      if (filters.fecha_desde) rango.$gte = filters.fecha_desde;
      if (filters.fecha_hasta) rango.$lte = filters.fecha_hasta;
      query.fecha_solicitud = rango;
    }
    return query;
  }

  private assertRuta(user: UserEntity, rutaId: string): void {
    const scoped = getScopedRutaIds(user);
    if (scoped === null) return;
    if (!rutaId || !scoped.includes(String(rutaId))) {
      throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
    }
  }

  private handleExceptions(error: any): never {
    if (
      error instanceof NotFoundException
      || error instanceof BadRequestException
      || error instanceof ForbiddenException
    ) {
      throw error;
    }

    this.logger.error(error?.message, error?.stack);
    throw new InternalServerErrorException('Error interno del servidor, por favor revise los logs');
  }
}
