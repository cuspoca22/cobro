import { ConflictException, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { AuthService } from 'src/auth/auth.service';
import { GetUserDto } from 'src/auth/dto';
import { ValidRoles } from 'src/auth/interfaces';
import { ClienteService } from 'src/cliente/cliente.service';
import { MessageGateway } from 'src/message/message.gateway';
import { SubTipo } from 'src/movimientoCaja/interfaces';
import { MovimientoCajaService } from 'src/movimientoCaja/movimiento-caja.service';
import { RutaService } from 'src/ruta/ruta.service';
import { AgendaClock } from './agenda-clock';
import { AgendadoService } from './agendado.service';
import { PUSH_DISPATCHER } from './push/push-dispatcher';
import { Agendado } from './schemas/agendado.schema';

describe('AgendadoService', () => {
  const now = new Date('2026-06-15T18:00:00.000Z');
  const rutaId = new Types.ObjectId().toString();
  const empresaId = new Types.ObjectId().toString();
  const clienteId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const agendadoId = new Types.ObjectId();

  const user = {
    id: userId,
    rol: ValidRoles.cobrador,
    ruta: rutaId,
    empresa: empresaId,
    rutas: [],
  } as GetUserDto;

  const agendadoCreadoEn = new Date('2026-06-15T15:00:00.000Z');

  let service: AgendadoService;
  let model: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findById: jest.Mock;
  };
  let movimientos: { findPrestamosPorClientes: jest.Mock };
  let docs: any[];

  const pendiente = (createdAt = agendadoCreadoEn) => ({
    _id: agendadoId,
    cliente: new Types.ObjectId(clienteId),
    ruta: new Types.ObjectId(rutaId),
    empresa: new Types.ObjectId(empresaId),
    creadoPor: new Types.ObjectId(userId),
    fechaVisita: '2026-06-16',
    horaRecordatorio: '08:00',
    recordarEn: new Date('2026-06-16T14:00:00.000Z'),
    condiciones: {
      valor_credito: 1000,
      total_cuotas: 10,
      frecuencia_cobro: 'diario',
      modo: 'automatico',
      interes: 20,
    },
    estado: 'pendiente',
    recordatorio: {
      estado: 'programado',
      canal: 'local',
      payload: {
        title: 'Renovación agendada',
        body: 'ANA · 2026-06-16 08:00',
        agendadoId: agendadoId.toString(),
        clienteId,
      },
      intentos: 0,
    },
    createdAt,
  });

  const leanUpdate = (estado: string) => ({
    lean: jest.fn().mockResolvedValue({
      ...pendiente(),
      estado,
    }),
  });

  beforeEach(async () => {
    docs = [pendiente()];
    model = {
      create: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockImplementation(async () => docs),
      }),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn().mockReturnValue(leanUpdate('cumplido')),
      findById: jest.fn(),
    };
    movimientos = { findPrestamosPorClientes: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgendadoService,
        { provide: getModelToken(Agendado.name), useValue: model },
        { provide: AgendaClock, useValue: { now: () => now } },
        {
          provide: ClienteService,
          useValue: {
            findByIdLean: jest.fn().mockResolvedValue({
              _id: new Types.ObjectId(clienteId),
              nombre: 'ANA LOPEZ',
              alias: 'ANA',
              status: false,
              state: true,
              ruta: rutaId,
            }),
            findByIdsLean: jest.fn().mockResolvedValue([{
              _id: new Types.ObjectId(clienteId),
              nombre: 'ANA LOPEZ',
              alias: 'ANA',
              status: false,
              state: true,
              ruta: rutaId,
            }]),
          },
        },
        {
          provide: RutaService,
          useValue: {
            findContextById: jest.fn().mockResolvedValue({
              _id: rutaId,
              timeZone: 'America/Guatemala',
              currency: 'GTQ',
            }),
            getEmpresaIdByRutaId: jest.fn().mockResolvedValue({
              exists: true,
              empresaId,
            }),
            findAgendaContextByIds: jest.fn().mockResolvedValue([{
              id: rutaId,
              nombre: 'Ruta 1',
              timeZone: 'America/Guatemala',
              empresaId,
            }]),
          },
        },
        {
          provide: AuthService,
          useValue: {
            findNombresByIds: jest.fn().mockResolvedValue([{ id: userId, nombre: 'COBRADOR' }]),
            findCobradorActivoPorRuta: jest.fn().mockResolvedValue(userId),
          },
        },
        { provide: MovimientoCajaService, useValue: movimientos },
        { provide: MessageGateway, useValue: { emitAgendadoChanged: jest.fn() } },
        { provide: PUSH_DISPATCHER, useValue: { dispatch: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(AgendadoService);
  });

  it('no quita el agendado si el préstamo es anterior', async () => {
    movimientos.findPrestamosPorClientes.mockResolvedValue([{
      clienteId,
      creditoId: new Types.ObjectId().toString(),
      movimientoId: new Types.ObjectId().toString(),
      createdAt: new Date('2026-06-15T10:00:00.000Z'),
    }]);

    const lista = await service.list(user, {});

    expect(lista).toHaveLength(1);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('cumple el agendado si el préstamo nació después, incluso el mismo día', async () => {
    movimientos.findPrestamosPorClientes.mockResolvedValue([{
      clienteId,
      creditoId: new Types.ObjectId().toString(),
      movimientoId: new Types.ObjectId().toString(),
      createdAt: new Date('2026-06-15T16:00:00.000Z'),
    }]);

    const lista = await service.list(user, {});

    expect(lista).toHaveLength(0);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: agendadoId, estado: 'pendiente' },
      expect.objectContaining({
        $set: expect.objectContaining({ estado: 'cumplido' }),
      }),
      { new: true },
    );
  });

  it('reabre el agendado si se elimina el crédito que lo cumplió y no hay otro posterior', async () => {
    const creditoId = new Types.ObjectId();
    model.findOne.mockResolvedValue({
      ...pendiente(),
      estado: 'cumplido',
      creditoId,
      createdAt: agendadoCreadoEn,
    });
    model.findOneAndUpdate.mockReturnValue(leanUpdate('pendiente'));
    movimientos.findPrestamosPorClientes.mockResolvedValue([{
      clienteId,
      creditoId: new Types.ObjectId().toString(),
      movimientoId: new Types.ObjectId().toString(),
      createdAt: new Date('2026-06-15T10:00:00.000Z'),
    }]);

    await service.reabrirPorCreditoEliminado({
      clienteId,
      creditoId: creditoId.toString(),
      movimientoId: new Types.ObjectId().toString(),
      rutaId,
      empresaId,
      subTipo: SubTipo.PRESTAMO,
    });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'cumplido' }),
      expect.objectContaining({
        $set: expect.objectContaining({ estado: 'pendiente' }),
      }),
      { new: true },
    );
  });

  it('no reabre si queda otro préstamo posterior al agendado', async () => {
    model.findOne.mockResolvedValue({
      ...pendiente(),
      estado: 'cumplido',
      creditoId: new Types.ObjectId(),
      createdAt: agendadoCreadoEn,
    });
    movimientos.findPrestamosPorClientes.mockResolvedValue([{
      clienteId,
      creditoId: new Types.ObjectId().toString(),
      movimientoId: new Types.ObjectId().toString(),
      createdAt: new Date('2026-06-15T16:30:00.000Z'),
    }]);

    await service.reabrirPorCreditoEliminado({
      clienteId,
      creditoId: new Types.ObjectId().toString(),
      movimientoId: new Types.ObjectId().toString(),
      rutaId,
      empresaId,
      subTipo: SubTipo.PRESTAMO,
    });

    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('guarda la cita de hoy con recordatorio omitido si la hora ya pasó', async () => {
    await service.create(user, {
      clienteId,
      rutaId,
      fechaVisita: '2026-06-15',
      horaRecordatorio: '08:00',
      condiciones: {
        valor_credito: 500,
        total_cuotas: 10,
        frecuencia_cobro: 'diario' as any,
        modo: 'automatico',
        interes: 20,
      },
    });

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recordatorio: expect.objectContaining({ estado: 'omitido' }),
      }),
    );
  });

  it('rechaza agendar en una ruta que no es la del cobrador', async () => {
    const otraRuta = new Types.ObjectId().toString();

    await expect(service.create(
      { ...user, ruta: otraRuta },
      {
        clienteId,
        rutaId,
        fechaVisita: '2026-06-16',
        horaRecordatorio: '08:00',
        condiciones: {
          valor_credito: 500,
          total_cuotas: 10,
          frecuencia_cobro: 'diario' as any,
          modo: 'automatico',
          interes: 20,
        },
      },
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(model.create).not.toHaveBeenCalled();
  });

  it('responde 409 si el cliente ya tiene un pendiente', async () => {
    model.create.mockRejectedValue({ code: 11000 });

    await expect(service.create(user, {
      clienteId,
      rutaId,
      fechaVisita: '2026-06-16',
      horaRecordatorio: '08:00',
      condiciones: {
        valor_credito: 500,
        total_cuotas: 10,
        frecuencia_cobro: 'diario' as any,
        modo: 'automatico',
        interes: 20,
      },
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
