import { Injectable, NotFoundException, Logger, BadRequestException, InternalServerErrorException, forwardRef, Inject, HttpException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';

import { CreateRutaDto } from './dto/create-ruta.dto';
import { UpdateRutaDto } from './dto/update-ruta.dto';
import { Connection, Model, Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { Credito } from '../credito/schemas/credito.schema';
import { Cliente } from '../cliente/schema/cliente.schema';
import { GlobalParams } from '../common/dto/global-params.dto';
import { Caja } from '../caja/schemas/caja.schema';
import { MessageGateway } from 'src/message/message.gateway';
import { CajaService } from '../caja/caja.service';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { Ruta } from './schema/ruta.schema';
import { CajaEntity } from '../caja/entities/caja.entity';
import { SubTipo, TipoMovimiento } from '../movimientoCaja/interfaces';
import { RutaEntity } from './entities/ruta.entity';

@Injectable()
export class RutaService {

  private logger = new Logger("RutaService");

  constructor(
    private socketRuta: MessageGateway,

    @InjectModel(Ruta.name)
    private readonly rutaModel: Model<Ruta>,

    @InjectModel(Credito.name)
    private readonly creditoModel: Model<Credito>,

    @InjectModel(Cliente.name)
    private readonly clienteModel: Model<Cliente>,

    @InjectModel(Caja.name)
    private readonly cajaModel: Model<Caja>,

    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,

    private cajaSvc: CajaService,
    @InjectConnection() private readonly connection: Connection,

    private dateFnsAdapter: DateFnsAdapter,
  ) { }

  async create(createRutaDto: CreateRutaDto) {

    try {

      const ruta = await this.rutaModel.create(createRutaDto);

      return ruta;

    } catch (error) {

      this.handleExceptions(error)

    }

  }

  async findAll(): Promise<Ruta[]> {
    return await this.rutaModel.find()
  }

  async findByFilter(filter: any): Promise<Ruta[]> {

    return await this.rutaModel.find(filter)

  }

  async findOne(id: string): Promise<any> {

    const ruta = await this.rutaModel.findById(id)
      .populate("ultima_caja")
      .populate("caja_actual")
      .lean();

    if (!ruta) {
      throw new NotFoundException(`No existe una ruta con el id ${id}`);
    }

    const [total_clientes, clientes_activos] = await Promise.all([
      this.clienteModel.countDocuments({ ruta: ruta._id }),
      this.clienteModel.countDocuments({ ruta: ruta._id, status: true }),
    ]);

    const metrics = await this.creditoModel.aggregate([
      { $match: { ruta: ruta._id, status: true } },
      {
        $lookup: {
          from: 'movimientoCaja',
          localField: '_id',
          foreignField: 'credito',
          as: 'allPayments',
          pipeline: [
            {
              $match: {
                tipoMovimiento: TipoMovimiento.INGRESO,
                subTipo: SubTipo.PAGOCREDITO,
              }
            }
          ]
        },
      },
      {
        $addFields: {
          abonos: {
            $reduce: {
              input: "$allPayments",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.monto"] }
            }
          }
        },
      },
      {
        $project: {
          saldo: { $subtract: ["$total_pagar", "$abonos"] },
          ganancia_credito: { $subtract: ["$total_pagar", "$valor_credito"] }
        }
      },
      {
        $group: {
          _id: null,
          cartera: { $sum: "$saldo" },
          ganancia_total: { $sum: "$ganancia_credito" }
        }
      }
    ]);

    const cartera = metrics.length > 0 ? metrics[0].cartera : 0;
    const ganancia_total = metrics.length > 0 ? metrics[0].ganancia_total : 0;

    return RutaEntity.fromObject({
      ...ruta,
      total_clientes,
      clientes_activos,
      cartera,
      ganancia_total
    });

  }

  async update(id: string, updateRutaDto: UpdateRutaDto) {

    try {
      const rutaUpdate = await this.rutaModel.findByIdAndUpdate(id, updateRutaDto, { returnDocument: 'after' });
      return rutaUpdate;
    } catch (error) {
      this.handleExceptions(error);
    }

  }

  async delete(id: string, globalParams: GlobalParams): Promise<boolean> {
    const { userId } = globalParams;
    const user = await this.authService.findOne(userId);

    // await this.rutaModel.findByIdAndDelete(id);

    // user.rutas = user.rutas.filter(ruta => ruta._id !== id);
    // await user.save();

    return true;
  }

  async closeRuta(rutaId: string): Promise<boolean> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const ruta = await this.rutaModel.findById(rutaId).session(session);
      if (!ruta) {
        throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      }

      if (!ruta.caja_actual) {
        throw new BadRequestException(`La ruta no tiene cajas creadas`);
      }

      // Si la ruta ya está cerrada, devolver error
      if (!ruta.status) {
        throw new BadRequestException(`La ruta ya fue cerrada el dia de hoy`);
      }

      const caja = await this.cajaModel.findById(ruta.caja_actual).session(session);
      if (!caja) {
        throw new NotFoundException(`La caja con el id ${ruta.caja_actual} no existe`);
      }

      // cuando la ruta se cierra, actualiza la caja, para que se guarde lo que se trabajo hasta ese preciso momento
      this.logger.log(`Cerrando ruta ${ruta._id}, actualizando movimientos de caja...`);
      await this.cajaSvc.getMovimientosResumen(ruta._id.toString(), session)

      ruta.status = false;
      ruta.ultima_caja = caja._id;
      caja.status = false;

      await Promise.all([
        ruta.save({ session }),
        caja.save({ session })
      ]);

      // Confirma la transacción. Si esta línea no se ejecuta, NINGÚN cambio se guardará.
      await session.commitTransaction();

      return true;

    } catch (error) {
      // Si hay un error, aborta la transacción para revertir todos los cambios
      await session.abortTransaction();
      this.handleExceptions(error);
    } finally {
      session.endSession();
    }
  }

  async openRuta(rutaId: string): Promise<{ ok: boolean; caja: CajaEntity }> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const ruta = await this.rutaModel.findById(rutaId).session(session);
      if (!ruta) {
        throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      }

      if (ruta.status) {
        throw new BadRequestException(`La ruta ya se encuentra abierta.`);
      }

      const { hayUltimaCaja, ultimaCaja } = await this.cajaSvc.getUltimaCaja(rutaId, session);

      // Asegurar timezone valido
      const timeZone = ruta.timeZone || 'America/Mexico_City';
      let startOfDayUtc = this.dateFnsAdapter.getStartOfTodayInTimeZone(timeZone);

      // Fallback si la fecha generada es inválida
      if (!startOfDayUtc || isNaN(startOfDayUtc.getTime())) {
        this.logger.warn(`Fecha inválida generada para timezone ${timeZone}. Usando UTC actual como fallback.`);
        startOfDayUtc = new Date();
        startOfDayUtc.setUTCHours(0, 0, 0, 0);
      }

      const baseCaja = (hayUltimaCaja && ultimaCaja) ? ultimaCaja.caja_final : 0;

      // Unifica la creación de la nueva caja
      const newCaja = await this.cajaSvc.create({
        rutaId: rutaId,
        fecha: startOfDayUtc,
        base: baseCaja,
      }, session);

      // Actualiza la ruta dentro de la transacción
      ruta.caja_actual = new Types.ObjectId(newCaja.id);
      ruta.status = true;
      await ruta.save({ session });

      // Confirma la transacción. Si esta línea no se ejecuta, NINGÚN cambio se guardará.
      await session.commitTransaction();

      return {
        ok: true,
        caja: newCaja,
      };

    } catch (error) {
      // Si hay un error, aborta la transacción para revertir todos los cambios
      await session.abortTransaction();
      this.handleExceptions(error)
    } finally {
      // Siempre finaliza la sesión
      session.endSession();
    }
  }

  @Cron('00 00 3 * * *', {
    name: 'closeAllRutas',
    timeZone: 'America/Sao_Paulo',
  })
  async closeAllRutas() {
    this.logger.log('Iniciando cierre automático de rutas...');
    const rutasToClose = await this.rutaModel.find({ status: true }).exec();

    for (const ruta of rutasToClose) {
      const rutaId = ruta._id.toString();
      try {
        const closed = await this.closeRuta(rutaId);
        if (closed) {
          this.logger.log(`La ruta ${rutaId} se ha cerrado exitosamente`);
        }
      } catch (error) {
        this.logger.error(`Error al cerrar la ruta ${rutaId}: ${error.message}`);
      }
    }
  }

  @Cron('00 00 7 * * *', {
    name: 'openAllRutas',
    timeZone: 'America/Sao_Paulo',
  })
  async openAllRutas() {
    this.logger.log('Iniciando apertura automática de rutas...');
    const rutasToOpen = await this.rutaModel.find({
      status: false,
      autoOpen: true
    }).exec();

    for (const ruta of rutasToOpen) {
      const rutaId = ruta._id.toString();
      try {
        const result = await this.openRuta(rutaId);
        if (result.ok) {
          this.logger.log(`La ruta ${rutaId} se ha abierto exitosamente`);
        }
      } catch (error) {
        this.logger.error(`Error al abrir la ruta ${rutaId}: ${error.message}`);
      }
    }
  }

  private handleExceptions(error: any) {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error.code === 11000) {
      throw new BadRequestException(error.message);
    }

    this.logger.error(error);
    throw new InternalServerErrorException("Revisar los logs")
  }


  // ACTUALIZAR RUTA IMPLICA QUE SE DEBE CALCULAR NUEVAMENTE SU CARTERA, GASTOS Y DEMAS
  public async actualizarRuta(idRuta: any): Promise<void> {

    const ruta = await this.rutaModel.findById(idRuta);

    if (!ruta) throw new NotFoundException(`La ruta con el id ${idRuta} no existe`);

    try {

      const [clientes, clientesActivos, creditosActivos, allCreditos] =
        await Promise.all([
          this.clienteModel.countDocuments({ ruta: ruta._id }),
          this.clienteModel.countDocuments({ ruta: ruta._id, status: true }),
          this.creditoModel.find({ ruta: ruta._id, status: true }),
          this.creditoModel.find({ ruta: ruta._id }),
        ]);

      // TODO: CALCULAR EL CARTERA, total_cobrado, total_prestado, clientes, clientes_activos
      // const cartera = creditosActivos.reduce((sum, credito) => sum + credito.saldo, 0);
      // const totalCobrado = allCreditos.reduce((sum, credito) => sum + credito.abonos, 0);
      const totalPrestado = allCreditos.reduce((sum, credito) => sum + credito.valor_credito, 0);

      await ruta.updateOne({
        total_prestado: totalPrestado,
        clientes,
        clientes_activos: clientesActivos,
      }, { returnDocument: 'after' });

    } catch (error) {

      this.handleExceptions(error);

    }

  }

}
