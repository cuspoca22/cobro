import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PeticionesImagen, PeticionesImagenSchema } from './schema/peticiones-imagen.schema';
import { PeticionesImagenService } from './peticiones-imagen.service';
import { PeticionesImagenController } from './peticiones-imagen.controller';
import { AuthModule } from 'src/auth/auth.module';
import { ClienteModule } from 'src/cliente/cliente.module';

@Module({
  imports: [
    AuthModule,
    ClienteModule,
    MongooseModule.forFeature([
      { name: PeticionesImagen.name, schema: PeticionesImagenSchema },
    ]),
  ],
  controllers: [PeticionesImagenController],
  providers: [PeticionesImagenService],
  exports: [PeticionesImagenService],
})
export class PeticionesImagenModule {}
