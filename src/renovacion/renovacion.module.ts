import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MovimientoCaja, MovimientoCajaSchema } from '../movimientoCaja/schemas/caja-movimiento.schemas';
import { Ruta, RutaSchema } from '../ruta/schema/ruta.schema';
import { Empresa, EmpresaSchema } from '../empresa/schemas/empresa.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { RenovacionController } from './renovacion.controller';
import { RenovacionService } from './renovacion.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MovimientoCaja.name, schema: MovimientoCajaSchema },
      { name: Ruta.name, schema: RutaSchema },
      { name: Empresa.name, schema: EmpresaSchema },
    ]),
  ],
  controllers: [RenovacionController],
  providers: [RenovacionService, DateFnsAdapter],
})
export class RenovacionModule { }
