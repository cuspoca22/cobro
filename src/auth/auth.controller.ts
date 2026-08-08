import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  forwardRef,
} from '@nestjs/common';
import { Request } from 'express';

import { AppConfigService } from 'src/app-config/app-config.service';
import { Auth, GetUser } from './decorators';
import {
  CreateUserDto,
  GetUserDto,
  LoginDto,
  UpdateProfileDto,
  UpdateUserDto,
} from './dto';
import { UserEntity } from './entities/user.entity';
import { ValidRoles } from './interfaces';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => AppConfigService))
    private readonly appConfigService: AppConfigService,
  ) {}

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Post("new-user")
  async create(
    @Body() createUserDto: CreateUserDto,
    @GetUser() actor: UserEntity,
  ){
    return this.authService.create(createUserDto, actor)
  }

  @Post("login")
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Query('rol') rol?: string,
    @Query('admin') admin?: string,
    @Headers('x-app-version-code') appVersionCode?: string,
  ) {
    // Query hints enviados por clientes (cobrov2: rol=COBRADOR, admin-app: admin=true).
    const client =
      admin === 'true' || admin === '1'
        ? 'admin' as const
        : rol?.toUpperCase() === 'COBRADOR'
          ? 'cobrador' as const
          : undefined;

    if (client === 'cobrador') {
      await this.assertAppVersionAllowed(appVersionCode);
    }

    return this.authService.login(loginDto, request, { client });
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Get("users")
  async findAll(
    @GetUser() user: UserEntity,
    @Query('empresaId') empresaId?: string,
  ) {
    const filterEmpresa =
      empresaId && user.rol === ValidRoles.superAdmin
        ? empresaId
        : undefined;
    return this.authService.findAll(user, filterEmpresa)
  }

  @Auth()
  @Get("revalidar")
  async checkStatus(
    @GetUser() user: GetUserDto,
    @Headers('x-app-version-code') appVersionCode?: string,
  ) {
    if (user.rol === ValidRoles.cobrador) {
      await this.assertAppVersionAllowed(appVersionCode);
    }
    return this.authService.checkStatus(user)
  }

  private async assertAppVersionAllowed(appVersionCode?: string) {
    const { force, config } =
      await this.appConfigService.shouldForceUpdate(appVersionCode);
    if (force) {
      const statusCode = 426;
      throw new HttpException(
        {
          statusCode,
          message: config.message,
          ...config,
        },
        statusCode,
      );
    }
  }

  /**
   * Libera la sesión ligada al JWT aunque esté expirado.
   * Sin AuthGuard: el servicio verifica firma con ignoreExpiration
   * y solo limpia si el sid del token sigue siendo el activo.
   */
  @Post('logout')
  async logout(@Req() request: Request) {
    const authorization =
      typeof request.headers['authorization'] === 'string'
        ? request.headers['authorization']
        : undefined;
    return this.authService.logout(authorization);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Post('clear-session/:id')
  async clearSession(
    @Param('id') id: string,
    @GetUser() actor: UserEntity,
  ) {
    return this.authService.clearSession(id, actor);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Get("user/:termino")
  async findOne(
    @GetUser() user: UserEntity,
    @Param("termino") termino: string,
  ) {
    return this.authService.findOne(termino, user);
  }

  /** Auto-edición: cualquier usuario autenticado, solo nombre/username/password. */
  @Auth()
  @Patch('me')
  async updateMe(
    @GetUser() user: GetUserDto,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, dto);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Patch("update-user/:id")
  async update(
    @Param("id") id: string,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() actor: UserEntity,
  ) {
    return this.authService.update(id, updateUserDto, actor)
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Delete(':id')
  async delete(
    @Param('id') id: string,
  ) {
    return this.authService.deleteUser(id);
  }
}
