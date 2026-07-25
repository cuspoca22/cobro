import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PipelineStage, Types } from 'mongoose';
import { SubTipo } from '../movimientoCaja/interfaces/sub-tipo.enum';
import { GetRenovacionesDto } from './dto/get-renovaciones.dto';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { EmpresaReport } from './interfaces';
import { MovimientoCajaService } from '../movimientoCaja/movimiento-caja.service';
import { EmpresaService } from '../empresa/empresa.service';

@Injectable()
export class RenovacionService {
  private readonly logger = new Logger(RenovacionService.name);

  constructor(
    private readonly movimientoCajaService: MovimientoCajaService,
    private readonly empresaService: EmpresaService,
    private readonly dateFnsAdapter: DateFnsAdapter,
  ) { }

  async getRenovacionesDiarias(
    dto: GetRenovacionesDto,
    empresaId: string,
    scopedRutaIds?: string[],
  ): Promise<EmpresaReport> {
    const { fecha, rutaId } = dto;
    const startOfDay = this.dateFnsAdapter.startOfDayUtc(new Date(fecha));
    const endOfDay = this.dateFnsAdapter.addDays(startOfDay, 1);

    const empresa = await this.empresaService.findByIdLean(empresaId, 'rutas name');
    if (!empresa) {
      throw new NotFoundException(`Empresa con ID ${empresaId} no encontrada`);
    }

    // Asegurarnos de que las rutas sean ObjectIds válidos
    let rutasEmpresa = (empresa.rutas || []).map(id => new Types.ObjectId(id as any));
    const empresaNombre = empresa.name;

    if (scopedRutaIds) {
      const allowed = new Set(scopedRutaIds.map(String));
      rutasEmpresa = rutasEmpresa.filter((id) => allowed.has(String(id)));
    }

    if (rutaId) {
      const rutaObjectId = new Types.ObjectId(rutaId);
      if (!rutasEmpresa.some(ruta => ruta.equals(rutaObjectId))) {
        throw new BadRequestException(`La ruta ${rutaId} no pertenece a la empresa ${empresaId}`);
      }
    }

    const matchStage: Record<string, any> = {
      // IMPORTANTE: Verifica que este valor coincida con la base de datos (ej. "prestamo_otorgado")
      subTipo: SubTipo.PRESTAMO,
      fecha: { $gte: startOfDay, $lt: endOfDay },
    };

    if (rutaId) {
      matchStage.ruta = new Types.ObjectId(rutaId);
    } else if (rutasEmpresa.length > 0) {
      matchStage.ruta = { $in: rutasEmpresa };
    } else {
      return {
        empresaId: new Types.ObjectId(empresaId),
        nombre: empresaNombre,
        rutas: [],
        totalEmpresa: 0,
        cantidadEmpresa: 0,
      };
    }

    const pipeline: PipelineStage[] = [
      { $match: matchStage },

      // Join con Ruta
      {
        $lookup: {
          from: 'rutas',
          localField: 'ruta',
          foreignField: '_id',
          as: 'rutaInfo',
        },
      },
      // Safely unwind rutas
      { $unwind: { path: '$rutaInfo', preserveNullAndEmptyArrays: true } },
      { $match: { rutaInfo: { $ne: null } } },

      // Join con Cliente
      {
        $lookup: {
          from: 'clientes',
          localField: 'cliente',
          foreignField: '_id',
          as: 'clienteInfo',
        },
      },
      // SOLUCIÓN: Si no hay cliente, no descartar el documento
      { $unwind: { path: '$clienteInfo', preserveNullAndEmptyArrays: true } },

      // OPTIMIZACIÓN: Inyectar la empresa directamente sin hacer otro $lookup
      {
        $addFields: {
          'empresaInfo._id': new Types.ObjectId(empresaId),
          'empresaInfo.name': empresaNombre
        }
      },

      // Agrupación por Empresa y Ruta
      {
        $group: {
          _id: {
            empresaId: '$empresaInfo._id',
            empresaNombre: '$empresaInfo.name',
            rutaId: '$rutaInfo._id',
            rutaNombre: '$rutaInfo.nombre',
          },
          renovaciones: {
            $push: {
              id: '$clienteInfo._id',
              // Manejo seguro por si el cliente no existe
              nombre: { $ifNull: ['$clienteInfo.nombre', 'Cliente no registrado'] },
              alias: { $ifNull: ['$clienteInfo.alias', ''] },
              monto: '$monto',
              fecha: '$fecha',
              creditoId: '$credito',
              movimientoId: '$_id',
              rutaId: '$rutaInfo._id',
            },
          },
          totalMonto: { $sum: '$monto' },
          cantidad: { $sum: 1 },
        },
      },

      // Agrupación final por Empresa
      {
        $group: {
          _id: {
            empresaId: '$_id.empresaId',
            empresaNombre: '$_id.empresaNombre',
          },
          rutas: {
            $push: {
              rutaId: '$_id.rutaId',
              nombre: '$_id.rutaNombre',
              renovaciones: '$renovaciones',
              totalMonto: '$totalMonto',
              cantidad: '$cantidad',
            },
          },
          totalEmpresa: { $sum: '$totalMonto' },
          cantidadEmpresa: { $sum: '$cantidad' },
        },
      },

      // Proyección Final
      {
        $project: {
          _id: 0,
          empresaId: '$_id.empresaId',
          nombre: '$_id.empresaNombre',
          rutas: 1,
          totalEmpresa: 1,
          cantidadEmpresa: 1,
        },
      },
      { $sort: { nombre: 1 } },
    ];

    try {
      const results = await this.movimientoCajaService.aggregatePipeline<EmpresaReport>(pipeline);
      return results[0] || {
        empresaId: new Types.ObjectId(empresaId),
        nombre: empresaNombre,
        rutas: [],
        totalEmpresa: 0,
        cantidadEmpresa: 0,
      };
    } catch (error) {
      this.logger.error(`Error generating renewals report: ${error.message}`);
      throw error;
    }
  }
}