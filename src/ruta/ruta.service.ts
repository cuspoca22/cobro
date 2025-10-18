import { Injectable, NotFoundException, Logger, BadRequestException, InternalServerErrorException, forwardRef, Inject } from '@nestjs/common';
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
import { dateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { Ruta } from './schema/ruta.schema';

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

    private dateFnsAdapter: dateFnsAdapter,
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

  async findOne(id: string): Promise<Ruta> {


    const ruta = await this.rutaModel.findById(id)
      .populate("ultima_caja")
      .populate("caja_actual")

    if (!ruta) {
      throw new NotFoundException(`No existe una ruta con el id ${id}`);
    }

    return ruta;

  }

  async update(id: string, updateRutaDto: UpdateRutaDto) {

    try {
      const rutaUpdate = await this.rutaModel.findByIdAndUpdate(id, updateRutaDto, { new: true });
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

      if( !ruta.caja_actual ) {
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

      ruta.status = false;
      ruta.ultima_caja = caja._id;
      caja.status = false;

      await ruta.save({ session });
      await caja.save({ session });

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

  async openRuta(rutaId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const ruta = await this.rutaModel.findById(rutaId).session(session);
      if (!ruta) {
        throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      }

      const ultimaCaja = await this.cajaSvc.getUltimaCaja(rutaId, session);
      const startOfDayUtc = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone);

      let baseCaja = 0;

      // Si la ruta ya tiene cajas, obtenemos la base de la última
      if (ultimaCaja.hayUltimaCaja && ultimaCaja.ultimaCaja) {
        baseCaja = ultimaCaja.ultimaCaja.base;
      }

      // Unifica la creación de la nueva caja
      const newCaja = await this.cajaSvc.create({
        rutaId: rutaId,
        fecha: startOfDayUtc,
        base: baseCaja,
        session,
      });

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

  @Cron('00 00 4 * * 1-7', {
    name: 'closeAllRutas',
    timeZone: 'America/sao_paulo',
  })
  async closeAllRutas() {
    const rutasToClose = await this.rutaModel.find({status: true}).exec();

    for(const ruta of rutasToClose) {
      const rutaId = ruta._id.toString();
      try {
        const closed = await this.closeRuta(rutaId);
        if(closed){
          this.logger.log(`La ruta ${rutaId} se ha cerrado exitosamente`);
        }
      } catch (error) {
        this.handleExceptions(error)
      }
    }
  }

  private handleExceptions(error: any) {
    if (error.code === 11000) {
      throw new BadRequestException(error.message);
    }

    this.logger.error(error);
    throw new InternalServerErrorException("Revisar los logs")
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
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
      }, { new: true });

    } catch (error) {

      this.handleExceptions(error);

    }

  }

}
