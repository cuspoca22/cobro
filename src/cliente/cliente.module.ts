import { Module } from '@nestjs/common';
import { ClienteService } from './cliente.service';
import { ClienteController } from './cliente.controller';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Cliente, ClienteSchema } from './schema/cliente.schema';
import { AuthModule } from 'src/auth/auth.module';
import { Credito, CreditoSchema } from 'src/credito/schemas/credito.schema';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
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
  providers: [ClienteService],
  exports: [ClienteService, MongooseModule]
})
export class ClienteModule {}
