import { Request } from 'express';
import { Injectable, UnauthorizedException, Logger, BadRequestException, InternalServerErrorException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types, isValidObjectId } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from "bcrypt";

import { CreateUserDto, GetUserDto, LoginDto, LoginResponseDto, UpdateProfileDto } from './dto';
import { JwtPayload } from './interfaces';
import { UpdateUserDto } from './dto/update-user.dto';
import { LogAuth } from 'src/log-auth/entities/log-auth.entity';
import { User } from './schemas/user.schema';
import { UserEntity } from './entities/user.entity';
import { CajaDayCheckService } from 'src/caja/caja-day-check.service';
import { EmpresaService } from 'src/empresa/empresa.service';

@Injectable()
export class AuthService {

   private logger = new Logger("AuthService");

   constructor(
      @InjectModel(User.name)
      private readonly userModel: Model<User>,

      @InjectModel(LogAuth.name)
      private readonly logAuth: Model<LogAuth>,

      private readonly jwtService: JwtService,

      private readonly cajaDayCheckService: CajaDayCheckService,

      @Inject(forwardRef(() => EmpresaService))
      private readonly empresaService: EmpresaService,
   ) { }

   async create(createUserDto: CreateUserDto): Promise<User> {

      try {
         const payload = this.normalizeRoleAssignment({ ...createUserDto });

         const user = new this.userModel(payload);
         user.password = bcrypt.hashSync(createUserDto.password, 10);

         await user.save();

         return user;

      } catch (error) {
         this.handleExceptions(error);
      }

   }

   async login(loginDto: LoginDto, request: Request): Promise<LoginResponseDto> {

      const { username, password } = loginDto;

      let user = await this.userModel.findOne({
         username: username.toUpperCase()
      })
         .populate([
            {
               path: "ruta",
               select: 'status isLocked timeZone'
            },
            {
               path: "rutas",
               select: 'nombre status'
            },
         ]).lean()

      if (!user) {

         await this.logAuth.create({
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            reason: 'User does not exist',
            isSuccessful: false
         })

         throw new UnauthorizedException("Datos Incorrectos");
      }

      if (!bcrypt.compareSync(password, user.password)) {

         await this.logAuth.create({
            user: user._id,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            reason: 'Incorrect credentials',
            isSuccessful: false
         })

         throw new UnauthorizedException("Datos Incorrectos")
      }

      if (user.ruta && user.rol === 'COBRADOR') {
         if (!user.ruta.status) {

            await this.logAuth.create({
               user: user._id,
               ipAddress: request.ip,
               userAgent: request.headers['user-agent'],
               reason: 'Ruta cerrada',
               isSuccessful: false
            })

            throw new UnauthorizedException("Ruta cerrada hable con su administrador")
         }

         if (user.ruta.isLocked) {

            await this.logAuth.create({
               user: user._id,
               ipAddress: request.ip,
               userAgent: request.headers['user-agent'],
               reason: 'Ruta bloqueada',
               isSuccessful: false
            })

            throw new UnauthorizedException('Su ruta se encuentra bloqueada, por favor ponganse en contacto con su supervisor')
         }

         const checktCaja = await this.checkCaja(user.ruta._id.toString(), user.ruta.timeZone);

         if (!checktCaja) {
            throw new BadRequestException('La caja no corresponde al dia actual, por favor hable con su administrador')
         }
      }

      return {
         user: UserEntity.fromObject(user),
         token: this.getJwtToken({ id: user._id.toString() })
      }

   }

   async checkStatus(user: GetUserDto) {
      if (user.rol === 'COBRADOR' && user.ruta) {
         const fullUser = await this.userModel.findById(user.id)
            .populate({
               path: 'ruta',
               select: 'status isLocked',
            })
            .lean();

         const ruta = fullUser?.ruta as
            | { status?: boolean; isLocked?: boolean }
            | undefined;

         if (ruta) {
            if (ruta.status === false) {
               throw new UnauthorizedException(
                  'Ruta cerrada hable con su administrador',
               );
            }

            if (ruta.isLocked) {
               throw new UnauthorizedException(
                  'Su ruta se encuentra bloqueada, por favor ponganse en contacto con su supervisor',
               );
            }
         }
      }

      return {
         user: UserEntity.fromObject(user),
         token: this.getJwtToken({ id: user.id })
      }

   }

   async findAll(user: UserEntity, have_empresa: boolean = true) {
      if (!have_empresa) {
         return this.userModel.find({
            empresa: { $in: [null, undefined] }
         })
      }

      let empleados = [];

      // for (const ruta of user.rutas) {
      //    let consulta = await this.userModel.find({ ruta: ruta._id });

      //    empleados.push(...consulta)
      // }

      const users = await this.userModel.find();
      return users.filter(userDb => userDb._id.toString() !== user.id.toString());

   }

   async findOne(termino: string) {

      let user: User;

      if (isValidObjectId(termino)) {
         user = await this.userModel.findById(termino)
            .populate(['ruta', 'rutas'])
            .select("-password")
      }

      if (!user) {
         const regex = new RegExp(termino.trim().toUpperCase(), "i");
         user = await this.userModel.findOne({
            $or: [{ nombre: regex }, { username: regex }],
         })
            .populate(['ruta', 'rutas'])
            .select("-password");
      }


      if (!user) {
         throw new NotFoundException(`No existe un usuario con el termino ${termino}`)
      }

      return user;
   }

   /**
    * Actualiza solo datos de perfil del usuario autenticado.
    * No permite cambiar rol, ruta, empresa ni permisos.
    */
   async updateProfile(id: string, dto: UpdateProfileDto) {
      const user = await this.userModel.findById(id);
      if (!user) {
         throw new NotFoundException(`No existe un usuario con el id ${id}`);
      }

      const patch: Record<string, any> = {};

      if (dto.nombre !== undefined) {
         const nombre = dto.nombre?.trim();
         if (!nombre || nombre.length < 3) {
            throw new BadRequestException('El nombre debe tener al menos 3 caracteres');
         }
         patch.nombre = nombre;
      }

      if (dto.username !== undefined) {
         const username = dto.username?.trim();
         if (!username || username.length < 3) {
            throw new BadRequestException('El usuario debe tener al menos 3 caracteres');
         }
         patch.username = username;
      }

      if (dto.password) {
         if (dto.password.length < 6) {
            throw new BadRequestException('La contraseña tiene que tener minimo 6 caracteres');
         }
         patch.password = bcrypt.hashSync(dto.password, 10);
      }

      if (Object.keys(patch).length === 0) {
         throw new BadRequestException('No hay campos para actualizar');
      }

      try {
         await user.updateOne(patch, { returnDocument: 'after' });
         const { password: _pw, ...safePatch } = patch;
         return UserEntity.fromObject({
            ...user.toJSON(),
            ...safePatch,
         });
      } catch (error) {
         this.handleExceptions(error);
      }
   }

   async update(id: string, updateUserDto: UpdateUserDto) {

      const user = await this.userModel.findById(id)

      if (!user) {
         throw new NotFoundException(`No existe un usuario con el id ${id}`)
      }


      if (!!updateUserDto.password) {
         if (updateUserDto.password.length < 6) {
            throw new BadRequestException(`La contraseña tiene que tener minimo 6 caracteres`)
         }
         updateUserDto.password = bcrypt.hashSync(updateUserDto.password, 10);
      } else {
         delete updateUserDto.password;
      }

      const effectiveRol = updateUserDto.rol ?? user.rol;
      const normalized = this.normalizeRoleAssignment({
         ...updateUserDto,
         rol: effectiveRol,
         ruta: updateUserDto.ruta !== undefined ? updateUserDto.ruta : (user.ruta as any)?.toString?.() ?? user.ruta,
         rutas: updateUserDto.rutas !== undefined
            ? updateUserDto.rutas
            : ((user.rutas as any[]) || []).map((r) => (r?._id ?? r)?.toString()).filter(Boolean),
      } as CreateUserDto);

      const empresaId = (user.empresa as any)?.toString?.() ?? user.empresa?.toString();
      if (empresaId) {
         await this.empresaService.assertRutasBelongToEmpresa(empresaId, [
            ...(normalized.ruta ? [normalized.ruta] : []),
            ...(normalized.rutas || []),
         ]);
      }

      const { password: _pw, ...restDto } = updateUserDto;
      const patch: Record<string, any> = {
         ...restDto,
         rol: effectiveRol,
         ruta: normalized.ruta ?? null,
         rutas: normalized.rutas ?? [],
      };
      if (updateUserDto.password) {
         patch.password = updateUserDto.password;
      }
      if (updateUserDto.puedeActualizarUbicacion !== undefined) {
         patch.puedeActualizarUbicacion = updateUserDto.puedeActualizarUbicacion;
      }

      try {
         await user.updateOne(patch, { returnDocument: 'after' });

         return {
            ...user.toJSON(),
            ...patch,
         }
      } catch (error) {
         this.handleExceptions(error)
      }

   }

   /**
    * Ajusta ruta vs rutas según el rol:
    * - COBRADOR: usa ruta, limpia rutas
    * - SUPERVISOR: usa rutas, limpia ruta
    * - ADMIN/SUPERADMIN/otros: limpia ambos
    */
   normalizeRoleAssignment<T extends Partial<CreateUserDto>>(dto: T): T {
      const rol = dto.rol;

      if (rol === 'COBRADOR') {
         return {
            ...dto,
            rutas: [],
         };
      }

      if (rol === 'SUPERVISOR') {
         return {
            ...dto,
            ruta: null as any,
            rutas: Array.isArray(dto.rutas) ? dto.rutas : [],
         };
      }

      return {
         ...dto,
         ruta: null as any,
         rutas: [],
      };
   }

   public async deleteUser(id: string): Promise<string> {
      try {
         const user = await this.userModel.findById(id);
         if (!user) {
            throw new NotFoundException(`Usuario con id ${id} no existe`);
         }

         // FIX [P1 dual-refs]: $pull de Empresa.employes (vía EmpresaService)
         if (user.empresa) {
            await this.empresaService.pullEmploye(user.empresa, user._id);
         }

         await this.userModel.findByIdAndDelete(id);
         return id;

      } catch (error) {

         this.handleExceptions(error)

      }
   }

   /** Ruta.delete: localizar cobrador asignado a la ruta. */
   async findOneByRuta(
      rutaId: string,
      session?: ClientSession,
   ): Promise<{ _id: string } | null> {
      const user = await this.userModel
         .findOne({ ruta: rutaId })
         .select('_id')
         .session(session || null)
         .lean();
      if (!user) return null;
      return { _id: user._id.toString() };
   }

   /** Ruta.delete: quitar referencia ruta del usuario. */
   async unsetRuta(
      userId: string | Types.ObjectId,
      session?: ClientSession,
   ): Promise<void> {
      await this.userModel.findByIdAndUpdate(
         userId,
         { $unset: { ruta: 1 } },
         { session: session || undefined },
      );
   }

   /** Empresa: lectura lean por id. */
   async findByIdLean(
      id: string,
      select?: string,
   ): Promise<{ _id: string; empresa?: string | null } | null> {
      let query = this.userModel.findById(id);
      if (select) query = query.select(select);
      const user = await query.lean();
      if (!user) return null;
      return {
         _id: user._id.toString(),
         empresa: user.empresa ? user.empresa.toString() : null,
      };
   }

   async deleteById(id: string, session?: ClientSession): Promise<void> {
      await this.userModel.findByIdAndDelete(id).session(session || null);
   }

   async setEmpresa(
      userId: string,
      empresaId: string | Types.ObjectId,
   ): Promise<void> {
      const user = await this.userModel.findById(userId);
      if (!user) {
         throw new NotFoundException(`Usuario con id ${userId} no existe`);
      }
      user.empresa = new Types.ObjectId(empresaId.toString()) as any;
      await user.save();
   }

   private getJwtToken(payload: JwtPayload): string {
      const token = this.jwtService.sign(payload);
      return token;
   }

   private async checkCaja(idRuta: string, timeZone: string) {
      return this.cajaDayCheckService.isUltimaCajaDeHoy(idRuta, timeZone);
   }

   private handleExceptions(error: any) {
      if (error.code === 11000) {
         throw new BadRequestException(`Ya existe un usuario ${JSON.stringify(error.keyValue)}`);
      }

      this.logger.error(error);
      throw new InternalServerErrorException("Revisar el console.log")
   }

}
