import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { PeticionesUbicacion } from './schema/peticiones-ubicacion.schema';
import { CreatePeticionesUbicacionDto } from './dto/create-peticiones-ubicacion.dto';
import { UpdatePeticionesUbicacionDto } from './dto/update-peticiones-ubicacion.dto';
import { PeticionesUbicacionEntity } from './entities/peticiones-ubicacion.entity';
import { UserEntity } from 'src/auth/entities/user.entity';
import { ClienteService } from 'src/cliente/cliente.service';

@Injectable()
export class PeticionesUbicacionService {
  private readonly logger = new Logger(PeticionesUbicacionService.name);

  constructor(
    @InjectModel(PeticionesUbicacion.name)
    private readonly peticionesUbicacionModel: Model<PeticionesUbicacion>,

    private readonly clienteSvc: ClienteService,
  ) { }

  /**
   * Creates a new location change request.
   * Cualquier cobrador puede solicitar; admin/supervisor aprueba después.
   */
  async create(
    createPeticionesUbicacionDto: CreatePeticionesUbicacionDto,
    user: UserEntity
  ): Promise<boolean> {
    try {
      const { old_ubicacion, new_ubicacion, id_cliente, estado } = createPeticionesUbicacionDto;

      // Validate that coordinates are valid [longitude, latitude]
      this.validateCoordinates(new_ubicacion);

      // Check if a pending request already exists for this client
      const existingPending = await this.peticionesUbicacionModel.findOne({
        id_cliente: new Types.ObjectId(id_cliente),
        estado: 'pendiente',
      });

      if (existingPending) {
        throw new BadRequestException('El cliente ya tiene una solicitud de cambio de ubicación pendiente');
      }

      const newRequest = await this.peticionesUbicacionModel.create({
        old_ubicacion,
        new_ubicacion,
        id_cliente: new Types.ObjectId(id_cliente),
        id_usuario: new Types.ObjectId(user.id),
        id_ruta: new Types.ObjectId(user.ruta),
        estado: estado || 'pendiente',
        id_empresa: new Types.ObjectId(user.empresa),
      });

      return true;
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  /**
   * Retrieves all location change requests with optional filtering.
   * @param filters Optional filters (estado, id_cliente, id_ruta, fecha range).
   * @returns Array of request entities.
   */
  async findAll(filters?: {
    estado?: string;
    id_cliente?: string;
    id_ruta?: string;
    id_empresa?: string;
    fecha_desde?: Date;
    fecha_hasta?: Date;
    /** Scope de rutas (supervisor/cobrador). Vacío = sin resultados. */
    rutaIds?: string[];
  }): Promise<PeticionesUbicacionEntity[]> {
    try {
      const query: any = {};

      if (filters?.estado) {
        query.estado = filters.estado;
      }
      if (filters?.id_cliente) {
        query.id_cliente = new Types.ObjectId(filters.id_cliente);
      }
      if (filters?.id_ruta) {
        query.id_ruta = new Types.ObjectId(filters.id_ruta);
      } else if (filters?.rutaIds) {
        if (!filters.rutaIds.length) return [];
        query.id_ruta = {
          $in: filters.rutaIds.map((id) => new Types.ObjectId(id)),
        };
      }
      if (filters?.id_empresa) {
        query.id_empresa = new Types.ObjectId(filters.id_empresa);
      }
      if (filters?.fecha_desde || filters?.fecha_hasta) {
        query.fecha_solicitud = {};
        if (filters.fecha_desde) {
          query.fecha_solicitud.$gte = filters.fecha_desde;
        }
        if (filters.fecha_hasta) {
          query.fecha_solicitud.$lte = filters.fecha_hasta;
        }
      }

      const requests = await this.peticionesUbicacionModel
        .find(query)
        .populate('id_usuario', 'nombre username')
        .populate('id_cliente', 'nombre dpi alias')
        .populate('id_ruta', 'nombre')
        .populate('id_empresa', 'name')
        .sort({ fecha_solicitud: -1 })
        .exec();

      return requests.map(req => PeticionesUbicacionEntity.fromObject(req));
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  /**
   * Finds a single request by its ID.
   * @param id MongoDB ObjectId of the request.
   * @returns The request entity.
   */
  async findOne(id: string): Promise<PeticionesUbicacionEntity> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('ID de solicitud inválido');
      }

      const request = await this.peticionesUbicacionModel
        .findById(id)
        .populate('id_usuario', 'nombre email')
        .populate('id_cliente', 'nombre dpi alias')
        .populate('id_ruta', 'nombre')
        .populate('id_empresa', 'name')
        .exec();

      if (!request) {
        throw new NotFoundException(`Solicitud de ubicación con ID ${id} no encontrada`);
      }

      return PeticionesUbicacionEntity.fromObject(request);
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  /**
   * Updates a request's status or details.
   * Only allowed transitions: 'pendiente' → 'aceptada' or 'rechazada'.
   * @param id MongoDB ObjectId of the request.
   * @param updatePeticionesUbicacionDto Data to update.
   * @param userId ID of the user performing the update (for logging).
   * @returns The updated request entity.
   */
  async update(
    id: string,
    updatePeticionesUbicacionDto: UpdatePeticionesUbicacionDto,
  ): Promise<PeticionesUbicacionEntity> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('ID de solicitud inválido');
      }

      const existing = await this.peticionesUbicacionModel.findById(id);
      if (!existing) {
        throw new NotFoundException(`Solicitud de ubicación con ID ${id} no encontrada`);
      }

      // If updating coordinates, validate them
      if (updatePeticionesUbicacionDto.old_ubicacion) {
        this.validateCoordinates(updatePeticionesUbicacionDto.old_ubicacion);
      }
      if (updatePeticionesUbicacionDto.new_ubicacion) {
        this.validateCoordinates(updatePeticionesUbicacionDto.new_ubicacion);
      }

      const updatedData = {
        ...updatePeticionesUbicacionDto,
        fecha_actualizacion: new Date(),
      };

      // If updating estado, validate state transition
      if (updatePeticionesUbicacionDto.esAprobado) {
        await this.clienteSvc.update(existing.id_cliente.toString(), {
          ubication: existing.new_ubicacion,
        });

        updatedData.estado = 'aceptada';
      }

      const updated = await this.peticionesUbicacionModel
        .findByIdAndUpdate(id, updatedData, { returnDocument: 'after' })
        .populate('id_usuario', 'nombre')
        .populate('id_cliente', 'nombre alias')
        .populate('id_ruta', 'nombre')
        .populate('id_empresa', 'name')
        .exec();

      return PeticionesUbicacionEntity.fromObject(updated);
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  /**
   * Deletes a request (soft delete not required, but can be implemented).
   * @param id MongoDB ObjectId of the request.
   * @returns Confirmation message.
   */
  async remove(id: string): Promise<{ message: string }> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('ID de solicitud inválido');
      }

      const result = await this.peticionesUbicacionModel.findByIdAndDelete(id);
      if (!result) {
        throw new NotFoundException(`Solicitud de ubicación con ID ${id} no encontrada`);
      }

      return { message: `Solicitud de ubicación ${id} eliminada correctamente` };
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  /**
   * Validates that coordinates array contains exactly two numbers [longitude, latitude].
   * @param coords Array of numbers.
   */
  private validateCoordinates(coords: number[]): void {
    if (!Array.isArray(coords) || coords.length !== 2) {
      throw new BadRequestException('Las coordenadas deben ser un array de dos números [longitud, latitud]');
    }
    if (typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
      throw new BadRequestException('Las coordenadas deben ser números válidos');
    }
    // Basic range validation
    if (coords[0] < -180 || coords[0] > 180) {
      throw new BadRequestException('Longitud debe estar entre -180 y 180');
    }
    if (coords[1] < -90 || coords[1] > 90) {
      throw new BadRequestException('Latitud debe estar entre -90 y 90');
    }
  }

  /**
   * Centralized exception handler for the service.
   * @param error Caught error.
   */
  private handleExceptions(error: any): never {
    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    this.logger.error(`Unhandled error in PeticionesUbicacionService: ${error.message}`, error.stack);
    throw new InternalServerErrorException('Error interno del servidor, por favor revise los logs');
  }
}
