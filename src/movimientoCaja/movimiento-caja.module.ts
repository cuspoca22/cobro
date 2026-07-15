import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { MovimientoCajaService } from "./movimiento-caja.service";
import { MovimientoCajaController } from "./movimiento-caja.controller";
import { ConfigModule } from "@nestjs/config";
import { MovimientoCaja, MovimientoCajaSchema } from "./schemas/caja-movimiento.schemas";
import { CreditoModule } from '../credito/credito.module';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { RutaAbiertaInterceptor } from "src/common/interceptors";
import { RutaModule } from "src/ruta/ruta.module";
import { OwnershipModule } from "src/common/ownership";
import { CajaModule } from "src/caja/caja.module";

/**
 * V4b: solo registra MovimientoCaja. Caja/Ruta vía módulos dueños.
 */
@Module({
  imports: [
    forwardRef(() => RutaModule),
    forwardRef(() => CajaModule),
    ConfigModule,
    forwardRef(() => CreditoModule),
    forwardRef(() => OwnershipModule),
    MongooseModule.forFeature([
      {
        name: MovimientoCaja.name,
        schema: MovimientoCajaSchema
      },
    ]),
  ],
  controllers: [MovimientoCajaController],
  providers: [MovimientoCajaService, DateFnsAdapter, RutaAbiertaInterceptor],
  exports: [MovimientoCajaService],
})
export class MovimientoCajaModule { }
