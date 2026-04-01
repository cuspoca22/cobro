import { forwardRef, Module } from '@nestjs/common';
import { ClienteService } from './cliente.service';
import { ClienteController } from './cliente.controller';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Cliente, ClienteSchema } from './schema/cliente.schema';
import { AuthModule } from 'src/auth/auth.module';
import { Credito, CreditoSchema } from 'src/credito/schemas/credito.schema';
import { CreditoModule } from 'src/credito/credito.module';
import { RutaAbiertaInterceptor } from 'src/common/interceptors';
import { RutaModule } from 'src/ruta/ruta.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => RutaModule),
    AuthModule,
    CreditoModule,
    MongooseModule.forFeature([
      {
        name: Cliente.name,
        schema: ClienteSchema
      },
      {
        name: Credito.name,
        schema: CreditoSchema
      }
    ])
  ],
  controllers: [ClienteController],
  providers: [ClienteService, RutaAbiertaInterceptor],
  exports: [ClienteService, MongooseModule]
})
export class ClienteModule { }
