import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';

import { MovimientoCajaService } from './movimiento-caja.service';
import { MovimientoCaja } from './schemas/caja-movimiento.schemas';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditoService } from 'src/credito/credito.service';
import { RutaService } from 'src/ruta/ruta.service';
import { CajaService } from 'src/caja/caja.service';
import { SubTipo, TipoMovimiento } from './interfaces';
import { CreateMovimientoCajaDto } from './dto';
import { FrecuenciaCobro } from 'src/credito/interfaces/frecuencia-cobro.enum';

const createMockSession = (): Partial<ClientSession> => ({
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
  inTransaction: jest.fn(() => true),
  hasEnded: false,
});

describe('MovimientoCajaService', () => {
  let service: MovimientoCajaService;
  let movimientoModel: any;
  let rutaService: any;
  let cajaService: any;
  let creditoService: any;
  let mockSession: Partial<ClientSession>;

  const rutaId = new Types.ObjectId().toString();
  const cajaId = new Types.ObjectId().toString();
  const creditoId = new Types.ObjectId().toString();
  const clienteId = new Types.ObjectId().toString();
  const startOfDay = new Date('2024-01-15T00:00:00.000Z');

  const openRutaContext = {
    _id: rutaId,
    caja_actual: cajaId,
    status: true,
    timeZone: 'America/Mexico_City',
    currency: 'MXN',
  };

  const basePagoDto: CreateMovimientoCajaDto = {
    rutaId,
    monto: 100,
    creditoId,
    clienteId,
    tipoMovimiento: TipoMovimiento.INGRESO,
    subTipo: SubTipo.PAGOCREDITO,
  };

  beforeEach(async () => {
    mockSession = createMockSession();

    const mockMovimientoModel: any = jest.fn().mockImplementation((data) => ({
      ...data,
      save: jest.fn().mockResolvedValue({ ...data, _id: new Types.ObjectId() }),
    }));
    Object.assign(mockMovimientoModel, {
      findOne: jest.fn().mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]),
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      findOneAndUpdate: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    });

    rutaService = {
      findOperacionContextById: jest.fn().mockResolvedValue(openRutaContext),
    };

    cajaService = {
      findByIdLean: jest.fn().mockResolvedValue({ _id: cajaId, ruta: rutaId }),
    };

    creditoService = {
      getCreditoById: jest.fn().mockResolvedValue({
        id: creditoId,
        _id: creditoId,
        saldo: 500,
      }),
      handlePaymentMade: jest.fn().mockResolvedValue({
        ok: true,
        message: 'Pago registrado',
      }),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovimientoCajaService,
        { provide: getModelToken(MovimientoCaja.name), useValue: mockMovimientoModel },
        { provide: RutaService, useValue: rutaService },
        { provide: CajaService, useValue: cajaService },
        { provide: CreditoService, useValue: creditoService },
        {
          provide: DateFnsAdapter,
          useValue: {
            getStartOfTodayInTimeZone: jest.fn().mockReturnValue(startOfDay),
          },
        },
        {
          provide: getConnectionToken(),
          useValue: {
            startSession: jest.fn().mockResolvedValue(mockSession),
          },
        },
      ],
    }).compile();

    service = module.get(MovimientoCajaService);
    movimientoModel = module.get(getModelToken(MovimientoCaja.name));
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('addPago', () => {
    it('happy path: crea movimiento, llama handlePaymentMade y no toca aggregates de Caja', async () => {
      const result = await service.addPago(basePagoDto);

      expect(movimientoModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            caja: cajaId,
            monto: 100,
            tipoMovimiento: TipoMovimiento.INGRESO,
            subTipo: SubTipo.PAGOCREDITO,
            credito: creditoId,
            cliente: clienteId,
            ruta: rutaId,
            fecha: startOfDay,
          }),
        ],
        { session: mockSession },
      );
      expect(creditoService.handlePaymentMade).toHaveBeenCalledWith(
        creditoId,
        rutaId,
        clienteId,
        mockSession,
      );
      expect(cajaService.findByIdLean).toHaveBeenCalled();
      // Ledger-first: no hay CajaService.currentCaja / save en addPago
      expect(result).toEqual({ ok: true, message: 'Pago registrado' });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('rechaza si la ruta no existe', async () => {
      rutaService.findOperacionContextById.mockResolvedValue(null);
      await expect(service.addPago(basePagoDto)).rejects.toThrow(NotFoundException);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rechaza si la ruta no tiene caja_actual', async () => {
      rutaService.findOperacionContextById.mockResolvedValue({
        ...openRutaContext,
        caja_actual: null,
      });
      await expect(service.addPago(basePagoDto)).rejects.toThrow(BadRequestException);
    });

    it('rechaza si la ruta está cerrada', async () => {
      rutaService.findOperacionContextById.mockResolvedValue({
        ...openRutaContext,
        status: false,
      });
      await expect(service.addPago(basePagoDto)).rejects.toThrow(
        /está cerrada/,
      );
      expect(movimientoModel.create).not.toHaveBeenCalled();
    });

    it('rechaza si el monto excede el saldo', async () => {
      creditoService.getCreditoById.mockResolvedValue({
        id: creditoId,
        saldo: 50,
      });
      await expect(service.addPago({ ...basePagoDto, monto: 100 })).rejects.toThrow(
        /excede el saldo/,
      );
      expect(movimientoModel.create).not.toHaveBeenCalled();
    });

    it('rechaza si ya existe un pago hoy (findOne)', async () => {
      movimientoModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue({ _id: 'pagoPrevio' }),
      });
      await expect(service.addPago(basePagoDto)).rejects.toThrow(
        /Ya ingresaste este pago/,
      );
      expect(movimientoModel.create).not.toHaveBeenCalled();
    });

    it('carrera: create con código 11000 se mapea a BadRequest de pago duplicado', async () => {
      movimientoModel.create.mockRejectedValue({ code: 11000 });
      await expect(service.addPago(basePagoDto)).rejects.toThrow(
        /Ya ingresaste este pago/,
      );
      expect(creditoService.handlePaymentMade).not.toHaveBeenCalled();
    });

    it('permite monto 0 si no hay pago previo del día', async () => {
      creditoService.getCreditoById.mockResolvedValue({
        id: creditoId,
        saldo: 500,
      });
      const result = await service.addPago({ ...basePagoDto, monto: 0 });
      expect(movimientoModel.create).toHaveBeenCalledWith(
        [expect.objectContaining({ monto: 0 })],
        { session: mockSession },
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('addRenovacion', () => {
    const renovacionDto = {
      clienteId,
      rutaId,
      valor_credito: 1000,
      total_cuotas: 10,
      frecuencia_cobro: FrecuenciaCobro.DIARIO,
      interes: 20,
    };

    it('rechaza si la ruta está cerrada antes de crear crédito', async () => {
      rutaService.findOperacionContextById.mockResolvedValue({
        ...openRutaContext,
        status: false,
      });
      await expect(service.addRenovacion(renovacionDto as any)).rejects.toThrow(
        /está cerrada/,
      );
      expect(creditoService.create).not.toHaveBeenCalled();
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('rechaza si no hay caja_actual', async () => {
      rutaService.findOperacionContextById.mockResolvedValue({
        ...openRutaContext,
        caja_actual: null,
      });
      await expect(service.addRenovacion(renovacionDto as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(creditoService.create).not.toHaveBeenCalled();
    });

    it('si create falla por crédito activo, aborta y no persiste movimiento', async () => {
      creditoService.create.mockRejectedValue(
        new BadRequestException(
          'El cliente ya tiene un crédito activo. Debe saldarlo antes de crear una renovación o un nuevo préstamo.',
        ),
      );
      await expect(service.addRenovacion(renovacionDto as any)).rejects.toThrow(
        /crédito activo/,
      );
      expect(movimientoModel).not.toHaveBeenCalled();
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('happy path: crea crédito y movimiento de préstamo', async () => {
      creditoService.create.mockResolvedValue({
        _id: creditoId,
        cliente: clienteId,
        valor_credito: 1000,
      });
      const result = await service.addRenovacion(renovacionDto as any);
      expect(creditoService.create).toHaveBeenCalledWith(renovacionDto, mockSession);
      expect(movimientoModel).toHaveBeenCalledWith(
        expect.objectContaining({
          monto: 1000,
          subTipo: SubTipo.PRESTAMO,
          tipoMovimiento: TipoMovimiento.EGRESO,
          ruta: rutaId,
          caja: cajaId,
        }),
      );
      expect(result?.ok).toBe(true);
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });
  });
});
