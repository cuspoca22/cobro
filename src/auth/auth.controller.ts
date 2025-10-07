import { Body, Controller, Post, Param, Get, Patch, Delete, Query, ParseBoolPipe, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, UpdateUserDto, CreateUserDto, GetUserDto } from './dto';
import { Auth, GetUser } from './decorators';
import { ValidRoles } from './interfaces';
import { User } from './entities/user.entity';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Post("new-user")
  async create(
    @Body() createUserDto: CreateUserDto,
  ){
    return this.authService.create(createUserDto)
  }

  @Post("login")
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
  ) {
    return this.authService.login(loginDto, request);
  }

  @Auth()
  @Get("users")
  async findAll(
    @GetUser() user: User,
    // @Query('have_empresa', ParseBoolPipe) have_empresa: boolean,
  ) {
    return this.authService.findAll(user)
  }

  @Auth()
  @Get("revalidar")
  async checkStatus(
    @GetUser() user: GetUserDto
  ) {
    return this.authService.checkStatus(user)
  }

  @Auth()
  @Get("user/:termino")
  async findOne(
    @Param("termino") termino: string
  ) {
    return this.authService.findOne(termino)
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Patch("update-user/:id")
  async update(
    @Param("id") id: string,
    @Body() updateUserDto: UpdateUserDto
  ) {
    return this.authService.update(id, updateUserDto)
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Delete(':id')
  async delete(
    @Param('id') id: string,
  ) {
    return this.authService.deleteUser(id);
  }
}
