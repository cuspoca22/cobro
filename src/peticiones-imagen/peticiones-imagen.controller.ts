import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { PeticionesImagenService } from './peticiones-imagen.service';
import { CreatePeticionesImagenDto } from './dto/create-peticiones-imagen.dto';
import { UpdatePeticionesImagenDto } from './dto/update-peticiones-imagen.dto';
import { GetPeticionesImagenDto } from './dto/get-peticiones-imagen.dto';
import { PeticionesImagenEntity } from './entities/peticiones-imagen.entity';
import { Auth, GetUser } from 'src/auth/decorators';
import { UserEntity } from 'src/auth/entities/user.entity';
import { ValidRoles } from 'src/auth/interfaces';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { getScopedRutaIds, normalizeId } from 'src/common/helpers';

@Controller('peticiones-imagen')
@Auth()
export class PeticionesImagenController {
  constructor(private readonly peticionesImagenService: PeticionesImagenService) {}

  @Post()
  @Auth(ValidRoles.superAdmin, ValidRoles.admin, ValidRoles.cobrador, ValidRoles.supervisor)
  create(
    @Body() dto: CreatePeticionesImagenDto,
    @GetUser() user: UserEntity,
  ): Promise<PeticionesImagenEntity> {
    return this.peticionesImagenService.create(dto, user);
  }

  @Get()
  @Auth(ValidRoles.superAdmin, ValidRoles.admin, ValidRoles.supervisor, ValidRoles.cobrador)
  findAll(
    @GetUser() user: UserEntity,
    @Query() filterDto: GetPeticionesImagenDto,
  ): Promise<PeticionesImagenEntity[]> {
    return this.peticionesImagenService.findAll(this.filtrosDe(user, filterDto) as any);
  }

  @Get('conteo')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin, ValidRoles.supervisor, ValidRoles.cobrador)
  async conteo(
    @GetUser() user: UserEntity,
    @Query() filterDto: GetPeticionesImagenDto,
  ): Promise<{ total: number }> {
    const total = await this.peticionesImagenService.contar(this.filtrosDe(user, filterDto) as any);
    return { total };
  }

  @Get(':id')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin, ValidRoles.supervisor, ValidRoles.cobrador)
  async findOne(
    @GetUser() user: UserEntity,
    @Param('id', ParseMongoIdPipe) id: string,
  ): Promise<PeticionesImagenEntity> {
    const pet = await this.peticionesImagenService.findOne(id);
    this.assertEmpresa(user, pet.empresa?.id);
    this.assertRuta(user, pet.ruta?.id);
    return pet;
  }

  @Patch(':id')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  async revisar(
    @GetUser() user: UserEntity,
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdatePeticionesImagenDto,
  ): Promise<PeticionesImagenEntity> {
    const pet = await this.peticionesImagenService.findOne(id);
    this.assertEmpresa(user, pet.empresa?.id);
    this.assertRuta(user, pet.ruta?.id);
    return this.peticionesImagenService.revisar(id, dto.esAprobado, user);
  }

  private filtrosDe(user: UserEntity, filterDto: GetPeticionesImagenDto): Record<string, unknown> {
    const filters: Record<string, unknown> = { ...filterDto };
    if (filterDto.fecha_desde) filters.fecha_desde = new Date(filterDto.fecha_desde);
    if (filterDto.fecha_hasta) filters.fecha_hasta = new Date(filterDto.fecha_hasta);

    if (user.rol !== ValidRoles.superAdmin) {
      const empresaId = normalizeId(user.empresa);
      if (!empresaId) {
        throw new BadRequestException('El usuario no tiene una empresa asignada');
      }
      filters.id_empresa = empresaId;
    }

    const scoped = getScopedRutaIds(user);
    if (Array.isArray(scoped)) {
      if (filters.id_ruta && !scoped.includes(String(filters.id_ruta))) {
        throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
      }
      filters.rutaIds = scoped;
    }

    return filters;
  }

  private assertEmpresa(user: UserEntity, empresaId?: string): void {
    if (user.rol === ValidRoles.superAdmin) return;
    const propia = normalizeId(user.empresa);
    if (!propia || !empresaId || propia !== String(empresaId)) {
      throw new ForbiddenException('No tienes permiso para operar sobre esta empresa');
    }
  }

  private assertRuta(user: UserEntity, rutaId?: string): void {
    if (!rutaId) return;
    const scoped = getScopedRutaIds(user);
    if (scoped === null) return;
    if (!scoped.includes(String(rutaId))) {
      throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
    }
  }
}
