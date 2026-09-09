import { BadRequestException, forwardRef, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types, PipelineStage } from 'mongoose';
import { Cliente } from './schema/cliente.schema';
import { ClienteEntity } from './entities/cliente.entity';
import { CreditoService } from 'src/credito/credito.service';

/** Filtro Mongo: clientes operativos (state ausente o true). */
export const CLIENTE_OPERATIVO_FILTER = { state: { $ne: false } } as const;

@Injectable()
export class ClienteService {

  private logger = new Logger("ClienteService");

  constructor(
    @InjectModel(Cliente.name)
    private clienteModel: Model<Cliente>,
    @Inject(forwardRef(() => CreditoService))
    private readonly creditoService: CreditoService,
  ) { }

  async create(createClienteDto: CreateClienteDto): Promise<ClienteEntity> {

    const verificarSiExisteclientePorDpi = await this.clienteModel.findOne({
      dpi: createClienteDto.dpi.trim(),
      ruta: createClienteDto.ruta
    });

    if (verificarSiExisteclientePorDpi) {
      if (verificarSiExisteclientePorDpi.state === false) {
        throw new BadRequestException(
          `El cliente ${verificarSiExisteclientePorDpi.alias} está desactivado. Un superadmin debe reactivarlo.`,
        );
      }
      throw new BadRequestException(`Ya existe el cliente ${verificarSiExisteclientePorDpi.alias} en la ruta`);
    }

    try {

      const cliente = await this.clienteModel.create(createClienteDto);
      return ClienteEntity.fromObject(cliente);

    } catch (error) {
      this.handleExceptions(error)
    }

  }

  async findAll(status: boolean, idRuta: string): Promise<ClienteEntity[]> {
    const clientes = await this.clienteModel.find({
      ruta: idRuta,
      status,
      ...CLIENTE_OPERATIVO_FILTER,
    }).sort({ turno: 1 })

    const clientesFromObject: ClienteEntity[] = clientes.map(cliente => ClienteEntity.fromObject(cliente));
    return clientesFromObject;
  }

  async findByAdmin(idRuta: string, includeInactive = false): Promise<Cliente[]> {
    const filter: Record<string, unknown> = { ruta: idRuta };
    if (!includeInactive) {
      Object.assign(filter, CLIENTE_OPERATIVO_FILTER);
    }
    return await this.clienteModel.find(filter);
  }

  async findOne(termino: string, isSuperAdmin = false) {

    const cliente = await this.clienteModel.findById(termino);

    if (!cliente) throw new NotFoundException("No existe el cliente");

    if (cliente.state === false && !isSuperAdmin) {
      throw new NotFoundException("No existe el cliente");
    }

    const credito = await this.creditoService.getActiveCreditoForCliente(
      termino,
      cliente.ruta.toString(),
    );

    return {
      cliente: ClienteEntity.fromObject(cliente),
      credito,
    }

  }

  async update(id: string, updateClienteDto: UpdateClienteDto) {
    const { state: _ignored, ...rest } = updateClienteDto as UpdateClienteDto & { state?: boolean };

    const existing = await this.clienteModel.findById(id);
    if (!existing) {
      throw new NotFoundException('No existe el cliente');
    }
    if (existing.state === false) {
      throw new BadRequestException('Cliente desactivado');
    }

    try {
      return await this.clienteModel.findByIdAndUpdate(id, rest, { returnDocument: 'after' });
    } catch (error) {
      this.handleExceptions(error)
    }
  }

  async setState(id: string, state: boolean): Promise<ClienteEntity> {
    const cliente = await this.clienteModel.findByIdAndUpdate(
      id,
      { $set: { state } },
      { returnDocument: 'after' },
    );
    if (!cliente) {
      throw new NotFoundException('No existe el cliente');
    }
    return ClienteEntity.fromObject(cliente);
  }

  async remove(id: string) {
    const cliente = await this.clienteModel.findById(id);
    if (!cliente) {
      throw new NotFoundException('No existe el cliente');
    }

    const rutaId = cliente.ruta?.toString();
    if (!rutaId) {
      throw new BadRequestException('El cliente no tiene ruta asociada');
    }

    const activeCredito = await this.creditoService.getActiveCreditoForCliente(id, rutaId);
    if (activeCredito) {
      throw new BadRequestException(
        'No se puede eliminar el cliente: tiene un crédito activo. Elimina o salda el crédito primero.',
      );
    }

    await this.clienteModel.findByIdAndDelete(id);
    return { message: 'Cliente eliminado', id };
  }

  // --- APIs para otros módulos (Vertical 1 / 4) ---

  /** Ownership: resolver ruta a partir de un cliente. */
  async getRutaByClienteId(
    clienteId: string,
  ): Promise<{ exists: false } | { exists: true; rutaId: string | null }> {
    const cliente = await this.clienteModel.findById(clienteId).select('ruta').lean();
    if (!cliente) return { exists: false };
    return {
      exists: true,
      rutaId: cliente.ruta ? cliente.ruta.toString() : null,
    };
  }

  async countByRuta(rutaId: string | Types.ObjectId, status?: boolean): Promise<number> {
    const filter: Record<string, unknown> = { ruta: rutaId, ...CLIENTE_OPERATIVO_FILTER };
    if (status !== undefined) filter.status = status;
    return this.clienteModel.countDocuments(filter);
  }

  async deleteManyByRuta(rutaId: string, session: ClientSession): Promise<void> {
    await this.clienteModel.deleteMany({ ruta: rutaId }).session(session);
  }

  // --- APIs para CreditoService (V4b: sin @InjectModel Cliente ajeno) ---

  async findByIdLean(
    clienteId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ _id: Types.ObjectId; nombre: string; status: boolean; state: boolean } | null> {
    const cliente = await this.clienteModel
      .findById(clienteId)
      .select('nombre status state')
      .session(session || null)
      .lean();
    if (!cliente) return null;
    return {
      ...(cliente as { _id: Types.ObjectId; nombre: string; status: boolean }),
      state: (cliente as { state?: boolean }).state !== false,
    };
  }

  /** Rechaza si el cliente no existe o está desactivado (state=false). */
  async assertClienteOperativo(
    clienteId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const cliente = await this.clienteModel
      .findById(clienteId)
      .select('state')
      .session(session || null)
      .lean();
    if (!cliente) {
      throw new NotFoundException('No existe el cliente');
    }
    if ((cliente as { state?: boolean }).state === false) {
      throw new BadRequestException('Cliente desactivado');
    }
  }

  async setStatus(
    clienteId: string | Types.ObjectId,
    status: boolean,
    session?: ClientSession,
  ): Promise<void> {
    await this.clienteModel.findByIdAndUpdate(
      clienteId,
      { $set: { status } },
      { session: session || undefined },
    );
  }

  async setTurno(
    clienteId: string | Types.ObjectId,
    turno: number,
    session?: ClientSession,
  ): Promise<void> {
    await this.clienteModel.findByIdAndUpdate(
      clienteId,
      { $set: { turno } },
      { returnDocument: 'after', session: session || undefined },
    );
  }

  /** Reportes: agregaciones sin exponer el model. */
  async aggregatePipeline<T = any>(pipeline: PipelineStage[]): Promise<T[]> {
    return this.clienteModel.aggregate<T>(pipeline);
  }

  private handleExceptions(error: any) {
    if (error.code === 11000) {
      throw new BadRequestException("Ya existe este cliente")
    }

    this.logger.error(error);
    throw new InternalServerErrorException("Por favor revisa los logs")
  }
}
