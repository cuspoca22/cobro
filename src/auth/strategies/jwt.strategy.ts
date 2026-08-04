import { UnauthorizedException, Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { User } from '../schemas/user.schema';
import { UserEntity } from '../entities/user.entity';
import { EmpresaService } from 'src/empresa/empresa.service';
import { ValidRoles } from '../interfaces';

@Injectable()
export class JWTStrategy extends PassportStrategy(Strategy, 'jwt') {

  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,

    @Inject(forwardRef(() => EmpresaService))
    private readonly empresaService: EmpresaService,

    configService: ConfigService
  ) {
    super({
      secretOrKey: configService.get('SECRETORPRIVATEKEY'),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()
    });
  }

  async validate(payload: JwtPayload): Promise<UserEntity> {
    const { id, sid } = payload;

    if (!sid) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Sesión inválida. Inicie sesión nuevamente.',
        error: 'SESSION_INVALID',
      });
    }

    let user = await this.userModel.findById(id)
      .populate([
        { path: 'ruta' },
        { path: 'rutas', select: 'nombre status' },
      ])

    if (!user)
      throw new UnauthorizedException('Token no valido');

    if (!user.estado)
      throw new UnauthorizedException('usuario no esta activo');

    const sessionExpires = user.activeSessionExpiresAt
      ? new Date(user.activeSessionExpiresAt)
      : null;
    const sessionValid =
      !!user.activeSessionId
      && user.activeSessionId === sid
      && !!sessionExpires
      && sessionExpires.getTime() > Date.now();

    if (!sessionValid) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Sesión inválida o cerrada. Inicie sesión nuevamente.',
        error: 'SESSION_INVALID',
      });
    }

    if (user.rol === 'COBRADOR' && user.ruta) {
      const ruta = user.ruta as { status?: boolean; isLocked?: boolean };

      if (ruta.status === false) {
        throw new UnauthorizedException('Ruta cerrada hable con su administrador');
      }

      if (ruta.isLocked) {
        throw new UnauthorizedException(
          'Su ruta se encuentra bloqueada, por favor ponganse en contacto con su supervisor',
        );
      }
    }

    if (user.rol !== ValidRoles.superAdmin && user.empresa) {
      const empresaId = user.empresa.toString();
      const suspended = await this.empresaService.isAccessSuspended(empresaId);

      if (suspended) {
        throw new UnauthorizedException({
          statusCode: 401,
          message:
            'El acceso de su empresa está suspendido. Contacte a soporte para reactivarlo.',
          error: 'SUBSCRIPTION_SUSPENDED',
        });
      }
    }

    const entity = UserEntity.fromObject(user.toObject());
    entity.sid = sid;
    return entity;
  }

}
