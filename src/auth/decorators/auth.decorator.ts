import { UseGuards, applyDecorators } from '@nestjs/common';
import { ValidRoles } from '../interfaces';
import { RolProtected } from './rol-protected.decorator';
import { AuthGuard } from '@nestjs/passport';
import { UserRolGuard } from '../guards/user-rol.guard';

export function Auth(...roles: ValidRoles[]) {
  return applyDecorators(
    RolProtected(...roles),
    UseGuards(AuthGuard(), UserRolGuard),
  );
}