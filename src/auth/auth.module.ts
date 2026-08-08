import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JWTStrategy } from './strategies/jwt.strategy';
import { LogAuth, LogAuthSchema } from '../log-auth/entities/log-auth.entity';
import { User, UserSchema } from './schemas/user.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { AppConfigModule } from 'src/app-config/app-config.module';
import { CajaDayCheckModule } from 'src/caja/caja-day-check.module';
import { EmpresaModule } from 'src/empresa/empresa.module';
import { MessageModule } from 'src/message/message.module';

/**
 * V4b: solo registra User/LogAuth. Empresa vía EmpresaModule (forwardRef ciclo Auth↔Empresa).
 * Check de caja del día vía CajaDayCheckModule (sin importar CajaModule).
 */
@Module({
  imports: [
    ConfigModule,
    CajaDayCheckModule,
    forwardRef(() => AppConfigModule),
    forwardRef(() => EmpresaModule),
    forwardRef(() => MessageModule),
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema
      },
      {
        name: LogAuth.name,
        schema: LogAuthSchema
      },
    ]),
    PassportModule.register({
      defaultStrategy: "jwt"
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          secret: configService.get("SECRETORPRIVATEKEY"),
          signOptions: {
            expiresIn: "12h"
          }
        }
      }
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JWTStrategy,
    DateFnsAdapter,
  ],
  exports: [MongooseModule, AuthService, JWTStrategy, PassportModule, JwtModule]
})
export class AuthModule { }
