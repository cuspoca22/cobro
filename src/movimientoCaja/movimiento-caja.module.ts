import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { MovimientoCajaService } from "./movimiento-caja.service";
import { MovimientoCajaController } from "./movimiento-caja.controller";
import { ConfigModule } from "@nestjs/config";
import { MovimientoCaja, MovimientoCajaSchema } from "./schemas/caja-movimiento.schemas";
import { Caja, CajaSchema } from '../caja/schemas/caja.schema';
import { Ruta, RutaSchema } from '../ruta/schema/ruta.schema';
import { CreditoModule } from '../credito/credito.module';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { RutaAbiertaInterceptor } from "src/common/interceptors";
import { RutaModule } from "src/ruta/ruta.module";

@Module({
  imports: [
    forwardRef(() => RutaModule),
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
  providers: [MovimientoCajaService, DateFnsAdapter, RutaAbiertaInterceptor],
  exports: [MovimientoCajaService],
})
export class MovimientoCajaModule { }