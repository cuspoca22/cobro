import { Module } from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { EmpresaController } from './empresa.controller';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Empresa, EmpresaSchema } from './entities/empresa.entity';
import { MomentService } from '../common/plugins/moment/moment.service';
import { RutaModule } from '../ruta/ruta.module';
import { ClienteModule } from '../cliente/cliente.module';
import { User, UserSchema } from 'src/auth/schemas/user.schema';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    RutaModule,
    ClienteModule,
    MongooseModule.forFeature([
      {
        name: Empresa.name,
        schema: EmpresaSchema
      },
      {
        name: User.name,
        schema: UserSchema
      },
    ])
  ],
  controllers: [EmpresaController],
  providers: [EmpresaService, MomentService],
  exports: [EmpresaService, MongooseModule]
})
export class EmpresaModule {}
