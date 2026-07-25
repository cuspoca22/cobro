import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { PeticionesUbicacionService } from './peticiones-ubicacion.service';
import { CreatePeticionesUbicacionDto } from './dto/create-peticiones-ubicacion.dto';
import { UpdatePeticionesUbicacionDto } from './dto/update-peticiones-ubicacion.dto';
import { GetPeticionesUbicacionDto } from './dto/get-peticiones-ubicacion.dto';
import { PeticionesUbicacionEntity } from './entities/peticiones-ubicacion.entity';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserEntity } from '../auth/entities/user.entity';
import { ValidRoles } from '../auth/interfaces/valid-roles';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { Auth } from 'src/auth/decorators';
import { getScopedRutaIds, normalizeId } from 'src/common/helpers';

@Controller('peticiones-ubicacion')
@Auth()
@ApiTags('Peticiones Ubicacion')
@ApiBearerAuth('bearerAuth')
export class PeticionesUbicacionController {
  constructor(
    private readonly peticionesUbicacionService: PeticionesUbicacionService,
  ) { }

  @Post()
  @Auth(ValidRoles.superAdmin, ValidRoles.admin, ValidRoles.cobrador, ValidRoles.supervisor)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva solicitud de cambio de ubicacion' })
  @ApiBody({ type: CreatePeticionesUbicacionDto })
  @ApiResponse({ status: 201, description: 'Solicitud creada exitosamente', type: Boolean })
  async create(
    @Body() createPeticionesUbicacionDto: CreatePeticionesUbicacionDto,
    @GetUser() user: UserEntity,
  ): Promise<boolean> {
    const routeId = createPeticionesUbicacionDto.id_ruta;
    if (routeId) {
      this.assertRutaInScope(user, routeId);
    }

    return this.peticionesUbicacionService.create(createPeticionesUbicacionDto, user);
  }

  @Get()
  @Auth(ValidRoles.superAdmin, ValidRoles.admin, ValidRoles.supervisor, ValidRoles.cobrador)
  @ApiOperation({ summary: 'Obtener listado de solicitudes de ubicacion' })
  @ApiQuery({ name: 'estado', required: false, enum: ['pendiente', 'aceptada', 'rechazada'] })
  @ApiQuery({ name: 'id_cliente', required: false, type: String })
  @ApiQuery({ name: 'id_ruta', required: false, type: String })
  @ApiQuery({ name: 'id_empresa', required: false, type: String })
  @ApiQuery({ name: 'fecha_desde', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'fecha_hasta', required: false, type: String, format: 'date-time' })
  @ApiResponse({ status: 200, description: 'Lista de solicitudes', type: [PeticionesUbicacionEntity] })
  async findAll(
    @GetUser() user: UserEntity,
    @Query() filterDto: GetPeticionesUbicacionDto,
  ): Promise<PeticionesUbicacionEntity[]> {
    const filters: any = { ...filterDto };
    if (filterDto.fecha_desde) {
      filters.fecha_desde = new Date(filterDto.fecha_desde);
    }
    if (filterDto.fecha_hasta) {
      filters.fecha_hasta = new Date(filterDto.fecha_hasta);
    }

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

    return this.peticionesUbicacionService.findAll(filters);
  }

  @Get(':id')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin, ValidRoles.supervisor, ValidRoles.cobrador)
  @ApiOperation({ summary: 'Obtener una solicitud por ID' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud (MongoDB ObjectId)' })
  @ApiResponse({ status: 200, description: 'Detalles de la solicitud', type: PeticionesUbicacionEntity })
  async findOne(
    @GetUser() user: UserEntity,
    @Param('id', ParseMongoIdPipe) id: string,
  ): Promise<PeticionesUbicacionEntity> {
    const pet = await this.peticionesUbicacionService.findOne(id);
    const rutaId = pet.ruta?.id;
    if (rutaId) {
      this.assertRutaInScope(user, rutaId);
    }
    return pet;
  }

  @Patch(':id')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin, ValidRoles.supervisor)
  @ApiOperation({ summary: 'Actualizar una solicitud de ubicacion' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud (MongoDB ObjectId)' })
  @ApiBody({ type: UpdatePeticionesUbicacionDto })
  @ApiResponse({ status: 200, description: 'Solicitud actualizada', type: PeticionesUbicacionEntity })
  async update(
    @GetUser() user: UserEntity,
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() updatePeticionesUbicacionDto: UpdatePeticionesUbicacionDto,
  ): Promise<PeticionesUbicacionEntity> {
    const pet = await this.peticionesUbicacionService.findOne(id);
    const rutaId = pet.ruta?.id;
    if (rutaId) {
      this.assertRutaInScope(user, rutaId);
    }
    return this.peticionesUbicacionService.update(id, updatePeticionesUbicacionDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una solicitud de ubicacion' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud (MongoDB ObjectId)' })
  @ApiResponse({ status: 204, description: 'Solicitud eliminada exitosamente' })
  async remove(@Param('id', ParseMongoIdPipe) id: string): Promise<{ message: string }> {
    return this.peticionesUbicacionService.remove(id);
  }

  private assertRutaInScope(user: UserEntity, rutaId: string): void {
    if (!rutaId) return;
    const scoped = getScopedRutaIds(user);
    if (scoped === null) return;
    if (!scoped.includes(String(rutaId))) {
      throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
    }
  }
}
