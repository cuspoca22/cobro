import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { MovimientoCajaService } from "./movimiento-caja.service";
import { MovimientoCajaController } from "./movimiento-caja.controller";
import { ConfigModule } from "@nestjs/config";
import { MovimientoCaja, MovimientoCajaSchema } from "./schemas/caja-movimiento.schemas";
import { Caja, CajaSchema } from '../caja/schemas/caja.schema';
import { Ruta, RutaSchema } from '../ruta/schema/ruta.schema';
import { CreditoModule } from '../credito/credito.module';
import { dateFnsAdapter } from '../common/wrappers/date-fns.adapter';

@Module({
  imports: [
    ConfigModule,
    CreditoModule,
    MongooseModule.forFeature([
      {
        name: MovimientoCaja.name,
        schema: MovimientoCajaSchema
      },
      {
        name: Caja.name,
        schema: CajaSchema
      },
      {
        name: Ruta.name,
        schema: RutaSchema,
      }
    ]),
  ],
  controllers: [MovimientoCajaController],  
  providers: [MovimientoCajaService, dateFnsAdapter],
  exports: [MovimientoCajaService],
})
export class MovimientoCajaModule {}