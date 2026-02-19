import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel, InjectConnection } from "@nestjs/mongoose";
import { Model, Connection, Types } from "mongoose";

import { MovimientoCaja } from "./schemas/caja-movimiento.schemas";
import { CreateMovimientoCajaDto, UpdateMovimientoCajaDto } from "./dto";
import { Caja } from "src/caja/schemas/caja.schema";
import { Ruta } from "src/ruta/schema/ruta.schema";
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditoService } from "src/credito/credito.service";
import { SubTipo, TipoMovimiento } from "./interfaces";
import { CreateCreditoDto } from "src/credito/dto";
import { CajaMovimientoEntity } from "./entities/caja-movimiento.entity";

@Injectable()
export class MovimientoCajaService {

  private logger = new Logger("MovimientoCajaService");

  constructor(
    @InjectModel(MovimientoCaja.name)
    private readonly cajaMovimientoModel: Model<MovimientoCaja>,

    @InjectModel(Caja.name)
    private readonly cajaModel: Model<Caja>,

    @InjectModel(Ruta.name)
    private readonly rutaModel: Model<Ruta>,

    private readonly dateFnsAdapter: DateFnsAdapter,
    private readonly creditoService: CreditoService,
    @InjectConnection() private readonly connection: Connection
  ) { }


  async addPago(createPagoDto: CreateMovimientoCajaDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const { rutaId, monto, creditoId, clienteId, ...rest } = createPagoDto;

      const ruta = await this.rutaModel.findById(rutaId).session(session);
      if (!ruta) throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      if (!ruta.caja_actual) throw new BadRequestException(`La ruta con el id ${rutaId} no tiene caja asociada`);

      const caja = await this.cajaModel.findById(ruta.caja_actual).session(session);
      if (!caja) throw new NotFoundException(`Caja con el id ${rutaId} no existe`);

      const fecha = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone);

      const credito = await this.creditoService.getCreditoById(creditoId, rutaId, session);
      if (!credito) throw new NotFoundException(`Credito con el id ${creditoId} no existe`);
      if (monto > credito.saldo) {
        throw new BadRequestException(
          `El monto del pago (${monto}) excede el saldo pendiente del crédito (${credito.saldo}).`
        );
      }

      // Verificar si ya existe un pago 
      const pagoExistente = await this.cajaMovimientoModel.findOne({
        credito: credito.id,
        subTipo: SubTipo.PAGOCREDITO,
        fecha: { $gte: fecha }
      }).session(session);

      if (pagoExistente) throw new BadRequestException(`Ya ingresaste este pago, por favor recarga la pagina`);

      // crear el movimiento
      await this.cajaMovimientoModel.create([{
        caja: caja._id,
        monto,
        tipoMovimiento: TipoMovimiento.INGRESO,
        subTipo: SubTipo.PAGOCREDITO,
        fecha,
        cliente: clienteId,
        credito: creditoId,
        ruta: rutaId,
        ...rest
      }], { session });

      // llamamos el handlePaymentMade del credito
      await this.creditoService.handlePaymentMade(creditoId, rutaId, clienteId, session);


      await session.commitTransaction();
      return true;

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }

  }

  async addOficinaMovimiento(createMovimientoDto: CreateMovimientoCajaDto) {

    const session = await this.connection.startSession();
    session.startTransaction();

    const { tipoMovimiento, rutaId, monto, ...rest } = createMovimientoDto;

    try {

      const ruta = await this.rutaModel.findById(rutaId).session(session);
      if (!ruta) throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      if (!ruta.caja_actual) throw new BadRequestException(`La ruta con el id ${rutaId} no tiene caja asociada`);

      await this.cajaMovimientoModel.create([{
        caja: ruta.caja_actual,
        monto,
        tipoMovimiento,
        ruta: rutaId,
        fecha: this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone),
        ...rest
      }], { session });

      await session.commitTransaction();

      return true;

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }

  }

  async updateMovimiento(movimientoId: string, updateMovimientoCajaDto: UpdateMovimientoCajaDto) {

    const session = await this.connection.startSession();
    session.startTransaction();

    try {

      const updateMovimiento = await this.cajaMovimientoModel.findByIdAndUpdate(
        movimientoId,
        { $set: updateMovimientoCajaDto },
        { new: true, session }
      );

      if (!updateMovimiento) throw new NotFoundException(`Movimiento con el id ${movimientoId} no existe`);

      await session.commitTransaction();

      return true;

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }

  }

  async updatePago(movimientoId: string, updateMovimientoCajaDto: UpdateMovimientoCajaDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const movimiento = await this.cajaMovimientoModel.findById(movimientoId).session(session);
      if (!movimiento) throw new NotFoundException(`Movimiento con el id ${movimientoId} no existe`);

      const caja = await this.cajaModel.findById(movimiento.caja).session(session);
      if (!caja) throw new NotFoundException(`Caja con el id ${movimiento.caja} no existe`);

      const credito = await this.creditoService.getCreditoById(movimiento.credito.toString(), caja.ruta.toString(), session);

      // Restauramos el saldo del credito, y el saldo de la caja
      const saldoCreditoRestaurado = credito.saldo + movimiento.monto;

      // volver a verificar si el monto es menor al saldo del credito 
      if (updateMovimientoCajaDto.monto > saldoCreditoRestaurado) {
        throw new BadRequestException(`El monto del pago (${updateMovimientoCajaDto.monto}) excede el saldo pendiente del crédito (${saldoCreditoRestaurado}).`);
      }

      movimiento.monto = updateMovimientoCajaDto.monto;
      await movimiento.save({ session });

      await caja.save({ session });

      await this.creditoService.handlePaymentMade(movimiento.credito.toString(), caja.ruta.toString(), movimiento.cliente.toString(), session);

      await session.commitTransaction();

      return true;

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }
  }

  async addRenovacion(createCreditoDto: CreateCreditoDto) {

    const { rutaId, clienteId, ...rest } = createCreditoDto;

    const session = await this.connection.startSession();
    session.startTransaction();

    try {

      const ruta = await this.rutaModel.findById(rutaId).session(session);
      if (!ruta) throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);

      const credito = await this.creditoService.create(createCreditoDto, session);

      const movimiento = new this.cajaMovimientoModel({
        monto: credito.valor_credito,
        subTipo: SubTipo.PRESTAMO,
        tipoMovimiento: TipoMovimiento.EGRESO,
        cliente: credito.cliente,
        credito: credito._id,
        ruta: rutaId,
        caja: ruta.caja_actual,
        fecha: this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone),
      })

      await movimiento.save({ session });

      await session.commitTransaction();

      return {
        ok: true,
        movimiento,
        credito
      };

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }

  }

  async getHistorialPagos(rutaId: string, creditoId: string) {

    const session = await this.connection.startSession();
    session.startTransaction();

    try {

      const movimientos = await this.cajaMovimientoModel.find({
        credito: creditoId,
        subTipo: SubTipo.PAGOCREDITO,
        ruta: rutaId,
        tipoMovimiento: TipoMovimiento.INGRESO
      }).session(session);
      await session.commitTransaction();

      return movimientos.map(movimiento => CajaMovimientoEntity.fromObject(movimiento.toObject()));

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }

  }

  async getResumenDiario(rutaId: string, fecha: string) {
    const ruta = await this.rutaModel.findById(rutaId);
    if (!ruta) throw new NotFoundException('La Ruta no existe');
    const baseDate = new Date(fecha);
    baseDate.setUTCHours(0, 0, 0, 0);
    const inicioBusqueda = new Date(baseDate);
    const finBusqueda = new Date(baseDate);
    finBusqueda.setUTCHours(23, 59, 59, 999);
    const pagos = await this.cajaMovimientoModel.aggregate([
      {
        $match: {
          ruta: new Types.ObjectId(rutaId),
          fecha: { $gte: inicioBusqueda, $lte: finBusqueda },
          subTipo: SubTipo.PAGOCREDITO
        }
      },
      {
        $lookup: {
          from: 'clientes',
          localField: 'cliente',
          foreignField: '_id',
          as: 'clienteInfo'
        }
      },
      {
        $unwind: {
          path: '$clienteInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          fecha: 1,
          monto: 1,
          subTipo: 1,
          cliente: {
            id: '$clienteInfo._id',
            nombre: '$clienteInfo.nombre',
            alias: '$clienteInfo.alias'
          }
        }
      }
    ])

    return pagos;

  }

  private handleExceptions(error: any) {
    if (error instanceof NotFoundException ||
      error instanceof BadRequestException ||
      error instanceof InternalServerErrorException) { // Añade otros tipos si los usas
      this.logger.warn(`[API] ${error.message}`); // Log nivel WARN para errores controlados
      throw error;
    }

    // Para errores inesperados o no clasificados, loguea el stack trace completo.
    // Esto es crucial para depurar problemas que no esperabas.
    this.logger.error(`[SERVER_ERROR] ${error.message}`, error.stack);

    // Relanza un InternalServerErrorException genérico para errores no controlados.
    // Esto evita exponer detalles internos del servidor al cliente.
    throw new InternalServerErrorException('Error inesperado. Consulte los registros del servidor.');
  }

}