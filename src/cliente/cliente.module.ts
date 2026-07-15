import { forwardRef, Module } from '@nestjs/common';
import { ClienteService } from './cliente.service';
import { ClienteController } from './cliente.controller';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Cliente, ClienteSchema } from './schema/cliente.schema';
import { AuthModule } from 'src/auth/auth.module';
import { CreditoModule } from 'src/credito/credito.module';
import { RutaAbiertaInterceptor } from 'src/common/interceptors';
import { RutaModule } from 'src/ruta/ruta.module';
import { OwnershipModule } from 'src/common/ownership';

/**
 * Vertical 4: ya no registra Credito (vía CreditoModule/CreditoService).
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => RutaModule),
    forwardRef(() => AuthModule),
    forwardRef(() => CreditoModule),
    forwardRef(() => OwnershipModule),
    MongooseModule.forFeature([
      {
        name: Cliente.name,
        schema: ClienteSchema
      },
    ])
  ],
  controllers: [ClienteController],
  providers: [ClienteService, RutaAbiertaInterceptor],
  exports: [ClienteService, MongooseModule]
})
export class ClienteModule { }
