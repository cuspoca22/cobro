import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Caja } from './schemas/caja.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';

/**
 * Lectura mínima de Caja para Auth (login).
 * Módulo separado de CajaModule para evitar ciclo Auth ↔ Caja ↔ Ownership ↔ Credito.
 */
@Injectable()
export class CajaDayCheckService {
  constructor(
    @InjectModel(Caja.name)
    private readonly cajaModel: Model<Caja>,
    private readonly dateFnsAdapter: DateFnsAdapter,
  ) {}

  async isUltimaCajaDeHoy(rutaId: string, timeZone: string): Promise<boolean> {
    const caja = await this.cajaModel
      .findOne({ ruta: rutaId })
      .sort({ fecha: -1 })
      .lean();

    if (!caja) return false;

    const startOfDayUtc = this.dateFnsAdapter.getStartOfTodayInTimeZone(timeZone);
    return this.dateFnsAdapter.isEqual(caja.fecha, startOfDayUtc);
  }
}
