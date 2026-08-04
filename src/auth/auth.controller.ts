import { Body, Controller, Post, Param, Get, Patch, Delete, Query, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, UpdateUserDto, UpdateProfileDto, CreateUserDto, GetUserDto } from './dto';
import { Auth, GetUser } from './decorators';
import { ValidRoles } from './interfaces';
import { Request } from 'express';
import { UserEntity } from './entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  ) {
    return this.authService.login(loginDto, request);
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
    @GetUser() user: GetUserDto
  ) {
    return this.authService.checkStatus(user)
  }

  @Auth()
  @Post('logout')
  async logout(@GetUser() user: UserEntity) {
    return this.authService.logout(user);
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
