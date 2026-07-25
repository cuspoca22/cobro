import { Module, forwardRef } from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { EmpresaController } from './empresa.controller';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Empresa, EmpresaSchema } from './schemas/empresa.schema';
import { RutaModule } from '../ruta/ruta.module';
import { ClienteModule } from '../cliente/cliente.module';
import { MessageModule } from '../message/message.module';
import { EventsModule } from 'src/common/events/events.module';

/**
 * V4b: solo registra Empresa. User vía AuthService (forwardRef ciclo Auth↔Empresa).
 * Avisos de pago: Empresa emite eventos; Announcement escucha (sin importar AnnouncementModule).
 * Ownership: scoping de supervisor inline en el controller (sin InjectModel ajeno ni módulo extra).
 */
@Module({
  imports: [
    ConfigModule,
    EventsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => RutaModule),
    ClienteModule,
    forwardRef(() => MessageModule),
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
