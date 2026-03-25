import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { PeticionesUbicacion, PeticionesUbicacionSchema } from './schema/peticiones-ubicacion.schema';
import { AuthModule } from '../auth/auth.module';
import { EmpresaModule } from '../empresa/empresa.module';
import { ClienteModule } from '../cliente/cliente.module';
import { RutaModule } from '../ruta/ruta.module';
import { PeticionesUbicacionService } from './peticiones-ubicacion.service';
import { PeticionesUbicacionController } from './peticiones-ubicacion.controller';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    EmpresaModule,
    ClienteModule,
    RutaModule,
    MongooseModule.forFeature([
      {
        name: PeticionesUbicacion.name,
        schema: PeticionesUbicacionSchema
      }
    ])
  ],
  controllers: [PeticionesUbicacionController],
  providers: [PeticionesUbicacionService],
  exports: [PeticionesUbicacionService, MongooseModule]
})
export class PeticionesUbicacionModule { }
