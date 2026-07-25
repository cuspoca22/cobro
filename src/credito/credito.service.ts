import { BadRequestException, forwardRef, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Credito } from './schemas/credito.schema';
import { MoraAplicacion, TipoMoraAplicacion } from './schemas/mora-aplicacion.schema';
import { ClientSession, Connection, Model, PipelineStage, Types } from 'mongoose';
import mongoose from 'mongoose';

import { CreateCreditoDto, UpdateCreditoDto } from './dto/';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditCalculatorService } from './helpers/credit.calculator.service';
import { SubTipo, TipoMovimiento } from 'src/movimientoCaja/interfaces';
import { CreditoEntity } from './entities/credito.entity';
import { HistorialCredito } from './interfaces';
import { TransactionHelper } from 'src/common/helpers';
import { ClienteService } from '../cliente/cliente.service';
import { RutaService } from '../ruta/ruta.service';
import { EmpresaService } from '../empresa/empresa.service';
import { MessageGateway } from '../message/message.gateway';
import { CurrencyService } from '../currency/currency.service';

@Injectable()
export class CreditoService {

  private logger = new Logger("CreditoService");
  private transactionHelper: TransactionHelper;

  constructor(
    @InjectModel(Credito.name)
    private readonly creditoModel: Model<Credito>,

    @InjectModel(MoraAplicacion.name)
    private readonly moraAplicacionModel: Model<MoraAplicacion>,

    @Inject(forwardRef(() => ClienteService))
    private readonly clienteService: ClienteService,

    @Inject(forwardRef(() => RutaService))
    private readonly rutaService: RutaService,

    @Inject(forwardRef(() => EmpresaService))
    private readonly empresaService: EmpresaService,

    @Inject(forwardRef(() => MessageGateway))
    private readonly messageGateway: MessageGateway,

    private dateFnsAdapter: DateFnsAdapter,
    private creditCalculatorSvc: CreditCalculatorService,
    private readonly currencyService: CurrencyService,
    @InjectConnection() private readonly connection: Connection,
  ) {
    this.transactionHelper = new TransactionHelper(connection);
  }

  /**
   * Crea un nuevo crédito, manejando los cálculos para modo automático o manual.
   * @param createCreditoDto Los datos de entrada del crédito.
   * @returns El crédito creado en formato DTO.
   */
  async create(createCreditoDto: CreateCreditoDto, session: ClientSession) {

    try {
      const {
        clienteId,
        rutaId,
        valor_credito,
        total_cuotas,
        frecuencia_cobro,
        observaciones,
        interes,
        valor_cuota,
      } = createCreditoDto;

      let calculatedTotalPagar: number;
      let calculatedInteres: number;
      let calculatedValorCuota: number;

      // Obtener la ruta dentro de la transacción
      const ruta = await this.rutaService.findContextById(rutaId, session);
      if (!ruta) {
        throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);
      }

      // Determinar el modo y realizar cálculos (no necesitan estar en la transacción)
      if (interes !== undefined && interes !== null) {
        const { totalPagar, valorCuota } = this.creditCalculatorSvc.calculateFromInterest(
          valor_credito,
          interes,
          total_cuotas,
          ruta.currency,
        );
        calculatedTotalPagar = totalPagar;
        calculatedInteres = interes;
        calculatedValorCuota = valorCuota;
      } else if (valor_cuota !== undefined && valor_cuota !== null) {
        const { totalPagar, interes } = this.creditCalculatorSvc.calculateFromCuota(
          valor_credito,
          valor_cuota,
          total_cuotas,
          ruta.currency,
        );
        calculatedTotalPagar = totalPagar;
        calculatedInteres = interes;
        calculatedValorCuota = valor_cuota;
      } else {
        throw new BadRequestException('Debe proporcionar interés o valor_cuota.');
      }

      const fecha_inicio = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone);

      // Obtener el dueDate final
      const dueDate = this.creditCalculatorSvc.getDueDate(
        frecuencia_cobro,
        fecha_inicio,
        total_cuotas,
        ruta.timeZone
      );

      // FIX [P0 renovación]: invariante — rechazar si el cliente ya tiene un crédito activo.
      // El índice unique_credito_activo_por_cliente actúa como red de seguridad en concurrencia.
      const creditoActivo = await this.creditoModel.findOne(
        { cliente: clienteId, status: true },
        null,
        { session },
      ).lean();
      if (creditoActivo) {
        throw new BadRequestException(
          'El cliente ya tiene un crédito activo. Debe saldarlo antes de crear una renovación o un nuevo préstamo.',
        );
      }

      // Crear el nuevo documento de crédito dentro de la transacción
      try {
        const creditos = await this.creditoModel.create([{
          cliente: clienteId,
          ruta: rutaId,
          valor_credito,
          interes: calculatedInteres,
          total_cuotas,
          total_pagar: calculatedTotalPagar,
          valor_cuota: calculatedValorCuota,
          frecuencia_cobro,
          fecha_inicio,
          observaciones,
          status: true,
          dueDate,
        }], { session });

        const newCredito = creditos ? creditos[0] : null;

        if (!newCredito) {
          throw new InternalServerErrorException('No se pudo crear el crédito');
        }

        // Actualizar el estado del cliente dentro de la transacción
        await this.clienteService.setStatus(clienteId, true, session);

        // Preparar y retornar el DTO fuera de la transacción para mayor eficiencia
        const createdCreditForDto = {
          ...newCredito.toObject(),
          abonos: 0,
          saldo: calculatedTotalPagar,
          daysOverdue: 0,
          state: this.creditCalculatorSvc.classifyClient(0),
          paidToday: false,
        };

        return createdCreditForDto;
      } catch (createError: any) {
        // Duplicate key del índice unique_credito_activo_por_cliente (carrera concurrente)
        if (createError?.code === 11000) {
          throw new BadRequestException(
            'El cliente ya tiene un crédito activo. Debe saldarlo antes de crear una renovación o un nuevo préstamo.',
          );
        }
        throw createError;
      }
    } catch (error) {
      throw error;
    }

  }

  async updateCredito(
    creditoId: string,
    updateCreditoDto: UpdateCreditoDto,
    externalSession?: ClientSession
  ) {
    const {
      rutaId,
      valor_credito,
      total_cuotas,
      frecuencia_cobro,
      interes,
      valor_cuota,
    } = updateCreditoDto;

    // --- Validaciones de campos obligatorios ---
    if (!rutaId) throw new BadRequestException('rutaId es requerido');
    if (!valor_credito || valor_credito <= 0) {
      throw new BadRequestException('valor_credito debe ser un número positivo');
    }
    if (!total_cuotas || total_cuotas < 1) {
      throw new BadRequestException('total_cuotas debe ser al menos 1');
    }
    if (!frecuencia_cobro) {
      throw new BadRequestException('frecuencia_cobro es requerido');
    }

    const hasInteres = interes !== undefined && interes !== null;
    const hasValorCuota = valor_cuota !== undefined && valor_cuota !== null;

    // Validar exclusión mutua (crédito automático vs manual)
    if (!hasInteres && !hasValorCuota) {
      throw new BadRequestException(
        'Debe proporcionar "interes" (crédito automático) o "valor_cuota" (crédito manual).'
      );
    }
    if (hasInteres && hasValorCuota) {
      throw new BadRequestException(
        'No puede proporcionar ambos: "interes" y "valor_cuota". Elija un modo.'
      );
    }

    // --- Manejo de sesión (transacción) ---
    let session = externalSession;
    let ownsSession = false;

    if (!session) {
      session = await this.creditoModel.db.startSession();
      session.startTransaction();
      ownsSession = true;
    }

    try {
      // 1. Obtener la ruta (para currency, timeZone)
      const ruta = await this.rutaService.findContextById(rutaId, session);
      if (!ruta) {
        throw new NotFoundException(`Ruta con id ${rutaId} no existe`);
      }

      // 2. Obtener el crédito existente
      const credito = await this.creditoModel.findById(creditoId, null, { session });
      if (!credito) {
        throw new NotFoundException(`Crédito con id ${creditoId} no existe`);
      }

      // --- Cálculos financieros según el modo ---
      let calculatedTotalPagar: number;
      let calculatedInteres: number;
      let calculatedValorCuota: number;

      if (hasInteres) {
        // Modo automático: se proporciona interés
        const { totalPagar, valorCuota } = this.creditCalculatorSvc.calculateFromInterest(
          valor_credito,
          interes,
          total_cuotas,
          ruta.currency,
        );
        calculatedTotalPagar = totalPagar;
        calculatedInteres = interes;
        calculatedValorCuota = valorCuota;
      } else {
        // Modo manual: se proporciona valor_cuota
        const { totalPagar, interes: calcInteres } = this.creditCalculatorSvc.calculateFromCuota(
          valor_credito,
          valor_cuota,
          total_cuotas,
          ruta.currency,
        );
        calculatedTotalPagar = totalPagar;
        calculatedInteres = calcInteres;
        calculatedValorCuota = valor_cuota;
      }

      // FIX [P1 bug rutaId]: el schema usa `ruta`, no `rutaId`. Antes se escribía un
      // campo fantasma y la afiliación real no se actualizaba.
      // FIX [P1]: conservar fecha_inicio original al editar monto/cuotas; solo
      // recalcular dueDate a partir de esa fecha (no forzar "hoy").
      const fecha_inicio = credito.fecha_inicio;

      const dueDate = this.creditCalculatorSvc.getDueDate(
        frecuencia_cobro,
        fecha_inicio,
        total_cuotas,
        ruta.timeZone,
      );

      // --- Actualización atómica ---
      const updatedCredito = await this.creditoModel.findOneAndUpdate(
        { _id: creditoId },
        {
          $set: {
            ruta: rutaId,
            valor_credito,
            total_cuotas,
            frecuencia_cobro,
            interes: calculatedInteres,
            valor_cuota: calculatedValorCuota,
            total_pagar: calculatedTotalPagar,
            dueDate,
          },
        },
        { session, returnDocument: 'after', runValidators: true }
      );

      if (ownsSession) {
        await session.commitTransaction();
      }

      return updatedCredito;
    } catch (error) {
      if (ownsSession) {
        await session.abortTransaction();
      }
      this.handleExceptions(error);
    } finally {
      if (ownsSession) {
        await session.endSession();
      }
    }
  }

  async deleteCredito(creditoId: string, session: ClientSession) {
    const deletedCredito = await this.creditoModel.findByIdAndDelete(creditoId, { session });
    if (!deletedCredito) {
      throw new NotFoundException(`Credito con el id ${creditoId} no existe`);
    }

    // FIX [P0 renovación]: solo marcar cliente sin crédito activo si no queda otro status:true.
    const clienteId = deletedCredito.cliente;
    const otroActivo = await this.creditoModel.exists({
      cliente: clienteId,
      status: true,
      _id: { $ne: deletedCredito._id },
    }).session(session);

    if (!otroActivo) {
      await this.clienteService.setStatus(clienteId, false, session);
    }

    return deletedCredito;
  }

  async getCreditosByRuta(rutaId?: string): Promise<CreditoEntity[]> {

    const ruta = await this.rutaService.findContextById(rutaId);

    if (!ruta) throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);

    const startOfTodayUtc = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone);
    const endOfTodayUtc = this.dateFnsAdapter.getEndOfTodayInTimeZone(ruta.timeZone);

    const pipeline = this.getCommonAggregationPipeline(
      { ruta: new mongoose.Types.ObjectId(rutaId) },
      startOfTodayUtc,
      endOfTodayUtc
    );

    // Filtro adicional especifico para rutas (créditos activos o inactivos pagados hoy)
    pipeline.push({
      $match: {
        $or: [
          { status: true },
          {
            $and: [
              { status: false },
              { paidToday: true }
            ]
          }
        ]
      }
    });

    // Proyeccion y ordenamiento final
    pipeline.push(
      this.getLookupClienteStage(),
      { $unwind: { path: '$clienteDetail', preserveNullAndEmptyArrays: true } },
      this.getFinalProjectStage(),
      { $sort: { "cliente.turno": 1 } }
    );

    const creditsWithDetails = await this.creditoModel.aggregate(pipeline).exec();

    const credits = this.mapToCreditoEntity(creditsWithDetails, ruta.timeZone);
    return this.enrichCreditsWithMoraConfig(credits, rutaId);
  }

  /**
 * Obtiene los detalles de un crédito, incluyendo campos calculados como abonos y saldo.
 */
  async getCreditoById(
    creditId: string,
    rutaId: string,
    session?: ClientSession
  ): Promise<CreditoEntity> {

    const ruta = await this.rutaService.findContextById(rutaId, session);

    if (!ruta) throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);

    const startOfToday = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone)
    const endOfToday = this.dateFnsAdapter.getEndOfTodayInTimeZone(ruta.timeZone);

    const pipeline = this.getCommonAggregationPipeline(
      { _id: new mongoose.Types.ObjectId(creditId) },
      startOfToday,
      endOfToday
    );

    pipeline.push(
      this.getLookupClienteStage(),
      { $unwind: { path: '$clienteDetail', preserveNullAndEmptyArrays: true } },
      this.getFinalProjectStage(),
      { $sort: { turno: 1 } }
    );

    const creditsWithDetails = await this.creditoModel.aggregate(pipeline).session(session || null).exec();

    if (creditsWithDetails.length === 0) {
      throw new NotFoundException('Credit not found');
    }

    const creditPlain = creditsWithDetails[0];
    const creditEntity = CreditoEntity.fromObject(creditPlain);

    const withOverdue = this.calculateOverdueAndState(creditEntity, ruta.timeZone);
    const [enriched] = await this.enrichCreditsWithMoraConfig([withOverdue], rutaId);
    return enriched;
  }

  // Este método es invocado después de un pago para actualizar el estado persistente del crédito.
  // LÓGICA ACTUALIZADA: Un cliente solo puede tener un crédito activo a la vez
  async handlePaymentMade(creditoId: string, rutaId: string, clienteId: string, session?: ClientSession) {
    const creditDetails = await this.getCreditoById(creditoId, rutaId, session);
    const cliente = await this.clienteService.findByIdLean(clienteId, session);
    if (!cliente) {
      throw new NotFoundException(`Cliente con ID ${clienteId} no encontrado.`);
    }

    // Determinar si el crédito está pagado con tolerancia para errores de redondeo
    const EPSILON = 0.005; // medio centavo
    const moraAdeudada = creditDetails.mora_adeudada ?? 0;
    const isCreditPaid =
      Math.abs(creditDetails.saldo) < EPSILON &&
      Math.abs(moraAdeudada) < EPSILON;

    // LÓGICA SIMPLIFICADA: Un cliente solo puede tener un crédito activo
    // - Si el crédito está pagado: cliente inactivo (false)
    // - Si el crédito NO está pagado: cliente activo (true)
    const updatedCreditStatus = !isCreditPaid;
    const updatedClientState = isCreditPaid ? 'BUENO' : creditDetails.state;
    const updatedClienteStatus = !isCreditPaid; // Cliente activo solo si crédito NO pagado

    try {
      await this.creditoModel.updateOne(
        { _id: creditoId },
        {
          $set: {
            status: updatedCreditStatus,
            state: updatedClientState,
            ultimo_pago: creditDetails.ultimo_pago
          }
        },
        { session }
      );
    } catch (error) {
      this.logger.error(`Error actualizando crédito ${creditoId}: ${error.message}`, error.stack);
      throw error;
    }

    try {
      await this.clienteService.setStatus(clienteId, updatedClienteStatus, session);
    } catch (error) {
      this.logger.error(`Error actualizando cliente ${clienteId}: ${error.message}`, error.stack);
      throw error;
    }

    // Comprobante breve para compartir con el cliente
    const fechaPago = creditDetails.paymentsToday
      ? new Date(creditDetails.paymentsToday.createdAt).toLocaleDateString('es-GT')
      : 'No registrada';
    const pagoHoy = creditDetails.paymentsToday;
    const montoTotalHoy = pagoHoy ? Number(pagoHoy.monto) || 0 : 0;
    const montoMoraHoy = pagoHoy ? Number(pagoHoy.montoMora ?? 0) || 0 : 0;
    const montoAbonoHoy = pagoHoy
      ? Number(pagoHoy.montoAbono ?? (montoTotalHoy - montoMoraHoy)) || 0
      : 0;
    const cuotasPendientes = creditDetails.valor_cuota
      ? (creditDetails.saldo / creditDetails.valor_cuota).toFixed(2)
      : '0.00';

    const rutaCtx = await this.rutaService.findContextById(rutaId, session);
    const currencyCode = rutaCtx?.currency || 'USD';
    const fmt = (n: number) => this.currencyService.formatShareAmount(n, currencyCode);
    const fechaInicio = new Date(creditDetails.fecha_inicio).toLocaleDateString('es-GT');
    const cobraMora = !!creditDetails.cobraMora;

    const lineas: string[] = [
      `Comprobante de pago`,
      `Cliente: ${cliente.nombre}`,
      `Fecha: ${fechaPago}`,
    ];

    if (cobraMora && montoMoraHoy > 0) {
      lineas.push(`Abono: ${fmt(montoAbonoHoy)}`);
      lineas.push(`Mora cobrada: ${fmt(montoMoraHoy)}`);
      lineas.push(`Total pagado: ${fmt(montoTotalHoy)}`);
    } else {
      lineas.push(`Monto pagado: ${fmt(montoTotalHoy)}`);
    }

    lineas.push(
      `----------------------`,
      `Estado de credito`,
      `Fecha inicio: ${fechaInicio}`,
      `Valor prestado: ${fmt(creditDetails.valor_credito)}`,
      `Cuota: ${fmt(creditDetails.valor_cuota)}`,
      `Cuotas pendientes: ${cuotasPendientes}`,
      `Frecuencia: ${creditDetails.frecuencia_cobro}`,
      `Dias de Atraso: ${creditDetails.daysOverdue ?? 0}`,
    );

    if (cobraMora) {
      const moraAdeudadaFmt =
        Math.round((creditDetails.mora_adeudada ?? 0) * 100) / 100;
      const moraCobradaFmt =
        Math.round((creditDetails.mora_cobrada ?? 0) * 100) / 100;
      lineas.push(`Mora adeudada: ${fmt(moraAdeudadaFmt)}`);
      lineas.push(`Mora cobrada: ${fmt(moraCobradaFmt)}`);
    }

    const txtMessage = lineas.join('\n');

    return {
      ok: true,
      message: txtMessage,
      creditPaid: isCreditPaid,
      clientStatus: updatedClienteStatus
    }
  }

  // FIX [P1 turno]: listados ordenan por Cliente.turno; el endpoint de turno
  // escribía Credito.turno y el cobrador no veía el reorder. Fuente de verdad = Cliente.turno.
  async updateTurno(id: string, updateCreditoDto: UpdateCreditoDto) {
    try {
      if (updateCreditoDto.turno === undefined || updateCreditoDto.turno === null) {
        throw new BadRequestException('turno es requerido');
      }

      const credito = await this.creditoModel.findById(id).lean();
      if (!credito) {
        throw new NotFoundException(`Credito con el id ${id} no existe`);
      }

      await this.clienteService.setTurno(credito.cliente, updateCreditoDto.turno);

      // Mantener Credito.turno alineado por compatibilidad con lecturas antiguas
      await this.creditoModel.findByIdAndUpdate(id, { $set: { turno: updateCreditoDto.turno } });

      return true;

    } catch (error) {
      this.handleExceptions(error);
    }
  }

  async getHistorialCreditos(clienteId: string): Promise<HistorialCredito[]> {
    if (!Types.ObjectId.isValid(clienteId)) {
      throw new BadRequestException('clienteId inválido');
    }

    const rows = await this.creditoModel.aggregate([
      {
        $match: {
          cliente: new Types.ObjectId(clienteId),
          status: false,
        },
      },
      { $sort: { fecha_inicio: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: 'movimientoCaja',
          let: { creditoId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$credito', '$$creditoId'] },
                tipoMovimiento: TipoMovimiento.INGRESO,
                subTipo: SubTipo.PAGOCREDITO,
              },
            },
          ],
          as: 'allPayments',
        },
      },
      {
        $addFields: {
          abonos: {
            $sum: {
              $map: {
                input: '$allPayments',
                as: 'p',
                in: {
                  $ifNull: [
                    '$$p.montoAbono',
                    {
                      $subtract: [
                        '$$p.monto',
                        { $ifNull: ['$$p.montoMora', 0] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
      {
        $project: {
          ruta: 1,
          valor_credito: 1,
          interes: 1,
          total_pagar: 1,
          valor_cuota: 1,
          fecha_inicio: 1,
          dueDate: 1,
          frecuencia_cobro: 1,
          total_cuotas: 1,
          ultimo_pago: 1,
          state: 1,
          observaciones: 1,
          mora_adeudada: 1,
          mora_cobrada: 1,
          abonos: 1,
          saldo: { $subtract: ['$total_pagar', '$abonos'] },
        },
      },
    ]);

    return rows.map((credito) => {
      const diasTardados =
        credito.fecha_inicio && credito.ultimo_pago
          ? this.dateFnsAdapter.differenceInDays(
              credito.ultimo_pago,
              credito.fecha_inicio,
            )
          : 0;

      return {
        id: credito._id.toString(),
        ruta: credito.ruta?.toString?.() ?? String(credito.ruta),
        valor_credito: credito.valor_credito,
        interes: credito.interes,
        total_pagar: credito.total_pagar,
        abonos: credito.abonos ?? 0,
        saldo: credito.saldo ?? 0,
        valor_cuota: credito.valor_cuota,
        fecha_inicio: credito.fecha_inicio,
        dueDate: credito.dueDate,
        frecuencia_cobro: credito.frecuencia_cobro,
        ultimo_pago: credito.ultimo_pago,
        total_cuotas: credito.total_cuotas,
        dias_tardados_en_pagar: diasTardados,
        state: credito.state,
        observaciones: credito.observaciones,
        mora_adeudada: credito.mora_adeudada ?? 0,
        mora_cobrada: credito.mora_cobrada ?? 0,
      };
    });
  }

  async aplicarMora(
    creditoId: string,
    monto: number,
    usuarioId: string,
    motivo?: string,
    session?: ClientSession,
  ) {
    const run = async (sess: ClientSession) => {
      const credito = await this.creditoModel.findById(creditoId).session(sess);
      if (!credito) throw new NotFoundException(`Credito con el id ${creditoId} no existe`);
      if (!credito.status) {
        throw new BadRequestException('No se puede aplicar mora a un crédito saldado');
      }

      const moraConfig = await this.resolveMoraConfigForRuta(credito.ruta.toString());
      if (!moraConfig?.cobraMora) {
        throw new BadRequestException('La empresa no tiene habilitado el cobro de mora');
      }

      const montoRedondeado = Math.round(monto * 100) / 100;
      if (montoRedondeado <= 0) {
        throw new BadRequestException('El monto de mora debe ser mayor a 0');
      }

      const antes = credito.mora_adeudada ?? 0;
      const despues = Math.round((antes + montoRedondeado) * 100) / 100;

      // updateOne evita revalidar campos legacy (p.ej. frecuencia_cobro: 'DIARIO').
      await this.creditoModel.updateOne(
        { _id: credito._id },
        { $set: { mora_adeudada: despues } },
        { session: sess },
      );

      await this.moraAplicacionModel.create([{
        credito: credito._id,
        usuario: new Types.ObjectId(usuarioId),
        tipo: TipoMoraAplicacion.APLICAR,
        monto: montoRedondeado,
        motivo,
        mora_adeudada_antes: antes,
        mora_adeudada_despues: despues,
      }], { session: sess });

      const empresaInfo = await this.rutaService.getEmpresaIdByRutaId(
        credito.ruta.toString(),
      );

      return {
        creditoId: credito._id.toString(),
        rutaId: credito.ruta.toString(),
        empresaId: empresaInfo.exists ? (empresaInfo.empresaId ?? '') : '',
        mora_adeudada: despues,
        montoAplicado: montoRedondeado,
      };
    };

    const result = session
      ? await run(session)
      : await this.transactionHelper.withTransaction(run, 'CreditoService.aplicarMora');

    this.messageGateway.emitMoraActualizada({
      ruta: result.rutaId,
      empresa: result.empresaId,
      creditoId: result.creditoId,
      tipo: 'APLICAR',
      monto: result.montoAplicado,
      mora_adeudada: result.mora_adeudada,
    });

    return {
      creditoId: result.creditoId,
      mora_adeudada: result.mora_adeudada,
      montoAplicado: result.montoAplicado,
    };
  }

  async perdonarMora(
    creditoId: string,
    monto: number,
    usuarioId: string,
    motivo?: string,
    session?: ClientSession,
  ) {
    const run = async (sess: ClientSession) => {
      const credito = await this.creditoModel.findById(creditoId).session(sess);
      if (!credito) throw new NotFoundException(`Credito con el id ${creditoId} no existe`);

      const moraConfig = await this.resolveMoraConfigForRuta(credito.ruta.toString());
      if (!moraConfig?.cobraMora) {
        throw new BadRequestException('La empresa no tiene habilitado el cobro de mora');
      }

      const montoRedondeado = Math.round(monto * 100) / 100;
      if (montoRedondeado <= 0) {
        throw new BadRequestException('El monto a perdonar debe ser mayor a 0');
      }

      const antes = credito.mora_adeudada ?? 0;
      if (montoRedondeado > antes + 0.005) {
        throw new BadRequestException(
          `No se puede perdonar más mora de la adeudada (${antes}).`,
        );
      }

      const despues = Math.round((antes - montoRedondeado) * 100) / 100;
      const moraAdeudada = Math.max(0, despues);

      // updateOne evita revalidar campos legacy (p.ej. frecuencia_cobro: 'DIARIO').
      await this.creditoModel.updateOne(
        { _id: credito._id },
        { $set: { mora_adeudada: moraAdeudada } },
        { session: sess },
      );

      await this.moraAplicacionModel.create([{
        credito: credito._id,
        usuario: new Types.ObjectId(usuarioId),
        tipo: TipoMoraAplicacion.PERDONAR,
        monto: montoRedondeado,
        motivo,
        mora_adeudada_antes: antes,
        mora_adeudada_despues: moraAdeudada,
      }], { session: sess });

      const empresaInfo = await this.rutaService.getEmpresaIdByRutaId(
        credito.ruta.toString(),
      );

      return {
        creditoId: credito._id.toString(),
        rutaId: credito.ruta.toString(),
        empresaId: empresaInfo.exists ? (empresaInfo.empresaId ?? '') : '',
        mora_adeudada: moraAdeudada,
        montoPerdonado: montoRedondeado,
      };
    };

    const result = session
      ? await run(session)
      : await this.transactionHelper.withTransaction(run, 'CreditoService.perdonarMora');

    this.messageGateway.emitMoraActualizada({
      ruta: result.rutaId,
      empresa: result.empresaId,
      creditoId: result.creditoId,
      tipo: 'PERDONAR',
      monto: result.montoPerdonado,
      mora_adeudada: result.mora_adeudada,
    });

    return {
      creditoId: result.creditoId,
      mora_adeudada: result.mora_adeudada,
      montoPerdonado: result.montoPerdonado,
    };
  }

  /**
   * Aplica y cobra mora tras un pago (actualiza mora_adeudada / mora_cobrada).
   */
  async applyMoraCobroOnCredito(
    creditoId: string,
    montoMora: number,
    moraAAplicar: number,
    session: ClientSession,
  ): Promise<void> {
    if (montoMora <= 0 && moraAAplicar <= 0) return;

    const credito = await this.creditoModel.findById(creditoId).session(session);
    if (!credito) throw new NotFoundException(`Credito con el id ${creditoId} no existe`);

    const adeudada = credito.mora_adeudada ?? 0;
    const cobrada = credito.mora_cobrada ?? 0;

    const moraAdeudada = Math.round(
      Math.max(0, adeudada + moraAAplicar - montoMora) * 100,
    ) / 100;
    const moraCobrada = Math.round((cobrada + montoMora) * 100) / 100;

    await this.creditoModel.updateOne(
      { _id: credito._id },
      { $set: { mora_adeudada: moraAdeudada, mora_cobrada: moraCobrada } },
      { session },
    );
  }

  /**
   * Revierte el efecto de mora de un pago (update/delete).
   */
  async revertMoraCobroOnCredito(
    creditoId: string,
    montoMoraAnterior: number,
    session: ClientSession,
  ): Promise<void> {
    if (!montoMoraAnterior || montoMoraAnterior <= 0) return;

    const credito = await this.creditoModel.findById(creditoId).session(session);
    if (!credito) throw new NotFoundException(`Credito con el id ${creditoId} no existe`);

    const adeudada = credito.mora_adeudada ?? 0;
    const cobrada = credito.mora_cobrada ?? 0;

    const moraAdeudada = Math.round((adeudada + montoMoraAnterior) * 100) / 100;
    const moraCobrada = Math.round(Math.max(0, cobrada - montoMoraAnterior) * 100) / 100;

    await this.creditoModel.updateOne(
      { _id: credito._id },
      { $set: { mora_adeudada: moraAdeudada, mora_cobrada: moraCobrada } },
      { session },
    );
  }

  async resolveMoraConfigForRuta(rutaId: string) {
    const empresaInfo = await this.rutaService.getEmpresaIdByRutaId(rutaId);
    if (!empresaInfo.exists || !empresaInfo.empresaId) {
      return {
        cobraMora: false,
        permiteMoraVoluntaria: false,
        porcentajeMora: 0,
        baseCalculoMora: 'VALOR_CUOTA',
      };
    }
    const config = await this.empresaService.getMoraConfigById(empresaInfo.empresaId);
    return config ?? {
      cobraMora: false,
      permiteMoraVoluntaria: false,
      porcentajeMora: 0,
      baseCalculoMora: 'VALOR_CUOTA',
    };
  }

  private async enrichCreditsWithMoraConfig(
    credits: CreditoEntity[],
    rutaId: string,
  ): Promise<CreditoEntity[]> {
    const moraConfig = await this.resolveMoraConfigForRuta(rutaId);

    return credits.map((credit) => {
      const moraSugerida = this.creditCalculatorSvc.calcularMoraSugerida({
        cobraMora: moraConfig.cobraMora,
        porcentajeMora: moraConfig.porcentajeMora,
        baseCalculoMora: moraConfig.baseCalculoMora,
        valorCuota: credit.valor_cuota,
        saldo: credit.saldo,
        valorCredito: credit.valor_credito,
        daysOverdue: credit.daysOverdue ?? 0,
      });

      credit.moraSugerida = moraSugerida;
      credit.cobraMora = moraConfig.cobraMora;
      credit.permiteMoraVoluntaria = moraConfig.permiteMoraVoluntaria;
      credit.porcentajeMora = moraConfig.porcentajeMora;
      credit.baseCalculoMora = moraConfig.baseCalculoMora;
      return credit;
    });
  }

  // --- APIs de consulta/comando para otros módulos (Vertical 1–4: sin @InjectModel ajeno) ---

  /** Ownership: resolver ruta a partir de un crédito. */
  async getRutaByCreditoId(
    creditoId: string,
  ): Promise<{ exists: false } | { exists: true; rutaId: string | null }> {
    const credito = await this.creditoModel.findById(creditoId).select('ruta').lean();
    if (!credito) return { exists: false };
    return {
      exists: true,
      rutaId: credito.ruta ? credito.ruta.toString() : null,
    };
  }

  /** Cliente.findOne: crédito activo del cliente (o null). */
  async getActiveCreditoForCliente(
    clienteId: string,
    rutaId: string,
    session?: ClientSession,
  ): Promise<CreditoEntity | null> {
    const credito = await this.creditoModel
      .findOne({ cliente: clienteId, status: true })
      .session(session || null);
    if (!credito) return null;
    return this.getCreditoById(credito._id.toString(), rutaId, session);
  }

  /** Conteos / borrado usados por RutaService (incluye mora ligada a créditos). */
  async deleteManyByRuta(rutaId: string, session: ClientSession): Promise<void> {
    const creditos = await this.creditoModel
      .find({ ruta: rutaId })
      .select('_id')
      .session(session)
      .lean();
    const creditoIds = creditos.map((c) => c._id);
    if (creditoIds.length > 0) {
      await this.moraAplicacionModel
        .deleteMany({ credito: { $in: creditoIds } })
        .session(session);
    }
    await this.creditoModel.deleteMany({ ruta: rutaId }).session(session);
  }

  async findIdsAndValorByRuta(
    rutaId: string,
    status?: boolean,
  ): Promise<Array<{ valor_credito: number; status?: boolean }>> {
    const filter: any = { ruta: rutaId };
    if (status !== undefined) filter.status = status;
    return this.creditoModel.find(filter).select('valor_credito status').lean();
  }

  /**
   * Cartera y ganancia potencial de créditos activos (antes inline en RutaService.findOne).
   */
  async getCarteraYGananciaByRuta(rutaId: Types.ObjectId | string): Promise<{
    cartera: number;
    ganancia_total: number;
  }> {
    const rutaObjectId =
      typeof rutaId === 'string' ? new mongoose.Types.ObjectId(rutaId) : rutaId;

    const metrics = await this.creditoModel.aggregate([
      { $match: { ruta: rutaObjectId, status: true } },
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
              },
            },
          ],
        },
      },
      {
        $addFields: {
          abonos: {
            $sum: {
              $map: {
                input: '$allPayments',
                as: 'p',
                in: {
                  $ifNull: [
                    '$$p.montoAbono',
                    {
                      $subtract: [
                        '$$p.monto',
                        { $ifNull: ['$$p.montoMora', 0] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
      {
        $project: {
          saldo: { $subtract: ['$total_pagar', '$abonos'] },
          ganancia_credito: { $subtract: ['$total_pagar', '$valor_credito'] },
        },
      },
      {
        $group: {
          _id: null,
          cartera: { $sum: '$saldo' },
          ganancia_total: { $sum: '$ganancia_credito' },
        },
      },
    ]);

    return {
      cartera: metrics.length > 0 ? metrics[0].cartera : 0,
      ganancia_total: metrics.length > 0 ? metrics[0].ganancia_total : 0,
    };
  }

  /** Clientes con crédito activo iniciado antes de startOfDay (pendientes de caja). */
  async getClienteIdsConCreditoActivoAntesDe(
    rutaId: string,
    startOfDayUtc: Date,
    session?: ClientSession,
  ): Promise<string[]> {
    const result = await this.creditoModel
      .aggregate([
        {
          $match: {
            ruta: new mongoose.Types.ObjectId(rutaId),
            status: true,
            fecha_inicio: { $lt: startOfDayUtc },
          },
        },
        { $group: { _id: '$cliente' } },
      ])
      .session(session || null);

    return result.map((c) => c._id.toString());
  }

  /** Pretendido / total clientes activos al abrir caja (+ mora por cobrar). */
  async getCreditSummaryForRuta(rutaId: string): Promise<{
    pretendido: number;
    totalClientes: number;
    clientesPendietes: number;
    moraPorCobrar: number;
  }> {
    const result = await this.creditoModel.aggregate([
      {
        $match: {
          status: true,
          ruta: new mongoose.Types.ObjectId(rutaId),
        },
      },
      {
        $group: {
          _id: null,
          pretendido: { $sum: '$valor_cuota' },
          totalClientes: { $sum: 1 },
          moraPorCobrar: { $sum: { $ifNull: ['$mora_adeudada', 0] } },
        },
      },
    ]);

    if (result.length > 0) {
      return {
        pretendido: result[0].pretendido,
        totalClientes: result[0].totalClientes,
        clientesPendietes: result[0].totalClientes,
        moraPorCobrar: result[0].moraPorCobrar ?? 0,
      };
    }

    return { pretendido: 0, totalClientes: 0, clientesPendietes: 0, moraPorCobrar: 0 };
  }

  /** Reportes: agregaciones sin exponer el model. */
  async aggregatePipeline<T = any>(pipeline: PipelineStage[]): Promise<T[]> {
    return this.creditoModel.aggregate<T>(pipeline);
  }

  // FIX [P1]: repropagar HttpException (404/400) en lugar de enmascararlas como 500
  private handleExceptions(error: any) {
    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException ||
      error instanceof InternalServerErrorException
    ) {
      throw error;
    }
    this.logger.error(error);
    throw new InternalServerErrorException("Por favor revisa los logs")
  }

  // Helpers privados para agregacion
  private getCommonAggregationPipeline(matchStage: any, startOfToday: Date, endOfToday: Date): PipelineStage[] {
    return [
      { $match: matchStage },
      // Lookup para obtener todos los pagos
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
            $sum: {
              $map: {
                input: '$allPayments',
                as: 'p',
                in: {
                  $ifNull: [
                    '$$p.montoAbono',
                    {
                      $subtract: [
                        '$$p.monto',
                        { $ifNull: ['$$p.montoMora', 0] },
                      ],
                    },
                  ],
                },
              },
            },
          },
          ultimo_pago: { $max: '$allPayments.createdAt' },
        },
      },
      {
        $addFields: {
          saldo: { $subtract: ["$total_pagar", "$abonos"] }
        }
      },
      // Lookup para verificar pago de hoy
      {
        $lookup: {
          from: 'movimientoCaja',
          let: { creditoId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$credito', '$$creditoId'] },
                    { $eq: ['$tipoMovimiento', TipoMovimiento.INGRESO] },
                    { $eq: ['$subTipo', SubTipo.PAGOCREDITO] },
                    { $gte: ['$fecha', startOfToday] },
                    { $lte: ['$fecha', endOfToday] }
                  ]
                }
              }
            },
            { $limit: 1 }
          ],
          as: 'paymentsToday',
        },
      },
      {
        $addFields: {
          paidToday: { $gt: [{ $size: '$paymentsToday' }, 0] },
        },
      },
    ];
  }

  private getLookupClienteStage(): PipelineStage {
    return {
      $lookup: {
        from: 'clientes',
        localField: 'cliente',
        foreignField: '_id',
        as: 'clienteDetail'
      }
    };
  }

  private getFinalProjectStage(): PipelineStage {
    return {
      $project: {
        _id: 1,
        cliente: {
          _id: "$clienteDetail._id",
          nombre: "$clienteDetail.nombre",
          alias: "$clienteDetail.alias",
          direccion: "$clienteDetail.direccion",
          telefono: "$clienteDetail.telefono",
          ciudad: "$clienteDetail.ciudad",
          ubication: "$clienteDetail.ubication",
          dpi: "$clienteDetail.dpi",
          turno: "$clienteDetail.turno",
        },
        interes: 1,
        fecha_inicio: 1,
        valor_credito: 1,
        frecuencia_cobro: 1,
        valor_cuota: 1,
        ruta: 1,
        daysOverdue: 1,
        saldo: 1,
        total_pagar: 1,
        status: 1,
        state: 1,
        ultimo_pago: 1,
        abonos: 1,
        paidToday: 1,
        total_cuotas: 1,
        dueDate: 1,
        observaciones: 1,
        paymentsToday: 1,
        mora_adeudada: 1,
        mora_cobrada: 1,
      },
    };
  }

  private calculateOverdueAndState(credit: CreditoEntity, timeZone: string): CreditoEntity {
    let daysOverdue = 0;
    const today = this.dateFnsAdapter.getStartOfTodayInTimeZone(timeZone);

    if (credit.status === true) {
      const paidUntilDate = this.creditCalculatorSvc.calculatePaidUntilDate(
        credit.fecha_inicio,
        credit.frecuencia_cobro,
        credit.valor_cuota,
        credit.abonos,
        timeZone
      );

      // No pago = movimiento de pago con monto 0; el día aún no concluyó pero ya se visitó.
      const includeToday =
        credit.paymentsToday != null &&
        Number(credit.paymentsToday.monto) === 0;

      daysOverdue = this.creditCalculatorSvc.calculateDaysOverdue(
        paidUntilDate,
        credit.frecuencia_cobro,
        today,
        timeZone,
        includeToday,
      );
    }

    const clientState = this.creditCalculatorSvc.classifyClient(daysOverdue);

    credit.daysOverdue = daysOverdue > 0 ? daysOverdue : 0;
    credit.state = clientState;

    return credit;
  }

  private mapToCreditoEntity(credits: any[], timeZone: string): CreditoEntity[] {
    return credits.map(creditPlainObject => {
      const creditEntity = CreditoEntity.fromObject(creditPlainObject);
      return this.calculateOverdueAndState(creditEntity, timeZone);
    });
  }
}
