import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cliente } from './schema/cliente.schema';
import { Credito } from 'src/credito/schemas/credito.schema';
import { ClienteEntity } from './entities/cliente.entity';
import { CreditoService } from 'src/credito/credito.service';

@Injectable()
export class ClienteService {

  private logger = new Logger("ClienteService");

  constructor(
    @InjectModel(Cliente.name)
    private clienteModel: Model<Cliente>,

    @InjectModel(Credito.name)
    private creditoModel: Model<Credito>,
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
    const credito = await this.creditoModel.findOne({
      cliente: termino,
      status: true
    });

    if (!cliente) throw new NotFoundException("No existe el cliente");

    if (!credito) {
      return {
        cliente: ClienteEntity.fromObject(cliente),
        credito: null
      }
    }

    return {
      cliente: ClienteEntity.fromObject(cliente),
      credito: await this.creditoService.getCreditoById(credito._id.toString(), cliente.ruta.toString())
    }

  }

  async update(id: string, updateClienteDto: UpdateClienteDto) {

    try {

      return await this.clienteModel.findByIdAndUpdate(id, updateClienteDto, { new: true });

    } catch (error) {

      this.handleExceptions(error)

    }

  }

  async remove(id: string) {
    const client = await this.findOne(id);
    // await client.updateOne({ state: false }, { new: true });

    return true;
  }

  private handleExceptions(error: any) {
    if (error.code === 11000) {
      throw new BadRequestException("Ya existe este cliente")
    }

    this.logger.error(error);
    throw new InternalServerErrorException("Por favor revisa los logs")
  }
}
