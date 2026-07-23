import { Injectable, Logger, BadRequestException, InternalServerErrorException, NotFoundException, Inject, forwardRef, ForbiddenException } from '@nestjs/common';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { MoveEmpleadoDto } from './dto/move-empleado.dto';
import { MoveRutaDto } from './dto/move-ruta.dto';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';

import { Empresa } from './schemas/empresa.schema';
import { RutaService } from '../ruta/ruta.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from '../auth/dto/create-user.dto';
import { ClienteService } from '../cliente/cliente.service';
import { CreateRutaDto } from '../ruta/dto/create-ruta.dto';
import { User } from 'src/auth/schemas/user.schema';
import { EmpresaEntity } from './entities/empresa.entity';
import { Ruta } from '../ruta/schema/ruta.schema';
import { MessageGateway } from '../message/message.gateway';
import { ValidRoles } from 'src/auth/interfaces';

@Injectable()
export class EmpresaService {

  private logger = new Logger("EmpresaService");

  constructor(
    @InjectModel(Empresa.name)
    private readonly empresaModel: Model<Empresa>,

    @InjectConnection()
    private readonly connection: Connection,

    @Inject(forwardRef(() => RutaService))
    private rutaSvc: RutaService,

    @Inject(forwardRef(() => AuthService))
    private authSvc: AuthService,
    private clienteSrc: ClienteService,

    @Inject(forwardRef(() => MessageGateway))
    private readonly messageGateway: MessageGateway,
  ) { }

  /** SUPERADMIN: cualquier empresa. Otros: solo la propia. */
  assertCanAccessEmpresa(
    user: { rol?: string; empresa?: unknown },
    empresaId: string,
  ): void {
    if (user.rol === ValidRoles.superAdmin) return;
    const userEmpresa =
      user.empresa == null
        ? null
        : typeof user.empresa === 'object' && (user.empresa as any)._id
          ? String((user.empresa as any)._id)
          : String(user.empresa);
    if (!userEmpresa || userEmpresa !== empresaId) {
      throw new ForbiddenException('No tienes permiso para operar sobre esta empresa');
    }
  }

  async create(createEmpresaDto: CreateEmpresaDto) {

    try {

      const empresa = new this.empresaModel(createEmpresaDto);

      await empresa.save();

      return empresa;

    } catch (error) {
      this.handleExceptions(error);
    }

  }

  async getEmpresaById(id: string) {

    try {

      const empresa = await this.empresaModel.findById(id)
        .populate('employes')
        .populate('rutas')
        .populate('owner')

      return EmpresaEntity.fromObject(empresa);

    } catch (error) {
      this.handleExceptions(error);

    }

  }

  async findEmpresaWithRutasOpened() {

    try {
      const empresasConRutasAbiertas = await this.empresaModel.aggregate([
        {
          $lookup: {
            from: 'rutas', // Nombre de la colección de rutas en la base de datos
            localField: 'rutas',
            foreignField: '_id',
            as: 'rutas',
          },
        },
        {
          $unwind: '$rutas',
        },
        {
          $match: {
            'rutas.status': true,
          },
        },
        {
          $group: {
            _id: '$_id',
            nombre: { $first: '$name' },
            email: { $first: '$email' },
            phone: { $first: '$phone' },
            rutas: { $push: '$rutas.nombre' },
          },
        },
      ]);

      return empresasConRutasAbiertas;
    } catch (error) {
      console.error('Error al obtener empresas con rutas abiertas:', error);
      throw error;
    }

  }

  async findAll(empresa: string) {

    const empresaDB = await this.empresaModel.findById(empresa)
      .populate([
        {
          path: 'employes',
          populate: [
            { path: 'ruta' },
            { path: 'rutas', select: 'nombre' },
          ],
        },
        {
          path: 'rutas'
        }
      ]);

    if (!empresaDB) return [];

    return empresaDB.toObject().employes;

  }

  async getClientes(idEmpresa: string) {

    const empresa = await this.empresaModel.findById(idEmpresa)

  }

  async findRutasByEmpresa(idEmpresa: string) {

    const empresa = await this.empresaModel.findById(idEmpresa)
      .populate('rutas')
      .populate('employes')
      .populate('owner')

    if (!empresa) {
      throw new NotFoundException(`Empresa con el id ${idEmpresa} no existe`);
    }

    return EmpresaEntity.fromObject(empresa);

  }

  async findOne(id: string) {

    const empresa = await this.empresaModel.findById(id)
      .populate([
        {
          path: 'employes'
        },
        {
          path: 'rutas',
          populate: [
            { path: 'caja_actual' },
            { path: 'ultima_caja' },
          ]
        }
      ])

    if (!empresa) {
      throw new NotFoundException(`Empresa con el id ${id} no existe`)
    }

    return empresa;

  }

  async update(id: string, updateEmpresaDto: UpdateEmpresaDto) {

    const empresa = await this.findOne(id);

    try {

      await empresa.updateOne(updateEmpresaDto, { returnDocument: 'after' });

      return true;

    } catch (error) {
      this.handleExceptions(error);
    }


  }

  async updateMoraConfig(id: string, dto: {
    cobraMora?: boolean;
    permiteMoraVoluntaria?: boolean;
    porcentajeMora?: number;
    baseCalculoMora?: string;
  }) {
    const empresa = await this.empresaModel.findById(id);
    if (!empresa) {
      throw new NotFoundException(`Empresa con el id ${id} no existe`);
    }

    if (dto.cobraMora !== undefined) empresa.cobraMora = dto.cobraMora;
    if (dto.permiteMoraVoluntaria !== undefined) {
      empresa.permiteMoraVoluntaria = dto.permiteMoraVoluntaria;
    }
    if (dto.porcentajeMora !== undefined) empresa.porcentajeMora = dto.porcentajeMora;
    if (dto.baseCalculoMora !== undefined) {
      empresa.baseCalculoMora = dto.baseCalculoMora as any;
    }

    await empresa.save();

    const result = {
      id: empresa._id.toString(),
      cobraMora: empresa.cobraMora ?? false,
      permiteMoraVoluntaria: empresa.permiteMoraVoluntaria ?? false,
      porcentajeMora: empresa.porcentajeMora ?? 0,
      baseCalculoMora: empresa.baseCalculoMora ?? 'VALOR_CUOTA',
    };

    this.messageGateway.emitMoraConfigActualizada({
      empresa: result.id,
      cobraMora: result.cobraMora,
      permiteMoraVoluntaria: result.permiteMoraVoluntaria,
      porcentajeMora: result.porcentajeMora,
      baseCalculoMora: String(result.baseCalculoMora),
    });

    return result;
  }

  /** Config de mora lean para cobros / listados. */
  async getMoraConfigById(id: string): Promise<{
    cobraMora: boolean;
    permiteMoraVoluntaria: boolean;
    porcentajeMora: number;
    baseCalculoMora: string;
  } | null> {
    const empresa = await this.empresaModel
      .findById(id)
      .select('cobraMora permiteMoraVoluntaria porcentajeMora baseCalculoMora')
      .lean();

    if (!empresa) return null;

    return {
      cobraMora: empresa.cobraMora ?? false,
      permiteMoraVoluntaria: empresa.permiteMoraVoluntaria ?? false,
      porcentajeMora: empresa.porcentajeMora ?? 0,
      baseCalculoMora: empresa.baseCalculoMora ?? 'VALOR_CUOTA',
    };
  }

  async addEmploye(userDto: CreateUserDto, actor?: { rol?: string }) {

    try {

      const empresa = await this.empresaModel.findById(userDto.empresa).populate('employes');
      if (!empresa) {
        throw new NotFoundException('La empresa no existe');
      }

      await this.assertRutasBelongToEmpresa(userDto.empresa, [
        ...(userDto.ruta ? [userDto.ruta] : []),
        ...(userDto.rutas || []),
      ]);

      const empleado = await this.authSvc.create(userDto, actor);

      const existeEmpleado = (empresa.employes as User[]).some(e => e._id.equals(empleado._id));

      if (!existeEmpleado) {

        (empresa.employes as any).push(empleado._id);
        await empresa.save();

        empleado.empresa = empresa._id;
        await empleado.save();

      } else {
        throw new BadRequestException('El empleado ya esta en esta empresa')
      }

    } catch (error) {

      this.handleExceptions(error)

    }

    return true;
  }

  /** Valida que las rutas indicadas pertenezcan a la empresa. */
  async assertRutasBelongToEmpresa(
    empresaId: string,
    rutaIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(rutaIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const empresa = await this.empresaModel
      .findById(empresaId)
      .select('rutas')
      .lean();

    if (!empresa) {
      throw new NotFoundException('La empresa no existe');
    }

    const empresaRutaIds = new Set(
      (empresa.rutas || []).map((id: any) => id.toString()),
    );

    const invalid = uniqueIds.filter((id) => !empresaRutaIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Las rutas no pertenecen a la empresa: ${invalid.join(', ')}`,
      );
    }
  }

  async deleteEmpleado(idEmpresa: string, empleado: string) {

    const user = await this.authSvc.findByIdLean(empleado);
    if (!user) throw new NotFoundException('No existe el usuario');
    const empresa = await this.empresaModel.findById(idEmpresa);
    if (!empresa) throw new NotFoundException('No existe la empresa');

    try {
      empresa.employes = (empresa.employes as Types.ObjectId[]).filter(
        empId => empId.toString() !== user._id,
      );
      await empresa.save();
      await this.authSvc.deleteById(empleado);
    } catch (error) {
      this.handleExceptions(error)
    }

    return true;

  }


  async addRuta(idEmpresa: string, rutaDto: CreateRutaDto) {

    const empresa = await this.empresaModel.findById(idEmpresa).populate('rutas');
    // const ruta = await this.rutaSvc.findOne(idRuta);

    if (!empresa) {
      throw new NotFoundException('La empresa no existe');
    }

    const ruta = await this.rutaSvc.create(rutaDto);

    const existeRuta = (empresa.rutas as Ruta[]).some(r => r._id.equals(ruta._id));

    if (!existeRuta) {
      try {
        (empresa.rutas as any).push(ruta._id);
        await empresa.save();
        ruta.empresa = empresa._id;
        await ruta.save()
      } catch (error) {
        console.error('Error al guardar en la base de datos:', error);
        throw new Error('Error al guardar en la base de datos');
      }
    } else {
      throw new BadRequestException('La ruta ya esta en esta empresa')
    }

    return true;


  }

  async addOwner(idEmpresa: string, user: string) {
    const empresa = await this.findOne(idEmpresa);
    const owner = await this.authSvc.findByIdLean(user);

    if (!owner) throw new NotFoundException('El usuario no existe');

    try {

      empresa.owner = new Types.ObjectId(owner._id);
      await empresa.save();
      await this.authSvc.setEmpresa(user, empresa._id.toString());
      return true;

    } catch (error) {
      this.handleExceptions(error)
    }

  }

  async remove(id: string): Promise<{ message: string }> {
    const empresa = await this.empresaModel.findById(id);
    if (!empresa) {
      throw new NotFoundException(`Empresa con el id ${id} no existe`);
    }

    this.logger.log(`Iniciando eliminación en cascada de la empresa ${id}...`);

    const rutaIds = new Set<string>();
    for (const r of empresa.rutas || []) {
      rutaIds.add(r.toString());
    }
    const rutasDb = await this.rutaSvc.findAllByEmpresa(id);
    for (const r of rutasDb || []) {
      rutaIds.add((r as any)._id.toString());
    }

    for (const rutaId of rutaIds) {
      try {
        await this.rutaSvc.delete(rutaId);
      } catch (error) {
        if (error instanceof NotFoundException) {
          this.logger.warn(`Ruta ${rutaId} ya no existía al eliminar empresa ${id}`);
          continue;
        }
        throw error;
      }
    }

    const deletedUsers = await this.authSvc.deleteManyByEmpresa(
      id,
      (empresa.employes || []) as any[],
    );
    this.logger.log(`Empresa ${id}: ${deletedUsers} usuario(s) eliminados`);

    await this.connection.collection('cobrador_tracking').deleteMany({
      empresa: new Types.ObjectId(id),
    });

    await this.empresaModel.findByIdAndDelete(id);
    this.logger.log(`Empresa ${id} eliminada con cascada completa`);

    return {
      message:
        'Empresa eliminada con rutas, clientes, créditos, cajas, movimientos y empleados relacionados',
    };
  }

  async moveEmpleado(dto: MoveEmpleadoDto): Promise<{ message: string }> {
    if (dto.fromEmpresaId === dto.toEmpresaId) {
      throw new BadRequestException('La empresa de origen y destino deben ser distintas');
    }

    const [fromEmpresa, toEmpresa, user] = await Promise.all([
      this.empresaModel.findById(dto.fromEmpresaId),
      this.empresaModel.findById(dto.toEmpresaId),
      this.authSvc.findByIdForMove(dto.empleadoId),
    ]);

    if (!fromEmpresa) throw new NotFoundException('Empresa de origen no existe');
    if (!toEmpresa) throw new NotFoundException('Empresa de destino no existe');
    if (!user) throw new NotFoundException('El empleado no existe');

    const userEmpresa = user.empresa?.toString() ?? null;
    const inFromList = (fromEmpresa.employes || []).some(
      (e: any) => e.toString() === dto.empleadoId,
    );
    if (userEmpresa !== dto.fromEmpresaId && !inFromList) {
      throw new BadRequestException('El empleado no pertenece a la empresa de origen');
    }

    if (dto.rutaId) {
      await this.assertRutasBelongToEmpresa(dto.toEmpresaId, [dto.rutaId]);
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await this.empresaModel.findByIdAndUpdate(
        dto.fromEmpresaId,
        { $pull: { employes: new Types.ObjectId(dto.empleadoId) } },
        { session },
      );
      await this.empresaModel.findByIdAndUpdate(
        dto.toEmpresaId,
        { $addToSet: { employes: new Types.ObjectId(dto.empleadoId) } },
        { session },
      );
      await this.authSvc.reassignToEmpresa(
        dto.empleadoId,
        dto.toEmpresaId,
        { rutaId: dto.rutaId ?? null },
        session,
      );
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      this.handleExceptions(error);
    } finally {
      session.endSession();
    }

    return { message: 'Empleado movido correctamente' };
  }

  async moveRuta(dto: MoveRutaDto): Promise<{ message: string }> {
    if (dto.fromEmpresaId === dto.toEmpresaId) {
      throw new BadRequestException('La empresa de origen y destino deben ser distintas');
    }

    const [fromEmpresa, toEmpresa, rutaInfo] = await Promise.all([
      this.empresaModel.findById(dto.fromEmpresaId),
      this.empresaModel.findById(dto.toEmpresaId),
      this.rutaSvc.getEmpresaIdByRutaId(dto.rutaId),
    ]);

    if (!fromEmpresa) throw new NotFoundException('Empresa de origen no existe');
    if (!toEmpresa) throw new NotFoundException('Empresa de destino no existe');
    if (!rutaInfo.exists) throw new NotFoundException('La ruta no existe');
    if (rutaInfo.empresaId !== dto.fromEmpresaId) {
      throw new BadRequestException('La ruta no pertenece a la empresa de origen');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await this.rutaSvc.setEmpresa(dto.rutaId, dto.toEmpresaId, session);
      await this.pullRuta(dto.fromEmpresaId, dto.rutaId, session);
      await this.empresaModel.findByIdAndUpdate(
        dto.toEmpresaId,
        { $addToSet: { rutas: new Types.ObjectId(dto.rutaId) } },
        { session },
      );
      await this.authSvc.clearAssignmentsToRuta(dto.rutaId, session);
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      this.handleExceptions(error);
    } finally {
      session.endSession();
    }

    return { message: 'Ruta movida correctamente' };
  }

  /** Asigna una ruta huérfana (sin empresa) a una empresa. */
  async assignRuta(dto: { rutaId: string; empresaId: string }): Promise<{ message: string }> {
    const [empresa, rutaInfo] = await Promise.all([
      this.empresaModel.findById(dto.empresaId),
      this.rutaSvc.getEmpresaIdByRutaId(dto.rutaId),
    ]);

    if (!empresa) throw new NotFoundException('La empresa no existe');
    if (!rutaInfo.exists) throw new NotFoundException('La ruta no existe');
    if (rutaInfo.empresaId) {
      throw new BadRequestException(
        'La ruta ya pertenece a una empresa. Usa Transferencias → Mover ruta.',
      );
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await this.rutaSvc.setEmpresa(dto.rutaId, dto.empresaId, session);
      await this.empresaModel.findByIdAndUpdate(
        dto.empresaId,
        { $addToSet: { rutas: new Types.ObjectId(dto.rutaId) } },
        { session },
      );
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      this.handleExceptions(error);
    } finally {
      session.endSession();
    }

    return { message: 'Ruta asignada a la empresa' };
  }

  private handleExceptions(error: any) {

    if (error.code === 11000) {
      throw new BadRequestException("Ya existe esta Empresa");
    }

    if (error?.status && error?.response) {
      throw error;
    }

    this.logger.error(error);
    throw new InternalServerErrorException("Por favor revisa los logs");

  }

  getAllEmpresas() {
    return this.empresaModel.find().lean().then((list) =>
      (list || []).map((doc: any) => ({
        id: doc._id?.toString(),
        name: doc.name,
        email: doc.email,
        phone: doc.phone,
        dayOfPay: doc.dayOfPay,
        country: doc.country,
        isSubscriptionPaid: doc.isSubscriptionPaid,
        cobraMora: doc.cobraMora ?? false,
        permiteMoraVoluntaria: doc.permiteMoraVoluntaria ?? false,
        porcentajeMora: doc.porcentajeMora ?? 0,
        baseCalculoMora: doc.baseCalculoMora,
        employes: doc.employes || [],
        rutas: doc.rutas || [],
      })),
    );
  }

  /** Reportes / facades: lectura lean sin populate. */
  async findByIdLean(id: string, select?: string): Promise<any | null> {
    let query = this.empresaModel.findById(id);
    if (select) query = query.select(select);
    return query.lean();
  }

  /** Cascada delete ruta: $pull Empresa.rutas. */
  async pullRuta(
    empresaId: string | Types.ObjectId,
    rutaId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    await this.empresaModel.findByIdAndUpdate(
      empresaId,
      { $pull: { rutas: rutaId } },
      { session: session || undefined },
    );
  }

  /** Cascada delete user: $pull Empresa.employes. */
  async pullEmploye(
    empresaId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const empId = empresaId?.toString?.() ?? String(empresaId);
    const uid = userId?.toString?.() ?? String(userId);
    if (!Types.ObjectId.isValid(empId) || !Types.ObjectId.isValid(uid)) {
      return;
    }
    await this.empresaModel.findByIdAndUpdate(
      empId,
      { $pull: { employes: new Types.ObjectId(uid) } },
      { session: session || undefined },
    );
  }

}
