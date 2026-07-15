import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { META_ROLES } from 'src/auth/decorators/rol-protected.decorator';
import { GetUserDto } from '../dto';

@Injectable()
export class UserRolGuard implements CanActivate {

   constructor(
      private readonly reflector: Reflector
   ) { }

   canActivate(
      context: ExecutionContext,
   ): boolean | Promise<boolean> | Observable<boolean> {

      // FIX [P0 seguridad]: getAllAndOverride lee roles del handler Y de la clase.
      // Antes solo leía el handler, así que @Auth(roles) en el controller se ignoraba.
      const validRoles: string[] = this.reflector.getAllAndOverride(META_ROLES, [
         context.getHandler(),
         context.getClass(),
      ]);

      if (!validRoles) return true;
      if (validRoles.length === 0) return true;

      const req = context.switchToHttp().getRequest();
      const user = req.user as GetUserDto;

      if (!user)
         throw new BadRequestException('Usuario no encontrado')

      if (validRoles.includes(user.rol)) {
         return true
      }

      throw new ForbiddenException('El usuario no tiene un rol válido')
   }
}
