import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { RutaService } from './ruta.service';
import { RutaController } from './ruta.controller';
import { Ruta, RutaSchema } from './schema/ruta.schema';
import { AuthModule } from 'src/auth/auth.module';
import { MessageModule } from 'src/message/message.module';
import { CajaModule } from '../caja/caja.module';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { OwnershipModule } from 'src/common/ownership';
import { CreditoModule } from '../credito/credito.module';
import { ClienteModule } from '../cliente/cliente.module';
import { MovimientoCajaModule } from '../movimientoCaja/movimiento-caja.module';
import { EmpresaModule } from '../empresa/empresa.module';

/**
 * V4b: solo registra Ruta. Caja/User/Empresa vía módulos dueños.
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => CajaModule),
    forwardRef(() => AuthModule),
    forwardRef(() => EmpresaModule),
    forwardRef(() => CreditoModule),
    forwardRef(() => ClienteModule),
    forwardRef(() => MovimientoCajaModule),
    forwardRef(() => OwnershipModule),
    MongooseModule.forFeature([
      {
        name: Ruta.name,
        schema: RutaSchema
      },
    ]),
    forwardRef(() => MessageModule),
  ],
  controllers: [RutaController],
  providers: [RutaService, DateFnsAdapter],
  exports: [RutaService, MongooseModule]
})
export class RutaModule { }
