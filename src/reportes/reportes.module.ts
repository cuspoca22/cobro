import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Empresa, EmpresaSchema } from '../empresa/schemas/empresa.schema';
import { Ruta, RutaSchema } from '../ruta/schema/ruta.schema';
import { Cliente, ClienteSchema } from '../cliente/schema/cliente.schema';
import { Credito, CreditoSchema } from '../credito/schemas/credito.schema';
import { Caja, CajaSchema } from '../caja/schemas/caja.schema';
import {
  MovimientoCaja,
  MovimientoCajaSchema,
} from '../movimientoCaja/schemas/caja-movimiento.schemas';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Empresa.name, schema: EmpresaSchema },
      { name: Ruta.name, schema: RutaSchema },
      { name: Cliente.name, schema: ClienteSchema },
      { name: Credito.name, schema: CreditoSchema },
      { name: Caja.name, schema: CajaSchema },
      { name: MovimientoCaja.name, schema: MovimientoCajaSchema },
    ]),
  ],
  controllers: [ReportesController],
  providers: [ReportesService, DateFnsAdapter],
})
export class ReportesModule {}
