import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { differenceInDays } from 'date-fns';

import { Empresa } from '../../empresa/schemas/empresa.schema';
import { Ruta } from '../../ruta/schema/ruta.schema';

export interface RutaContext {
  rutaId: Types.ObjectId;
  nombre: string;
  timeZone: string;
  currency: string;
}

export interface EmpresaContext {
  empresaId: Types.ObjectId;
  nombre: string;
  rutas: RutaContext[];
}

const MAX_RANGO_DIAS = 365;

export function validarRangoFechas(fechaInicio: string, fechaFin: string): void {
  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const fin = new Date(`${fechaFin}T00:00:00`);

  if (inicio > fin) {
    throw new BadRequestException('fechaInicio debe ser anterior o igual a fechaFin');
  }

  if (differenceInDays(fin, inicio) > MAX_RANGO_DIAS) {
    throw new BadRequestException(`El rango máximo permitido es ${MAX_RANGO_DIAS} días`);
  }
}

export async function resolveEmpresaContext(
  empresaModel: Model<Empresa>,
  rutaModel: Model<Ruta>,
  empresaId: string,
  rutaId?: string,
): Promise<EmpresaContext> {
  const empresa = await empresaModel.findById(empresaId).select('rutas name').lean();
  if (!empresa) {
    throw new NotFoundException(`Empresa con ID ${empresaId} no encontrada`);
  }

  const rutasEmpresaIds = (empresa.rutas || []).map(
    (id) => new Types.ObjectId(id as Types.ObjectId),
  );

  if (rutaId) {
    const rutaObjectId = new Types.ObjectId(rutaId);
    if (!rutasEmpresaIds.some((r) => r.equals(rutaObjectId))) {
      throw new BadRequestException(
        `La ruta ${rutaId} no pertenece a la empresa ${empresaId}`,
      );
    }
  }

  const filtroRutas = rutaId
    ? [new Types.ObjectId(rutaId)]
    : rutasEmpresaIds;

  if (filtroRutas.length === 0) {
    return {
      empresaId: new Types.ObjectId(empresaId),
      nombre: empresa.name,
      rutas: [],
    };
  }

  const rutas = await rutaModel
    .find({ _id: { $in: filtroRutas } })
    .select('nombre timeZone currency')
    .lean();

  return {
    empresaId: new Types.ObjectId(empresaId),
    nombre: empresa.name,
    rutas: rutas.map((r) => ({
      rutaId: r._id as Types.ObjectId,
      nombre: r.nombre,
      timeZone: r.timeZone || 'UTC',
      currency: r.currency,
    })),
  };
}
