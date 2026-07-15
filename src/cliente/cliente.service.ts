import { BadRequestException, forwardRef, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types, PipelineStage } from 'mongoose';
import { Cliente } from './schema/cliente.schema';
import { ClienteEntity } from './entities/cliente.entity';
import { CreditoService } from 'src/credito/credito.service';

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
      status
    }).sort({ turno: 1 })

    const clientesFromObject: ClienteEntity[] = clientes.map(cliente => ClienteEntity.fromObject(cliente));
    return clientesFromObject;
  }

  async findByAdmin(idRuta: string): Promise<Cliente[]> {
    return await this.clienteModel.find({
      ruta: idRuta,
    })

  }

  async findOne(termino: string) {

    const cliente = await this.clienteModel.findById(termino);

    if (!cliente) throw new NotFoundException("No existe el cliente");

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

    try {

      return await this.clienteModel.findByIdAndUpdate(id, updateClienteDto, { returnDocument: 'after' });

    } catch (error) {

      this.handleExceptions(error)

    }

  }

  async remove(id: string) {
    const client = await this.findOne(id);
    // await client.updateOne({ state: false }, { returnDocument: 'after' });

    return true;
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
    const filter: any = { ruta: rutaId };
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
  ): Promise<{ _id: Types.ObjectId; nombre: string; status: boolean } | null> {
    const cliente = await this.clienteModel
      .findById(clienteId)
      .select('nombre status')
      .session(session || null)
      .lean();
    if (!cliente) return null;
    return cliente as { _id: Types.ObjectId; nombre: string; status: boolean };
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
