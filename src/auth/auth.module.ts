import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JWTStrategy } from './strategies/jwt.strategy';
import { LogAuth, LogAuthSchema } from '../log-auth/entities/log-auth.entity';
import { User, UserSchema } from './schemas/user.schema';
import { Caja, CajaSchema } from 'src/caja/schemas/caja.schema';
import { dateFnsAdapter } from 'src/common/wrappers/date-fns.adapter';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema
      },
      {
        name: LogAuth.name,
        schema: LogAuthSchema
      },
      {
        name: Caja.name,
        schema: CajaSchema
      }
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
            expiresIn: "1h"
          }
        }
      }
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService, 
    JWTStrategy,
    dateFnsAdapter,
  ],
  exports: [MongooseModule, AuthService, JWTStrategy, PassportModule, JwtModule]
})
export class AuthModule {}
