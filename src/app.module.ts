import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import mongoose from 'mongoose';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { RutaModule } from './ruta/ruta.module';
import { CajaModule } from './caja/caja.module';
import { AuthModule } from './auth/auth.module';
import { EmpresaModule } from './empresa/empresa.module';
import { ClienteModule } from './cliente/cliente.module';
import { CreditoModule } from './credito/credito.module';
import { join } from 'path';
import { PruebasModule } from './pruebas/pruebas.module';
import { FilesModule } from './files/files.module';
import { LogAuthModule } from './log-auth/log-auth.module';
import { MessageModule } from './message/message.module';
import { MovimientoCajaModule } from './movimientoCaja/movimiento-caja.module';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true, envFilePath: '.env'}),
    MongooseModule.forRoot(process.env.MONGO_URL, {
      dbName: process.env.MONGO_DB_NAME,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname,"..",'public'),
    }),
    MovimientoCajaModule,
    CreditoModule,
    AuthModule,
    // RutaModule,
    // CajaModule,
    // EmpresaModule,
    ClienteModule,
    PruebasModule,
    // FilesModule,
    // LogAuthModule,
    // MessageModule,
    // ReportsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {
  constructor() {
    mongoose.pluralize(null)
  }
}
