import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
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

@Controller('peticiones-ubicacion')
@Auth()
@ApiTags('Peticiones Ubicación')
@ApiBearerAuth('bearerAuth')
export class PeticionesUbicacionController {
  constructor(private readonly peticionesUbicacionService: PeticionesUbicacionService) { }

  @Post()
  @Auth(ValidRoles.superAdmin, ValidRoles.admin, ValidRoles.cobrador, ValidRoles.supervisor)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear una nueva solicitud de cambio de ubicación',
    description: 'Crea una nueva solicitud de cambio de ubicación para un cliente. Requiere autenticación y roles permitidos: superAdmin, admin, cobrador, supervisor.',
  })
  @ApiBody({ type: CreatePeticionesUbicacionDto })
  @ApiResponse({
    status: 201,
    description: 'Solicitud creada exitosamente',
    type: Boolean,
  })
  @ApiResponse({
    status: 400,
    description: 'El cliente ya tiene una solicitud pendiente / Coordenadas inválidas / Datos de entrada inválidos',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol no autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async create(
    @Body() createPeticionesUbicacionDto: CreatePeticionesUbicacionDto,
    @GetUser() user: UserEntity,
  ): Promise<boolean> {
    // Obtener id_ruta: si el usuario es cobrador, tiene una ruta asignada; si no, usar la del DTO o default.
    let routeId = createPeticionesUbicacionDto.id_ruta;
    if (routeId && !user.ruta) {
      user.ruta = routeId;
    }

    return this.peticionesUbicacionService.create(createPeticionesUbicacionDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener listado de solicitudes de ubicación',
    description: 'Retorna un listado de solicitudes de cambio de ubicación con filtros opcionales. Requiere autenticación.',
  })
  @ApiQuery({ name: 'estado', required: false, enum: ['pendiente', 'aceptada', 'rechazada'] })
  @ApiQuery({ name: 'id_cliente', required: false, type: String })
  @ApiQuery({ name: 'id_ruta', required: false, type: String })
  @ApiQuery({ name: 'id_empresa', required: false, type: String })
  @ApiQuery({ name: 'fecha_desde', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'fecha_hasta', required: false, type: String, format: 'date-time' })
  @ApiResponse({
    status: 200,
    description: 'Lista de solicitudes de ubicación',
    type: [PeticionesUbicacionEntity],
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async findAll(
    @Query() filterDto: GetPeticionesUbicacionDto,
  ): Promise<PeticionesUbicacionEntity[]> {
    // Convertir fechas de string a Date si están presentes
    const filters: any = { ...filterDto };
    if (filterDto.fecha_desde) {
      filters.fecha_desde = new Date(filterDto.fecha_desde);
    }
    if (filterDto.fecha_hasta) {
      filters.fecha_hasta = new Date(filterDto.fecha_hasta);
    }
    return this.peticionesUbicacionService.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener una solicitud por ID',
    description: 'Retorna los detalles de una solicitud de cambio de ubicación específica. Requiere autenticación.',
  })
  @ApiParam({ name: 'id', description: 'ID de la solicitud (MongoDB ObjectId)' })
  @ApiResponse({
    status: 200,
    description: 'Detalles de la solicitud',
    type: PeticionesUbicacionEntity,
  })
  @ApiResponse({ status: 400, description: 'ID inválido' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async findOne(@Param('id', ParseMongoIdPipe) id: string): Promise<PeticionesUbicacionEntity> {
    return this.peticionesUbicacionService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin, ValidRoles.supervisor)
  @ApiOperation({
    summary: 'Actualizar una solicitud de ubicación',
    description: 'Actualiza el estado o detalles de una solicitud de cambio de ubicación. Solo permite transiciones: "pendiente" → "aceptada" o "rechazada". Requiere autenticación y roles: superAdmin, admin, supervisor.',
  })
  @ApiParam({ name: 'id', description: 'ID de la solicitud (MongoDB ObjectId)' })
  @ApiBody({ type: UpdatePeticionesUbicacionDto })
  @ApiResponse({
    status: 200,
    description: 'Solicitud actualizada exitosamente',
    type: PeticionesUbicacionEntity,
  })
  @ApiResponse({ status: 400, description: 'ID inválido / Transición de estado no permitida / Coordenadas inválidas' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol no autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() updatePeticionesUbicacionDto: UpdatePeticionesUbicacionDto,
  ): Promise<PeticionesUbicacionEntity> {
    return this.peticionesUbicacionService.update(id, updatePeticionesUbicacionDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar una solicitud de ubicación',
    description: 'Elimina permanentemente una solicitud de cambio de ubicación. Requiere autenticación y roles: superAdmin, admin.',
  })
  @ApiParam({ name: 'id', description: 'ID de la solicitud (MongoDB ObjectId)' })
  @ApiResponse({
    status: 204,
    description: 'Solicitud eliminada exitosamente',
  })
  @ApiResponse({ status: 400, description: 'ID inválido' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol no autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async remove(@Param('id', ParseMongoIdPipe) id: string): Promise<{ message: string }> {
    return this.peticionesUbicacionService.remove(id);
  }
}
