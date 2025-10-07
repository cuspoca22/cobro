import { UnauthorizedException, Injectable } from '@nestjs/common';
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User } from '../entities/user.entity';
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { GetUserDto } from '../dto';
import { plainToClass } from 'class-transformer';

@Injectable()
export class JWTStrategy extends PassportStrategy(Strategy){

  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,

    configService: ConfigService
  ){
    super({
      secretOrKey: configService.get('SECRETORPRIVATEKEY'),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()
    });
  }

  async validate(payload: JwtPayload): Promise<GetUserDto>{
    const {id} = payload;
    
    let user = await this.userModel.findById(id)
      .populate([
        { path: 'ruta' }
      ])

    if(!user)
      throw new UnauthorizedException('Token no valido');
    
    if(!user.estado)
      throw new UnauthorizedException('usuario no esta activo');


    return plainToClass(GetUserDto, {...user.toObject(), ruta: user.ruta._id.toString()});
  }

}