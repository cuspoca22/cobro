import { Request } from 'express';
import { Injectable, UnauthorizedException, Logger, BadRequestException, InternalServerErrorException, NotFoundException, Inject, forwardRef, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types, isValidObjectId } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from "bcrypt";
import { randomUUID } from 'crypto';

import { CreateUserDto, GetUserDto, LoginDto, LoginResponseDto, UpdateProfileDto } from './dto';
import { JwtPayload, ValidRoles } from './interfaces';
import { UpdateUserDto } from './dto/update-user.dto';
import { LogAuth } from 'src/log-auth/entities/log-auth.entity';
import { User } from './schemas/user.schema';
import { UserEntity } from './entities/user.entity';
import { CajaDayCheckService } from 'src/caja/caja-day-check.service';
import { EmpresaService } from 'src/empresa/empresa.service';
import { MessageGateway } from 'src/message/message.gateway';

/** Alineado con JwtModule expiresIn: "12h". */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

      @Inject(forwardRef(() => MessageGateway))
      private readonly messageGateway: MessageGateway,
   ) { }

   async create(createUserDto: CreateUserDto, actor?: { rol?: string }): Promise<User> {

      if (
         createUserDto.rol === ValidRoles.superAdmin &&
         actor?.rol !== ValidRoles.superAdmin
      ) {
         throw new ForbiddenException('Solo un SUPERADMIN puede crear usuarios SUPERADMIN');
      }

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

   /**
    * @param options.client Hint del cliente (`cobrador` / `admin`) para validar rol en servidor.
    */
   async login(
      loginDto: LoginDto,
      request: Request,
      options?: { client?: 'cobrador' | 'admin' },
   ): Promise<LoginResponseDto> {

      const { username, password } = loginDto;

      let user = await this.userModel.findOne({
         username: username.toUpperCase()
      })
         .populate([
            {
               path: "ruta",
               select: 'status isLocked timeZone currency pais'
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

      if (!user.estado) {
         await this.logAuth.create({
            user: user._id,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            reason: 'USER_BLOCKED',
            isSuccessful: false
         })

         throw new UnauthorizedException({
            statusCode: 401,
            message:
               'Tu usuario está bloqueado. Contacta a un administrador.',
            error: 'USER_BLOCKED',
         })
      }

      this.assertLoginClientRole(user.rol, options?.client, user._id, request);

      const hadActiveSession = this.isSessionActive(
         user.activeSessionId,
         user.activeSessionExpiresAt,
      );

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

      if (user.rol !== ValidRoles.superAdmin && user.empresa) {
         const empresaId =
            typeof user.empresa === 'object' && (user.empresa as any)._id
               ? String((user.empresa as any)._id)
               : String(user.empresa);
         const suspended = await this.empresaService.isAccessSuspended(empresaId);
         if (suspended) {
            await this.logAuth.create({
               user: user._id,
               ipAddress: request.ip,
               userAgent: request.headers['user-agent'],
               reason: 'SUBSCRIPTION_SUSPENDED',
               isSuccessful: false,
            });
            throw new UnauthorizedException({
               statusCode: 401,
               message:
                  'El acceso de su empresa está suspendido. Contacte a soporte para reactivarlo.',
               error: 'SUBSCRIPTION_SUSPENDED',
            });
         }
      }

      if (hadActiveSession) {
         const previousUserId = user._id.toString();
         const hasLiveClient =
            this.messageGateway.hasActiveUserConnection(previousUserId);

         if (hasLiveClient && !loginDto.force) {
            await this.logAuth.create({
               user: user._id,
               ipAddress: request.ip,
               userAgent: request.headers['user-agent'],
               reason: 'SESSION_ALREADY_ACTIVE',
               isSuccessful: false,
            });

            throw new UnauthorizedException({
               statusCode: 401,
               message:
                  'Ya hay una sesión activa. Cierre sesión en el otro dispositivo o contacte a un administrador.',
               error: 'SESSION_ALREADY_ACTIVE',
               expiresAt: user.activeSessionExpiresAt,
            });
         }

         if (hasLiveClient && loginDto.force) {
            await this.logAuth.create({
               user: user._id,
               ipAddress: request.ip,
               userAgent: request.headers['user-agent'],
               reason: 'SESSION_FORCE_LOGIN',
               isSuccessful: true,
            });
            this.messageGateway.emitSessionRevoked(previousUserId, {
               reason: 'FORCE_LOGIN',
            });
         } else {
            // Sesión fantasma (p. ej. tras reinicio del API sin WS vivo).
            await this.logAuth.create({
               user: user._id,
               ipAddress: request.ip,
               userAgent: request.headers['user-agent'],
               reason: 'SESSION_ORPHAN_RECLAIM',
               isSuccessful: true,
            });
            this.messageGateway.emitSessionRevoked(previousUserId, {
               reason: 'ORPHAN_RECLAIM',
            });
         }
      }

      const sid = randomUUID();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

      await this.userModel.updateOne(
         { _id: user._id },
         {
            $set: {
               activeSessionId: sid,
               activeSessionExpiresAt: expiresAt,
            },
         },
      );

      this.messageGateway.emitSessionState({
         userId: user._id.toString(),
         hasActiveSession: true,
         activeSessionExpiresAt: expiresAt,
         empresaId: this.resolveEmpresaId(user.empresa),
         reason: 'LOGIN',
      });

      return {
         user: UserEntity.fromObject(user),
         token: this.getJwtToken({ id: user._id.toString(), sid })
      }

   }

   async checkStatus(user: GetUserDto & { sid?: string }) {
      let rutaCurrency: string | undefined;
      let rutaPais: string | undefined;

      if (user.rol === 'COBRADOR' && user.ruta) {
         const fullUser = await this.userModel.findById(user.id)
            .populate({
               path: 'ruta',
               select: 'status isLocked currency pais',
            })
            .lean();

         const ruta = fullUser?.ruta as
            | {
               status?: boolean;
               isLocked?: boolean;
               currency?: string;
               pais?: string;
            }
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

            rutaCurrency = ruta.currency;
            rutaPais = ruta.pais;
         }
      }

      if (user.rol !== ValidRoles.superAdmin && user.empresa) {
         const empresaId =
            typeof user.empresa === 'object' && (user.empresa as any)._id
               ? String((user.empresa as any)._id)
               : String(user.empresa);
         const suspended = await this.empresaService.isAccessSuspended(empresaId);
         if (suspended) {
            throw new UnauthorizedException({
               statusCode: 401,
               message:
                  'El acceso de su empresa está suspendido. Contacte a soporte para reactivarlo.',
               error: 'SUBSCRIPTION_SUSPENDED',
            });
         }
      }

      const sid = user.sid;
      if (!sid) {
         throw new UnauthorizedException({
            statusCode: 401,
            message: 'Sesión inválida. Inicie sesión nuevamente.',
            error: 'SESSION_INVALID',
         });
      }

      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await this.userModel.updateOne(
         { _id: user.id, activeSessionId: sid },
         { $set: { activeSessionExpiresAt: expiresAt } },
      );

      return {
         user: UserEntity.fromObject({
            ...user,
            rutaCurrency,
            rutaPais,
         }),
         token: this.getJwtToken({ id: user.id, sid })
      }

   }

   /**
    * Cierra la sesión del JWT actual si el sid coincide (idempotente).
    */
   async logout(user: UserEntity & { sid?: string }): Promise<{ ok: true }> {
      if (user.sid) {
         const result = await this.userModel.updateOne(
            { _id: user.id, activeSessionId: user.sid },
            {
               $set: {
                  activeSessionId: null,
                  activeSessionExpiresAt: null,
               },
            },
         );

         if ((result as any).matchedCount > 0) {
            this.messageGateway.emitSessionState({
               userId: user.id,
               hasActiveSession: false,
               activeSessionExpiresAt: null,
               empresaId: this.resolveEmpresaId(user.empresa),
               reason: 'LOGOUT',
            });
         }
      }
      return { ok: true };
   }

   /**
    * Libera la sesión activa de un usuario (ADMIN/SUPERADMIN).
    * Emite WS session-revoked para cerrar el cliente conectado.
    */
   async clearSession(id: string, actor: UserEntity): Promise<{ ok: true }> {
      const user = await this.findOne(id, actor);
      const userId = (user as any)._id?.toString?.() ?? (user as any).id?.toString?.();

      await this.userModel.updateOne(
         { _id: userId },
         {
            $set: {
               activeSessionId: null,
               activeSessionExpiresAt: null,
            },
         },
      );

      this.messageGateway.emitSessionRevoked(userId, {
         reason: 'ADMIN_CLEAR',
      });

      // Emitir estado después del revoke para que clientes en adminRoom
      // también cierren si no recibieron session-revoked.
      this.messageGateway.emitSessionState({
         userId,
         hasActiveSession: false,
         activeSessionExpiresAt: null,
         empresaId: this.resolveEmpresaId(
            (user as any).empresa ?? (user as any).empresaId,
         ),
         reason: 'ADMIN_CLEAR',
      });

      return { ok: true };
   }

   async findAll(user: UserEntity, empresaId?: string) {
      const filter: Record<string, any> = {};

      if (user.rol === ValidRoles.superAdmin) {
         if (empresaId) {
            filter.empresa = empresaId;
         }
      } else {
         const userEmpresa =
            (user.empresa as any)?.toString?.() ?? user.empresa?.toString?.() ?? user.empresa;
         if (!userEmpresa) {
            return [];
         }
         filter.empresa = userEmpresa;
      }

      const users = await this.userModel
         .find(filter)
         .select('-password')
         .populate(['ruta', 'rutas', 'empresa']);

      return users
         .filter((userDb) => userDb._id.toString() !== user.id?.toString())
         .map((userDb) => this.withSessionMeta(userDb));
   }

   async findOne(termino: string, actor?: UserEntity) {

      let user: User;

      const empresaFilter =
        actor && actor.rol !== ValidRoles.superAdmin
          ? (() => {
              const userEmpresa =
                (actor.empresa as any)?.toString?.() ??
                actor.empresa?.toString?.() ??
                actor.empresa;
              return userEmpresa ? { empresa: userEmpresa } : null;
            })()
          : {};

      if (empresaFilter === null) {
        throw new ForbiddenException('No tienes una empresa asignada');
      }

      if (isValidObjectId(termino)) {
         user = await this.userModel.findById(termino)
            .where(empresaFilter)
            .populate(['ruta', 'rutas'])
            .select("-password")
      }

      if (!user) {
         const regex = new RegExp(termino.trim().toUpperCase(), "i");
         user = await this.userModel.findOne({
            $or: [{ nombre: regex }, { username: regex }],
            ...empresaFilter,
         })
            .populate(['ruta', 'rutas'])
            .select("-password");
      }


      if (!user) {
         throw new NotFoundException(`No existe un usuario con el termino ${termino}`)
      }

      return this.withSessionMeta(user) as User;
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
         patch.activeSessionId = null;
         patch.activeSessionExpiresAt = null;
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

   async update(id: string, updateUserDto: UpdateUserDto, actor?: { rol?: string }) {

      const user = await this.userModel.findById(id)

      if (!user) {
         throw new NotFoundException(`No existe un usuario con el id ${id}`)
      }

      if (
         (updateUserDto.rol === ValidRoles.superAdmin || user.rol === ValidRoles.superAdmin) &&
         actor?.rol !== ValidRoles.superAdmin
      ) {
         throw new ForbiddenException('Solo un SUPERADMIN puede crear o modificar usuarios SUPERADMIN');
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

      const shouldRevokeSession =
         updateUserDto.estado === false || !!updateUserDto.password;
      if (shouldRevokeSession) {
         patch.activeSessionId = null;
         patch.activeSessionExpiresAt = null;
      }

      try {
         await user.updateOne(patch, { returnDocument: 'after' });

         if (shouldRevokeSession) {
            const userId = user._id.toString();
            const revokeReason =
               updateUserDto.estado === false ? 'USER_BLOCKED' : 'PASSWORD_CHANGED';
            this.messageGateway.emitSessionRevoked(userId, {
               reason: revokeReason,
            });
            this.messageGateway.emitSessionState({
               userId,
               hasActiveSession: false,
               activeSessionExpiresAt: null,
               empresaId: this.resolveEmpresaId(user.empresa),
               reason: revokeReason,
            });
         }

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

   public async deleteUser(id: string): Promise<{ ok: true; id: string }> {
      if (!isValidObjectId(id)) {
         throw new BadRequestException('Id de usuario inválido');
      }

      try {
         const user = await this.userModel.findById(id).select('_id empresa');
         if (!user) {
            throw new NotFoundException(`Usuario con id ${id} no existe`);
         }

         const empresaId = user.empresa ? user.empresa.toString() : null;
         if (empresaId && isValidObjectId(empresaId)) {
            try {
               await this.empresaService.pullEmploye(empresaId, id);
            } catch (pullErr: any) {
               // Empresa ya borrada o refs rotas: no bloquear el delete del usuario
               this.logger.warn(
                  `pullEmploye omitido al borrar user ${id}: ${pullErr?.message || pullErr}`,
               );
            }
         }

         const deleted = await this.userModel.findByIdAndDelete(id);
         if (!deleted) {
            throw new NotFoundException(`Usuario con id ${id} no existe`);
         }

         return { ok: true, id };
      } catch (error) {
         this.handleExceptions(error);
      }
   }

   /**
    * Borrado masivo de usuarios de una empresa (cascada de empresa.remove).
    * No toca SUPERADMIN. No hace $pull (la empresa se elimina después).
    */
   async deleteManyByEmpresa(
      empresaId: string,
      employeIds: Array<string | Types.ObjectId> = [],
   ): Promise<number> {
      const oid = new Types.ObjectId(empresaId);
      const extraIds = (employeIds || [])
         .map((e) => e?.toString())
         .filter(Boolean)
         .map((id) => new Types.ObjectId(id));

      const filter: Record<string, unknown> = {
         rol: { $ne: ValidRoles.superAdmin },
         $or: [{ empresa: oid }],
      };
      if (extraIds.length > 0) {
         (filter.$or as unknown[]).push({ _id: { $in: extraIds } });
      }

      const result = await this.userModel.deleteMany(filter);
      return result.deletedCount || 0;
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

   async findByIdForMove(
      id: string,
   ): Promise<{ _id: string; empresa?: string | null; rol?: string } | null> {
      const user = await this.userModel.findById(id).select('empresa rol').lean();
      if (!user) return null;
      return {
         _id: user._id.toString(),
         empresa: user.empresa ? user.empresa.toString() : null,
         rol: user.rol,
      };
   }

   async reassignToEmpresa(
      userId: string,
      toEmpresaId: string,
      opts: { rutaId?: string | null } = {},
      session?: ClientSession,
   ): Promise<void> {
      const user = await this.userModel.findById(userId).session(session || null);
      if (!user) {
         throw new NotFoundException(`Usuario con id ${userId} no existe`);
      }

      user.empresa = new Types.ObjectId(toEmpresaId) as any;

      if (user.rol === ValidRoles.cobrador) {
         user.ruta = opts.rutaId
            ? (new Types.ObjectId(opts.rutaId) as any)
            : (null as any);
         user.rutas = [];
      } else if (user.rol === ValidRoles.supervisor) {
         user.ruta = null as any;
         if (opts.rutaId) {
            user.rutas = [new Types.ObjectId(opts.rutaId) as any];
         } else {
            user.rutas = [];
         }
      } else {
         user.ruta = null as any;
         user.rutas = [];
      }

      await user.save({ session: session || undefined });
   }

   async clearAssignmentsToRuta(
      rutaId: string,
      session?: ClientSession,
   ): Promise<void> {
      const oid = new Types.ObjectId(rutaId);
      const sessionOpt = { session: session || undefined };
      // Match ObjectId o string por si hay docs legacy; $unset evita ruta: null
      await this.userModel.updateMany(
         { $or: [{ ruta: oid }, { ruta: rutaId }] },
         { $unset: { ruta: 1 } },
         sessionOpt,
      );
      await this.userModel.updateMany(
         { rutas: oid },
         { $pull: { rutas: oid } },
         sessionOpt,
      );
      await this.userModel.updateMany(
         { rutas: rutaId },
         { $pull: { rutas: rutaId } },
         sessionOpt,
      );
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

   /** MessageGateway: handshake WS (activo + entidad + sesión). */
   async findActiveEntityBySession(
      id: string,
      sid: string,
   ): Promise<UserEntity | null> {
      const userDoc = await this.userModel
         .findById(id)
         .populate([{ path: 'ruta' }, { path: 'rutas', select: '_id' }]);
      if (!userDoc || !userDoc.estado) return null;
      if (!this.isSessionActive(userDoc.activeSessionId, userDoc.activeSessionExpiresAt)) {
         return null;
      }
      if (userDoc.activeSessionId !== sid) return null;
      return UserEntity.fromObject(userDoc.toObject());
   }

   /** MessageGateway: handshake WS (activo + entidad). */
   async findActiveEntityById(id: string): Promise<UserEntity | null> {
      const userDoc = await this.userModel
         .findById(id)
         .populate([{ path: 'ruta' }, { path: 'rutas', select: '_id' }]);
      if (!userDoc || !userDoc.estado) return null;
      return UserEntity.fromObject(userDoc.toObject());
   }

   /** Tracking: perfil lean (nombre/ruta/empresa). */
   async findTrackingProfileById(id: string): Promise<{
      _id: string;
      nombre: string;
      rutaId?: string;
      empresaId?: string | null;
   } | null> {
      const user = await this.userModel
         .findById(id)
         .select('nombre ruta empresa')
         .lean();
      if (!user) return null;
      return {
         _id: user._id.toString(),
         nombre: user.nombre as string,
         rutaId: user.ruta ? user.ruta.toString() : undefined,
         empresaId: user.empresa ? user.empresa.toString() : null,
      };
   }

  /** Tracking: batch de perfiles en una empresa. */
  async findTrackingProfilesByIds(
      ids: string[],
      empresaId: string,
  ): Promise<Array<{ _id: string; nombre: string; rutaId?: string }>> {
      if (!ids.length) return [];
      const users = await this.userModel
         .find({
            _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
            empresa: new Types.ObjectId(empresaId),
         })
         .select('nombre ruta')
         .lean();
      return users.map((u) => ({
         _id: u._id.toString(),
         nombre: u.nombre as string,
         rutaId: u.ruta ? u.ruta.toString() : undefined,
      }));
   }

  /**
   * Announcement receipts: audiencia lean por roles (+ empresas opcionales).
   * Sin `empresaIds` → GLOBAL (todas las empresas).
   */
  async findForAnnouncementAudience(params: {
    roles: string[];
    empresaIds?: string[];
  }): Promise<
    Array<{ id: string; nombre: string; username: string; rol: string; empresaId: string | null }>
  > {
    const roles = (params.roles || []).filter(Boolean);
    if (!roles.length) return [];

    const filter: Record<string, any> = {
      rol: { $in: roles },
      estado: true,
    };

    const empresaIds = (params.empresaIds || []).filter((id) =>
      Types.ObjectId.isValid(id),
    );
    if (empresaIds.length) {
      filter.empresa = {
        $in: empresaIds.map((id) => new Types.ObjectId(id)),
      };
    }

    const users = await this.userModel
      .find(filter)
      .select('nombre username rol empresa')
      .lean();

    return users.map((u) => ({
      id: u._id.toString(),
      nombre: (u.nombre as string) || '',
      username: (u.username as string) || '',
      rol: (u.rol as string) || '',
      empresaId: u.empresa ? u.empresa.toString() : null,
    }));
  }

   private getJwtToken(payload: JwtPayload): string {
      const token = this.jwtService.sign(payload);
      return token;
   }

   /** Valida que el rol del usuario coincida con el cliente que inicia sesión. */
   private assertLoginClientRole(
      rol: string,
      client: 'cobrador' | 'admin' | undefined,
      userId: Types.ObjectId | string,
      request: Request,
   ): void {
      if (!client) return;

      const adminRoles = [
         ValidRoles.admin,
         ValidRoles.superAdmin,
         ValidRoles.supervisor,
      ] as string[];

      const allowed =
         client === 'cobrador'
            ? rol === ValidRoles.cobrador
            : adminRoles.includes(rol);

      if (allowed) return;

      void this.logAuth.create({
         user: userId as any,
         ipAddress: request.ip,
         userAgent: request.headers['user-agent'],
         reason: 'ROLE_CLIENT_MISMATCH',
         isSuccessful: false,
      });

      throw new UnauthorizedException({
         statusCode: 401,
         message:
            client === 'cobrador'
               ? 'Este usuario no puede iniciar sesión en la app de cobro.'
               : 'Este usuario no puede iniciar sesión en el panel administrativo.',
         error: 'ROLE_CLIENT_MISMATCH',
      });
   }

   private isSessionActive(
      activeSessionId?: string | null,
      activeSessionExpiresAt?: Date | string | null,
   ): boolean {
      if (!activeSessionId || !activeSessionExpiresAt) return false;
      return new Date(activeSessionExpiresAt).getTime() > Date.now();
   }

   private resolveEmpresaId(empresa: unknown): string | null {
      if (!empresa) return null;
      if (typeof empresa === 'string') return empresa;
      if (empresa instanceof Types.ObjectId) return empresa.toString();
      const raw = empresa as { _id?: unknown; id?: unknown };
      const id = raw._id ?? raw.id;
      return id != null ? String(id) : null;
   }

   /**
    * Expone hasActiveSession / activeSessionExpiresAt y oculta activeSessionId.
    */
   private withSessionMeta(userDoc: any) {
      const obj = typeof userDoc.toObject === 'function'
         ? userDoc.toObject()
         : { ...userDoc };
      const hasActiveSession = this.isSessionActive(
         obj.activeSessionId,
         obj.activeSessionExpiresAt,
      );
      const activeSessionExpiresAt = hasActiveSession
         ? obj.activeSessionExpiresAt
         : null;
      delete obj.activeSessionId;
      delete obj.password;
      return {
         ...obj,
         hasActiveSession,
         activeSessionExpiresAt,
      };
   }

   private async checkCaja(idRuta: string, timeZone: string) {
      return this.cajaDayCheckService.isUltimaCajaDeHoy(idRuta, timeZone);
   }

   private handleExceptions(error: any) {
      if (error.code === 11000) {
         throw new BadRequestException(`Ya existe un usuario ${JSON.stringify(error.keyValue)}`);
      }

      if (error?.status && error?.response) {
         throw error;
      }

      this.logger.error(error);
      throw new InternalServerErrorException("Revisar los logs")
   }

}
