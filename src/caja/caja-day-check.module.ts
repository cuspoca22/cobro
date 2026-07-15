import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Caja, CajaSchema } from './schemas/caja.schema';
import { CajaDayCheckService } from './caja-day-check.service';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';

/**
 * Módulo liviano solo para Auth.login (sin Auth/Ownership/Credito).
 * Rompe el ciclo UndefinedModuleException Auth ↔ CajaModule.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Caja.name, schema: CajaSchema }]),
  ],
  providers: [CajaDayCheckService, DateFnsAdapter],
  exports: [CajaDayCheckService],
})
export class CajaDayCheckModule {}
