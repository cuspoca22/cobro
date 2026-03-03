import { Request } from 'express';
import { Injectable, UnauthorizedException, Logger, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from "bcrypt";

import { CreateUserDto, GetUserDto, LoginDto, LoginResponseDto } from './dto';
import { JwtPayload } from './interfaces';
import { UpdateUserDto } from './dto/update-user.dto';
import { LogAuth } from 'src/log-auth/entities/log-auth.entity';
import { User } from './schemas/user.schema';
import { UserEntity } from './entities/user.entity';
import { DateFnsAdapter } from 'src/common/wrappers/date-fns.adapter';
import { Caja } from 'src/caja/schemas/caja.schema';
import { startOfDay } from 'date-fns';

@Injectable()
export class AuthService {

   private logger = new Logger("AuthService");

   constructor(
      @InjectModel(User.name)
      private readonly userModel: Model<User>,

      @InjectModel(LogAuth.name)
      private readonly logAuth: Model<LogAuth>,

      private readonly jwtService: JwtService,
      private readonly dateFnsAdapter: DateFnsAdapter,
      @InjectModel(Caja.name)
      private readonly cajaModel: Model<Caja>,
   ) { }

   async create(createUserDto: CreateUserDto): Promise<User> {

      try {

         const user = new this.userModel(createUserDto);
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
         .populate({
            path: "ruta",
            select: 'status isLocked timeZone'
         }).lean()

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
            .populate('ruta')
            .select("-password")
      }

      if (!user) {
         const regex = new RegExp(termino.trim().toUpperCase(), "i");
         user = await this.userModel.findOne({
            $or: [{ nombre: regex }, { username: regex }],
         })
            .populate({
               path: "rol",
               select: "rol"
            })
            .select("-password");
      }


      if (!user) {
         throw new NotFoundException(`No existe un usuario con el termino ${termino}`)
      }

      return user;
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

      try {
         await user.updateOne(updateUserDto, { returnDocument: 'after' });

         return {
            ...user.toJSON(),
            ...updateUserDto
         }
      } catch (error) {
         this.handleExceptions(error)
      }

   }

   public async deleteUser(id: string): Promise<string> {
      try {

         await this.userModel.findByIdAndDelete(id);
         return id;

      } catch (error) {

         this.handleExceptions(error)

      }
   }

   private getJwtToken(payload: JwtPayload): string {
      const token = this.jwtService.sign(payload);
      return token;
   }

   private async checkCaja(idRuta: string, timeZone: string) {
      const caja = await this.cajaModel.findOne({
         ruta: idRuta
      }).sort({ fecha: -1 })

      const startOfDayUtc = this.dateFnsAdapter.getStartOfTodayInTimeZone(timeZone);

      if (!this.dateFnsAdapter.isEqual(caja.fecha, startOfDayUtc)) {
         return false
      }

      return true;

   }

   private handleExceptions(error: any) {
      if (error.code === 11000) {
         throw new BadRequestException(`Ya existe un usuario ${JSON.stringify(error.keyValue)}`);
      }

      this.logger.error(error);
      throw new InternalServerErrorException("Revisar el console.log")
   }

}
