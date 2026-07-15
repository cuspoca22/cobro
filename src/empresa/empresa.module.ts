import { Module, forwardRef } from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { EmpresaController } from './empresa.controller';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Empresa, EmpresaSchema } from './schemas/empresa.schema';
import { RutaModule } from '../ruta/ruta.module';
import { ClienteModule } from '../cliente/cliente.module';

/**
 * V4b: solo registra Empresa. User vía AuthService (forwardRef Auth↔Empresa).
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    forwardRef(() => RutaModule),
    ClienteModule,
    MongooseModule.forFeature([
      {
        name: Empresa.name,
        schema: EmpresaSchema
      },
    ])
  ],
  controllers: [EmpresaController],
  providers: [EmpresaService],
  exports: [EmpresaService, MongooseModule]
})
export class EmpresaModule {}
