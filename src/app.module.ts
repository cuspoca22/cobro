import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import mongoose from 'mongoose';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { join } from 'path';
import { ScheduleModule } from '@nestjs/schedule';

import { RutaModule } from './ruta/ruta.module';
import { CajaModule } from './caja/caja.module';
import { AuthModule } from './auth/auth.module';
import { EmpresaModule } from './empresa/empresa.module';
import { ClienteModule } from './cliente/cliente.module';
import { CreditoModule } from './credito/credito.module';
import { PruebasModule } from './pruebas/pruebas.module';
import { LogAuthModule } from './log-auth/log-auth.module';
import { MessageModule } from './message/message.module';
import { MovimientoCajaModule } from './movimientoCaja/movimiento-caja.module';
import { CurrencyModule } from './currency/currency.module';
import { RenovacionModule } from './renovacion/renovacion.module';
import { PeticionesUbicacionModule } from './peticiones-ubicacion/peticiones-ubicacion.module';
import { ReportesModule } from './reportes/reportes.module';
import { TrackingModule } from './tracking/tracking.module';
import { AnnouncementModule } from './announcement/announcement.module';
import { AppConfigModule } from './app-config/app-config.module';
import { EventsModule } from './common/events/events.module';
import { LeadsModule } from './leads/leads.module';
import { WsAuthEventModule } from './ws-auth-event/ws-auth-event.module';
import { ThrottlerModule } from '@nestjs/throttler';


const environment = process.env.NODE_ENV || 'development';
const envFile = `.env.${environment}`;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [envFile, '.env'] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    EventsModule,
    MongooseModule.forRoot(process.env.MONGO_URL, {
      dbName: process.env.MONGO_DB_NAME,
    }),
    ServeStaticModule.forRoot({
      // process.cwd() = raíz del proyecto (PM2 cwd / carpeta del deploy).
      // No usar __dirname: el build queda en dist/src y resolvía a dist/public.
      rootPath: join(process.cwd(), 'public'),
    }),
    MovimientoCajaModule,
    CurrencyModule,
    CreditoModule,
    AuthModule,
    RutaModule,
    CajaModule,
    EmpresaModule,
    ClienteModule,
    PruebasModule,
    LogAuthModule,
    MessageModule,
    RenovacionModule,
    PeticionesUbicacionModule,
    ReportesModule,
    TrackingModule,
    AnnouncementModule,
    AppConfigModule,
    LeadsModule,
    WsAuthEventModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {
  constructor() {
    mongoose.pluralize(null)
  }
}
