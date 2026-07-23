import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createObjectCsvStringifier } from 'csv-writer';
import Decimal from 'decimal.js';
import { PipelineStage, Types } from 'mongoose';
import * as nodemailer from 'nodemailer';

import { SubTipo } from '../movimientoCaja/interfaces/sub-tipo.enum';
import { TipoMovimiento } from '../movimientoCaja/interfaces/tipo-movimiento.enum';
import { ClasificacionCliente } from '../credito/interfaces/clasificacion-cliente.enum';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { MovimientoCajaService } from '../movimientoCaja/movimiento-caja.service';
import { EmpresaService } from '../empresa/empresa.service';
import { RutaService } from '../ruta/ruta.service';
import { ClienteService } from '../cliente/cliente.service';
import { CreditoService } from '../credito/credito.service';
import { CajaService } from '../caja/caja.service';
import { ReporteCarteraQueryDto, ReporteRangoQueryDto } from './dto';
import { buildRutaFechaOrConditions } from './helpers/calcular-rango-fechas.helper';
import {
  EmpresaContext,
  resolveEmpresaContext,
  validarRangoFechas,
} from './helpers/reporte-empresa.context';
import {
  DistribucionEstadoDto,
  GrupoGastosDto,
  GrupoMovimientoDto,
  MovimientoDetalleDto,
  ReporteCajaHistoricoResponseDto,
  ReporteCarteraResponseDto,
  ReporteFinancieroResponseDto,
  ReporteOficinaResponseDto,
  SerieDiariaCajaDto,
  SerieDiariaFinancieroDto,
} from './responses';

interface MovimientoRaw {
  _id: Types.ObjectId;
  ruta: Types.ObjectId;
  subTipo: string;
  monto: number;
  concepto?: string;
  comentario?: string;
  categoriaGasto?: string;
  fecha: Date;
  interesCobrado?: number;
  fechaDia?: string;
}

interface BackupCreditoRow {
  ruta?: string;
  cliente?: string;
  alias?: string;
  dpi?: string;
  telefono?: string;
  valor_credito?: number;
  total_pagar?: number;
  valor_cuota?: number;
  status?: boolean;
  fecha_inicio?: Date;
  dueDate?: Date;
  state?: string;
  frecuencia_cobro?: string;
  mora_adeudada?: number;
  mora_cobrada?: number;
}

@Injectable()
export class ReportesService {
  private readonly logger = new Logger(ReportesService.name);

  constructor(
    private readonly empresaService: EmpresaService,
    private readonly rutaService: RutaService,
    private readonly clienteService: ClienteService,
    private readonly creditoService: CreditoService,
    private readonly cajaService: CajaService,
    private readonly movimientoCajaService: MovimientoCajaService,
    private readonly dateFnsAdapter: DateFnsAdapter,
    private readonly configService: ConfigService,
  ) {}

  private resolveContext(empresaId: string, rutaId?: string) {
    return resolveEmpresaContext(
      (id) => this.empresaService.findByIdLean(id, 'rutas name'),
      (ids) =>
        this.rutaService.findLean(
          { _id: { $in: ids } },
          { select: 'nombre timeZone currency' },
        ),
      empresaId,
      rutaId,
    );
  }

  async getReporteOficina(
    dto: ReporteRangoQueryDto,
    empresaId: string,
  ): Promise<ReporteOficinaResponseDto> {
    const { fechaInicio, fechaFin, rutaId } = dto;
    validarRangoFechas(fechaInicio, fechaFin);

    const contexto = await this.resolveContext(empresaId, rutaId);

    if (contexto.rutas.length === 0) {
      return this.respuestaOficinaVacia(contexto, fechaInicio, fechaFin);
    }

    const orConditions = buildRutaFechaOrConditions(
      contexto.rutas,
      fechaInicio,
      fechaFin,
      this.dateFnsAdapter,
    );

    const movimientos = await this.movimientoCajaService.findLean(
      {
        $or: orConditions,
        subTipo: { $in: [SubTipo.GASTO, SubTipo.RETIRO, SubTipo.INVERSION] },
      },
      {
        select: '_id ruta subTipo monto concepto comentario categoriaGasto fecha',
        sort: { fecha: -1 },
      },
    );

    const rutasReporte = contexto.rutas.map((ruta) => {
      const movsRuta = movimientos.filter(
        (m) => m.ruta.toString() === ruta.rutaId.toString(),
      );
      return {
        rutaId: ruta.rutaId.toString(),
        nombre: ruta.nombre,
        timeZone: ruta.timeZone,
        currency: ruta.currency,
        gastos: this.agruparGastos(movsRuta.filter((m) => m.subTipo === SubTipo.GASTO)),
        retiros: this.agruparMovimientos(movsRuta.filter((m) => m.subTipo === SubTipo.RETIRO)),
        inversiones: this.agruparMovimientos(
          movsRuta.filter((m) => m.subTipo === SubTipo.INVERSION),
        ),
      };
    });

    const gastosPorCategoria: Record<string, number> = {};
    let totalGastos = new Decimal(0);
    let totalRetiros = new Decimal(0);
    let totalInversiones = new Decimal(0);

    for (const ruta of rutasReporte) {
      totalGastos = totalGastos.plus(ruta.gastos.total);
      totalRetiros = totalRetiros.plus(ruta.retiros.total);
      totalInversiones = totalInversiones.plus(ruta.inversiones.total);

      for (const [cat, monto] of Object.entries(ruta.gastos.porCategoria)) {
        gastosPorCategoria[cat] = (gastosPorCategoria[cat] ?? 0) + monto;
      }
    }

    return {
      empresaId: contexto.empresaId.toString(),
      nombre: contexto.nombre,
      periodo: { fechaInicio, fechaFin },
      totalesEmpresa: {
        gastos: totalGastos.toNumber(),
        retiros: totalRetiros.toNumber(),
        inversiones: totalInversiones.toNumber(),
        netoCapital: totalInversiones.minus(totalRetiros).toNumber(),
      },
      gastosPorCategoria,
      rutas: rutasReporte,
    };
  }

  async getReporteFinanciero(
    dto: ReporteRangoQueryDto,
    empresaId: string,
  ): Promise<ReporteFinancieroResponseDto> {
    const { fechaInicio, fechaFin, rutaId } = dto;
    validarRangoFechas(fechaInicio, fechaFin);

    const contexto = await this.resolveContext(empresaId, rutaId);

    if (contexto.rutas.length === 0) {
      return this.respuestaFinancieroVacia(contexto, fechaInicio, fechaFin);
    }

    const movimientos = await this.obtenerMovimientosFinancieros(
      contexto,
      fechaInicio,
      fechaFin,
    );

    const crearTotalesRuta = () => ({
      cobros: 0,
      prestamosOtorgados: 0,
      interesCobrado: 0,
      gastos: 0,
      retiros: 0,
      inversiones: 0,
    });

    const totalesPorRuta = new Map<string, ReturnType<typeof crearTotalesRuta>>();
    const totalesPorDia = new Map<
      string,
      { cobros: number; prestamosOtorgados: number; interesCobrado: number; gastos: number }
    >();
    const totalesEmpresa = crearTotalesRuta();

    for (const ruta of contexto.rutas) {
      totalesPorRuta.set(ruta.rutaId.toString(), crearTotalesRuta());
    }

    for (const mov of movimientos) {
      const rutaKey = mov.ruta.toString();
      const rutaTotales = totalesPorRuta.get(rutaKey);
      if (!rutaTotales) continue;

      const monto = mov.monto;
      const interes = mov.interesCobrado ?? 0;
      const dia = mov.fechaDia ?? '';

      if (!totalesPorDia.has(dia)) {
        totalesPorDia.set(dia, {
          cobros: 0,
          prestamosOtorgados: 0,
          interesCobrado: 0,
          gastos: 0,
        });
      }
      const diaTotales = totalesPorDia.get(dia)!;

      switch (mov.subTipo) {
        case SubTipo.PAGOCREDITO:
          rutaTotales.cobros += monto;
          rutaTotales.interesCobrado += interes;
          totalesEmpresa.cobros += monto;
          totalesEmpresa.interesCobrado += interes;
          diaTotales.cobros += monto;
          diaTotales.interesCobrado += interes;
          break;
        case SubTipo.PRESTAMO:
          rutaTotales.prestamosOtorgados += monto;
          totalesEmpresa.prestamosOtorgados += monto;
          diaTotales.prestamosOtorgados += monto;
          break;
        case SubTipo.GASTO:
          rutaTotales.gastos += monto;
          totalesEmpresa.gastos += monto;
          diaTotales.gastos += monto;
          break;
        case SubTipo.RETIRO:
          rutaTotales.retiros += monto;
          totalesEmpresa.retiros += monto;
          break;
        case SubTipo.INVERSION:
          rutaTotales.inversiones += monto;
          totalesEmpresa.inversiones += monto;
          break;
      }
    }

    const seriesDiarias: SerieDiariaFinancieroDto[] = Array.from(totalesPorDia.entries())
      .filter(([fecha]) => fecha !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, t]) => ({
        fecha,
        cobros: t.cobros,
        prestamosOtorgados: t.prestamosOtorgados,
        interesCobrado: t.interesCobrado,
        gastos: t.gastos,
      }));

    const rutas = contexto.rutas.map((ruta) => {
      const t = totalesPorRuta.get(ruta.rutaId.toString())!;
      return {
        rutaId: ruta.rutaId.toString(),
        nombre: ruta.nombre,
        cobros: t.cobros,
        prestamosOtorgados: t.prestamosOtorgados,
        interesCobrado: t.interesCobrado,
        gastos: t.gastos,
        retiros: t.retiros,
        inversiones: t.inversiones,
      };
    });

    return {
      empresaId: contexto.empresaId.toString(),
      nombre: contexto.nombre,
      periodo: { fechaInicio, fechaFin },
      totalesEmpresa,
      seriesDiarias,
      rutas,
    };
  }

  async getReporteCartera(
    dto: ReporteCarteraQueryDto,
    empresaId: string,
  ): Promise<ReporteCarteraResponseDto> {
    const contexto = await this.resolveContext(empresaId, dto.rutaId);

    if (contexto.rutas.length === 0) {
      return this.respuestaCarteraVacia(contexto);
    }

    const rutaIds = contexto.rutas.map((r) => r.rutaId);

    const [metricasCreditos, conteosClientes] = await Promise.all([
      this.creditoService.aggregatePipeline<{
        _id: Types.ObjectId;
        cartera: number;
        capitalPrestado: number;
        gananciaPotencial: number;
        distribucionEstado: DistribucionEstadoDto;
        clientesMorosos: number;
      }>(this.pipelineCartera(rutaIds)),
      this.clienteService.aggregatePipeline<{
        _id: Types.ObjectId;
        totalClientes: number;
        clientesActivos: number;
      }>([
        { $match: { ruta: { $in: rutaIds } } },
        {
          $group: {
            _id: '$ruta',
            totalClientes: { $sum: 1 },
            clientesActivos: {
              $sum: { $cond: [{ $eq: ['$status', true] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const clientesMap = new Map(
      conteosClientes.map((c) => [c._id.toString(), c]),
    );

    const rutas = contexto.rutas.map((ruta) => {
      const key = ruta.rutaId.toString();
      const metrica = metricasCreditos.find((m) => m._id.toString() === key);
      const clientes = clientesMap.get(key);

      const distribucionEstado = metrica?.distribucionEstado ?? {
        BUENO: 0,
        REGULAR: 0,
        MALO: 0,
      };
      const clientesActivos = clientes?.clientesActivos ?? 0;
      const clientesMorosos = metrica?.clientesMorosos ?? 0;

      return {
        rutaId: key,
        nombre: ruta.nombre,
        cartera: metrica?.cartera ?? 0,
        capitalPrestado: metrica?.capitalPrestado ?? 0,
        gananciaPotencial: metrica?.gananciaPotencial ?? 0,
        totalClientes: clientes?.totalClientes ?? 0,
        clientesActivos,
        clientesMorosos,
        distribucionEstado,
      };
    });

    const totales = rutas.reduce(
      (acc, r) => {
        acc.cartera += r.cartera;
        acc.capitalPrestado += r.capitalPrestado;
        acc.gananciaPotencial += r.gananciaPotencial;
        acc.totalClientes += r.totalClientes;
        acc.clientesActivos += r.clientesActivos;
        acc.clientesMorosos += r.clientesMorosos;
        acc.distribucionEstado.BUENO += r.distribucionEstado.BUENO;
        acc.distribucionEstado.REGULAR += r.distribucionEstado.REGULAR;
        acc.distribucionEstado.MALO += r.distribucionEstado.MALO;
        return acc;
      },
      {
        cartera: 0,
        capitalPrestado: 0,
        gananciaPotencial: 0,
        totalClientes: 0,
        clientesActivos: 0,
        clientesMorosos: 0,
        distribucionEstado: { BUENO: 0, REGULAR: 0, MALO: 0 },
      },
    );

    const porcentajeMorosidad =
      totales.clientesActivos > 0
        ? Number(
            ((totales.clientesMorosos / totales.clientesActivos) * 100).toFixed(2),
          )
        : 0;

    return {
      empresaId: contexto.empresaId.toString(),
      nombre: contexto.nombre,
      totalesEmpresa: { ...totales, porcentajeMorosidad },
      rutas,
    };
  }

  async getReporteCajaHistorico(
    dto: ReporteRangoQueryDto,
    empresaId: string,
  ): Promise<ReporteCajaHistoricoResponseDto> {
    const { fechaInicio, fechaFin, rutaId } = dto;
    validarRangoFechas(fechaInicio, fechaFin);

    const contexto = await this.resolveContext(empresaId, rutaId);

    if (contexto.rutas.length === 0) {
      return this.respuestaCajaHistoricoVacia(contexto, fechaInicio, fechaFin);
    }

    const orConditions = buildRutaFechaOrConditions(
      contexto.rutas,
      fechaInicio,
      fechaFin,
      this.dateFnsAdapter,
    );

    const cajas = await this.cajaService.findLean(
      { $or: orConditions },
      {
        select: 'ruta fecha cobro prestamo gasto retiro inversion caja_final pretendido',
        sort: { fecha: 1 },
      },
    );

    const rutasSeries = contexto.rutas.map((ruta) => {
      const cajasRuta = cajas.filter(
        (c) => c.ruta.toString() === ruta.rutaId.toString(),
      );

      const seriesDiarias: SerieDiariaCajaDto[] = cajasRuta.map((caja) => {
        const fechaStr = this.formatearFechaCaja(caja.fecha, ruta.timeZone);
        const pretendido = caja.pretendido ?? 0;
        const cobro = caja.cobro ?? 0;

        return {
          fecha: fechaStr,
          cobro,
          prestamo: caja.prestamo ?? 0,
          gasto: caja.gasto ?? 0,
          cajaFinal: caja.caja_final ?? 0,
          pretendido,
          eficienciaCobro:
            pretendido > 0
              ? Number(((cobro / pretendido) * 100).toFixed(2))
              : null,
        };
      });

      return {
        rutaId: ruta.rutaId.toString(),
        nombre: ruta.nombre,
        seriesDiarias,
      };
    });

    const seriesEmpresaMap = new Map<string, SerieDiariaCajaDto>();

    for (const rutaReporte of rutasSeries) {
      for (const dia of rutaReporte.seriesDiarias) {
        const existente = seriesEmpresaMap.get(dia.fecha);
        if (!existente) {
          seriesEmpresaMap.set(dia.fecha, { ...dia });
        } else {
          existente.cobro += dia.cobro;
          existente.prestamo += dia.prestamo;
          existente.gasto += dia.gasto;
          existente.cajaFinal += dia.cajaFinal;
          existente.pretendido += dia.pretendido;
          const totalPretendido = existente.pretendido;
          existente.eficienciaCobro =
            totalPretendido > 0
              ? Number(((existente.cobro / totalPretendido) * 100).toFixed(2))
              : null;
        }
      }
    }

    const seriesDiarias = Array.from(seriesEmpresaMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);

    let totalCobro = 0;
    let totalPrestamo = 0;
    let totalGasto = 0;
    let totalRetiro = 0;
    let totalInversion = 0;
    const eficiencias: number[] = [];

    for (const caja of cajas) {
      totalCobro += caja.cobro ?? 0;
      totalPrestamo += caja.prestamo ?? 0;
      totalGasto += caja.gasto ?? 0;
      totalRetiro += caja.retiro ?? 0;
      totalInversion += caja.inversion ?? 0;

      const pretendido = caja.pretendido ?? 0;
      if (pretendido > 0) {
        eficiencias.push(((caja.cobro ?? 0) / pretendido) * 100);
      }
    }

    const promedioEficienciaCobro =
      eficiencias.length > 0
        ? Number(
            (eficiencias.reduce((a, b) => a + b, 0) / eficiencias.length).toFixed(2),
          )
        : 0;

    return {
      empresaId: contexto.empresaId.toString(),
      nombre: contexto.nombre,
      periodo: { fechaInicio, fechaFin },
      totalesEmpresa: {
        cobro: totalCobro,
        prestamo: totalPrestamo,
        gasto: totalGasto,
        retiro: totalRetiro,
        inversion: totalInversion,
        promedioEficienciaCobro: promedioEficienciaCobro,
      },
      seriesDiarias,
      rutas: rutasSeries,
    };
  }

  private async obtenerMovimientosFinancieros(
    contexto: EmpresaContext,
    fechaInicio: string,
    fechaFin: string,
  ): Promise<MovimientoRaw[]> {
    const orConditions = buildRutaFechaOrConditions(
      contexto.rutas,
      fechaInicio,
      fechaFin,
      this.dateFnsAdapter,
    );

    const timeZoneCases = contexto.rutas.map((r) => ({
      case: { $eq: ['$ruta', r.rutaId] },
      then: r.timeZone,
    }));

    const pipeline: PipelineStage[] = [
      {
        $match: {
          $or: orConditions,
          subTipo: {
            $in: [
              SubTipo.PAGOCREDITO,
              SubTipo.PRESTAMO,
              SubTipo.GASTO,
              SubTipo.RETIRO,
              SubTipo.INVERSION,
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'creditos',
          localField: 'credito',
          foreignField: '_id',
          as: 'creditoInfo',
        },
      },
      {
        $unwind: { path: '$creditoInfo', preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: {
          timeZoneRuta: {
            $switch: {
              branches: timeZoneCases,
              default: 'UTC',
            },
          },
        },
      },
      {
        $addFields: {
          fechaDia: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$fecha',
              timezone: '$timeZoneRuta',
            },
          },
          interesCobrado: {
            $cond: [
              {
                $and: [
                  { $eq: ['$subTipo', SubTipo.PAGOCREDITO] },
                  { $gt: [{ $ifNull: ['$creditoInfo.total_pagar', 0] }, 0] },
                ],
              },
              {
                $multiply: [
                  '$monto',
                  {
                    $divide: [
                      {
                        $subtract: [
                          '$creditoInfo.total_pagar',
                          '$creditoInfo.valor_credito',
                        ],
                      },
                      '$creditoInfo.total_pagar',
                    ],
                  },
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $project: {
          ruta: 1,
          subTipo: 1,
          monto: 1,
          fecha: 1,
          interesCobrado: 1,
          fechaDia: 1,
        },
      },
    ];

    return this.movimientoCajaService.aggregatePipeline<MovimientoRaw>(pipeline);
  }

  private pipelineCartera(rutaIds: Types.ObjectId[]): PipelineStage[] {
    return [
      { $match: { ruta: { $in: rutaIds }, status: true } },
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
          abonos: { $sum: '$allPayments.monto' },
          saldo: { $subtract: ['$total_pagar', { $sum: '$allPayments.monto' }] },
          ganancia_credito: { $subtract: ['$total_pagar', '$valor_credito'] },
          esMoroso: {
            $in: [
              '$state',
              [ClasificacionCliente.REGULAR, ClasificacionCliente.MALO],
            ],
          },
        },
      },
      {
        $group: {
          _id: '$ruta',
          cartera: { $sum: '$saldo' },
          capitalPrestado: { $sum: '$valor_credito' },
          gananciaPotencial: { $sum: '$ganancia_credito' },
          BUENO: {
            $sum: { $cond: [{ $eq: ['$state', ClasificacionCliente.BUENO] }, 1, 0] },
          },
          REGULAR: {
            $sum: {
              $cond: [{ $eq: ['$state', ClasificacionCliente.REGULAR] }, 1, 0],
            },
          },
          MALO: {
            $sum: { $cond: [{ $eq: ['$state', ClasificacionCliente.MALO] }, 1, 0] },
          },
          clientesMorosos: {
            $sum: { $cond: ['$esMoroso', 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 1,
          cartera: 1,
          capitalPrestado: 1,
          gananciaPotencial: 1,
          clientesMorosos: 1,
          distribucionEstado: {
            BUENO: '$BUENO',
            REGULAR: '$REGULAR',
            MALO: '$MALO',
          },
        },
      },
    ];
  }

  private agruparMovimientos(
    movimientos: {
      _id: Types.ObjectId;
      monto: number;
      concepto?: string;
      comentario?: string;
      categoriaGasto?: string;
      fecha: Date;
    }[],
  ): GrupoMovimientoDto {
    const total = movimientos.reduce(
      (sum, m) => sum.plus(m.monto),
      new Decimal(0),
    );

    return {
      total: total.toNumber(),
      movimientos: movimientos.map((m) => this.mapMovimiento(m)),
    };
  }

  private agruparGastos(
    movimientos: {
      _id: Types.ObjectId;
      monto: number;
      concepto?: string;
      comentario?: string;
      categoriaGasto?: string;
      fecha: Date;
    }[],
  ): GrupoGastosDto {
    const base = this.agruparMovimientos(movimientos);
    const porCategoria: Record<string, number> = {};

    for (const mov of movimientos) {
      const cat = mov.categoriaGasto || 'sin_categoria';
      porCategoria[cat] = (porCategoria[cat] ?? 0) + mov.monto;
    }

    return { ...base, porCategoria };
  }

  private mapMovimiento(mov: {
    _id: Types.ObjectId;
    monto: number;
    concepto?: string;
    comentario?: string;
    categoriaGasto?: string;
    fecha: Date;
  }): MovimientoDetalleDto {
    return {
      id: mov._id.toString(),
      monto: mov.monto,
      concepto: mov.concepto ?? '',
      comentario: mov.comentario ?? '',
      categoriaGasto: mov.categoriaGasto,
      fecha: mov.fecha,
    };
  }

  private formatearFechaCaja(fecha: Date, timeZone: string): string {
    const zoned = this.dateFnsAdapter.convertUtcToZonedTime(fecha, timeZone);
    const year = zoned.getFullYear();
    const month = String(zoned.getMonth() + 1).padStart(2, '0');
    const day = String(zoned.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private respuestaOficinaVacia(
    contexto: EmpresaContext,
    fechaInicio: string,
    fechaFin: string,
  ): ReporteOficinaResponseDto {
    return {
      empresaId: contexto.empresaId.toString(),
      nombre: contexto.nombre,
      periodo: { fechaInicio, fechaFin },
      totalesEmpresa: { gastos: 0, retiros: 0, inversiones: 0, netoCapital: 0 },
      gastosPorCategoria: {},
      rutas: [],
    };
  }

  private respuestaFinancieroVacia(
    contexto: EmpresaContext,
    fechaInicio: string,
    fechaFin: string,
  ): ReporteFinancieroResponseDto {
    return {
      empresaId: contexto.empresaId.toString(),
      nombre: contexto.nombre,
      periodo: { fechaInicio, fechaFin },
      totalesEmpresa: {
        cobros: 0,
        prestamosOtorgados: 0,
        interesCobrado: 0,
        gastos: 0,
        retiros: 0,
        inversiones: 0,
      },
      seriesDiarias: [],
      rutas: [],
    };
  }

  private respuestaCarteraVacia(contexto: EmpresaContext): ReporteCarteraResponseDto {
    return {
      empresaId: contexto.empresaId.toString(),
      nombre: contexto.nombre,
      totalesEmpresa: {
        cartera: 0,
        capitalPrestado: 0,
        gananciaPotencial: 0,
        totalClientes: 0,
        clientesActivos: 0,
        clientesMorosos: 0,
        porcentajeMorosidad: 0,
        distribucionEstado: { BUENO: 0, REGULAR: 0, MALO: 0 },
      },
      rutas: [],
    };
  }

  private respuestaCajaHistoricoVacia(
    contexto: EmpresaContext,
    fechaInicio: string,
    fechaFin: string,
  ): ReporteCajaHistoricoResponseDto {
    return {
      empresaId: contexto.empresaId.toString(),
      nombre: contexto.nombre,
      periodo: { fechaInicio, fechaFin },
      totalesEmpresa: {
        cobro: 0,
        prestamo: 0,
        gasto: 0,
        retiro: 0,
        inversion: 0,
        promedioEficienciaCobro: 0,
      },
      seriesDiarias: [],
      rutas: [],
    };
  }

  /**
   * CSV de backup: un registro por crédito de las rutas de la empresa.
   * Columnas documentadas en el endpoint GET /reports/backup.
   */
  async buildEmpresaBackupCsv(empresaId: string): Promise<Buffer> {
    const contexto = await this.resolveContext(empresaId);
    const rutaIds = contexto.rutas.map((r) => r.rutaId);

    const rows: BackupCreditoRow[] =
      rutaIds.length === 0
        ? []
        : await this.creditoService.aggregatePipeline<BackupCreditoRow>([
            { $match: { ruta: { $in: rutaIds } } },
            {
              $lookup: {
                from: 'clientes',
                localField: 'cliente',
                foreignField: '_id',
                as: 'clienteDoc',
              },
            },
            {
              $unwind: {
                path: '$clienteDoc',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: 'rutas',
                localField: 'ruta',
                foreignField: '_id',
                as: 'rutaDoc',
              },
            },
            {
              $unwind: {
                path: '$rutaDoc',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: 0,
                ruta: '$rutaDoc.nombre',
                cliente: '$clienteDoc.nombre',
                alias: '$clienteDoc.alias',
                dpi: '$clienteDoc.dpi',
                telefono: '$clienteDoc.telefono',
                valor_credito: 1,
                total_pagar: 1,
                valor_cuota: 1,
                status: 1,
                fecha_inicio: 1,
                dueDate: 1,
                state: 1,
                frecuencia_cobro: 1,
                mora_adeudada: 1,
                mora_cobrada: 1,
              },
            },
            { $sort: { ruta: 1, cliente: 1 } },
          ]);

    const stringifier = createObjectCsvStringifier({
      header: [
        { id: 'ruta', title: 'ruta' },
        { id: 'cliente', title: 'cliente' },
        { id: 'alias', title: 'alias' },
        { id: 'dpi', title: 'dpi' },
        { id: 'telefono', title: 'telefono' },
        { id: 'valor_credito', title: 'valor_credito' },
        { id: 'total_pagar', title: 'total_pagar' },
        { id: 'valor_cuota', title: 'valor_cuota' },
        { id: 'status', title: 'status' },
        { id: 'fecha_inicio', title: 'fecha_inicio' },
        { id: 'dueDate', title: 'dueDate' },
        { id: 'state', title: 'state' },
        { id: 'frecuencia_cobro', title: 'frecuencia_cobro' },
        { id: 'mora_adeudada', title: 'mora_adeudada' },
        { id: 'mora_cobrada', title: 'mora_cobrada' },
      ],
    });

    const records = rows.map((row) => ({
      ruta: row.ruta ?? '',
      cliente: row.cliente ?? '',
      alias: row.alias ?? '',
      dpi: row.dpi ?? '',
      telefono: row.telefono ?? '',
      valor_credito: row.valor_credito ?? 0,
      total_pagar: row.total_pagar ?? 0,
      valor_cuota: row.valor_cuota ?? 0,
      status: row.status ? 'activo' : 'saldado',
      fecha_inicio: row.fecha_inicio
        ? new Date(row.fecha_inicio).toISOString()
        : '',
      dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : '',
      state: row.state ?? '',
      frecuencia_cobro: row.frecuencia_cobro ?? '',
      mora_adeudada: row.mora_adeudada ?? 0,
      mora_cobrada: row.mora_cobrada ?? 0,
    }));

    const csv =
      stringifier.getHeaderString() + stringifier.stringifyRecords(records);
    return Buffer.from(csv, 'utf-8');
  }

  async sendEmpresaBackupEmail(
    empresaId: string,
    to?: string,
  ): Promise<boolean> {
    const empresa = await this.empresaService.findByIdLean(
      empresaId,
      'name email',
    );
    if (!empresa) {
      throw new BadRequestException('Empresa no encontrada');
    }

    const destinatario = (to || (empresa as { email?: string }).email || '')
      .toString()
      .trim();
    if (!destinatario || !destinatario.includes('@')) {
      throw new BadRequestException(
        'Email destino inválido. Actualiza el correo de la empresa o pasa ?to=',
      );
    }

    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      user ||
      'noreply@nathyapp.local';

    if (!host || !user || !pass) {
      throw new BadRequestException(
        'SMTP no configurado. Define SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS.',
      );
    }

    const buffer = await this.buildEmpresaBackupCsv(empresaId);
    const safeName = ((empresa as { name?: string }).name || 'empresa')
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 40);
    const filename = `${safeName}_backup.csv`;

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from,
        to: destinatario,
        subject: `Copia de seguridad — ${(empresa as { name?: string }).name || empresaId}`,
        text:
          'Adjunto encontrarás la copia de seguridad en CSV de créditos y clientes de la empresa.',
        attachments: [
          {
            filename,
            content: buffer,
            contentType: 'text/csv',
          },
        ],
      });

      return true;
    } catch (error) {
      this.logger.error('Error enviando backup por email', error as Error);
      throw new BadRequestException(
        'No se pudo enviar el correo de copia de seguridad. Revisa la configuración SMTP.',
      );
    }
  }
}
