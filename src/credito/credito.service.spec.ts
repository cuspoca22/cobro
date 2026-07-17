import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { ClientSession } from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import { CreditoService } from './credito.service';
import { Credito } from './schemas/credito.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditCalculatorService } from './helpers/credit.calculator.service';
import { CurrencyService } from '../currency/currency.service';
import { ClienteService } from '../cliente/cliente.service';
import { RutaService } from '../ruta/ruta.service';
import { FrecuenciaCobro } from './interfaces/frecuencia-cobro.enum';

const createMockSession = (): Partial<ClientSession> => ({
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
  inTransaction: jest.fn(() => true),
  hasEnded: false,
});

describe('CreditoService', () => {
  let service: CreditoService;
  let mockCreditoModel: any;
  let mockClienteService: any;
  let mockRutaService: any;
  let mockCreditCalculatorSvc: any;

  beforeEach(async () => {
    mockCreditoModel = {
      countDocuments: jest.fn(),
      updateOne: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn(),
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      aggregate: jest.fn(),
      exists: jest.fn(),
    };

    mockClienteService = {
      findByIdLean: jest.fn(),
      setStatus: jest.fn().mockResolvedValue(undefined),
      setTurno: jest.fn().mockResolvedValue(undefined),
    };

    mockRutaService = {
      findContextById: jest.fn(),
    };

    mockCreditCalculatorSvc = {
      calculateFromInterest: jest.fn(),
      calculateFromCuota: jest.fn(),
      getDueDate: jest.fn(() => new Date('2024-02-01')),
      calculatePaidUntilDate: jest.fn(() => new Date('2024-01-01')),
      calculateDaysOverdue: jest.fn(() => 0),
      classifyClient: jest.fn(() => 'BUENO'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditoService,
        { provide: getModelToken(Credito.name), useValue: mockCreditoModel },
        { provide: ClienteService, useValue: mockClienteService },
        { provide: RutaService, useValue: mockRutaService },
        {
          provide: DateFnsAdapter,
          useValue: {
            getStartOfTodayInTimeZone: jest.fn(() => new Date('2024-01-01')),
            getEndOfTodayInTimeZone: jest.fn(() => new Date('2024-01-01T23:59:59.999')),
            differenceInDays: jest.fn(() => 0),
            isBefore: jest.fn(() => false),
          },
        },
        { provide: CreditCalculatorService, useValue: mockCreditCalculatorSvc },
        { provide: CurrencyService, useValue: { round: jest.fn((value) => value) } },
        {
          provide: getConnectionToken(),
          useValue: { startSession: jest.fn(() => createMockSession()) },
        },
      ],
    }).compile();

    service = module.get<CreditoService>(CreditoService);
  });

  describe('handlePaymentMade', () => {
    it('debe marcar cliente como inactivo cuando paga crédito completamente (saldo = 0)', async () => {
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        _id: creditoId,
        saldo: 0,
        status: true,
        state: 'REGULAR',
        abonos: 1000,
        total_pagar: 1000,
        valor_cuota: 100,
        fecha_inicio: new Date('2024-01-01'),
        daysOverdue: 0,
        ultimo_pago: new Date('2024-01-15'),
        cliente: { _id: clienteId, nombre: 'Cliente Test' },
      } as any);

      mockClienteService.findByIdLean.mockResolvedValue({
        _id: clienteId,
        status: true,
        nombre: 'Cliente Test',
      });

      const result = await service.handlePaymentMade(
        creditoId, rutaId, clienteId, mockSession as ClientSession,
      );

      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: creditoId },
        {
          $set: {
            status: false,
            state: 'BUENO',
            ultimo_pago: expect.any(Date),
          },
        },
        { session: mockSession },
      );

      expect(mockClienteService.setStatus).toHaveBeenCalledWith(clienteId, false, mockSession);
      expect(result.creditPaid).toBe(true);
      expect(result.clientStatus).toBe(false);
      expect(result.ok).toBe(true);
    });

    it('debe mantener cliente activo cuando crédito NO está pagado completamente (saldo > 0)', async () => {
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        _id: creditoId,
        saldo: 500,
        status: true,
        state: 'REGULAR',
        abonos: 500,
        total_pagar: 1000,
        valor_cuota: 100,
        fecha_inicio: new Date('2024-01-01'),
        daysOverdue: 0,
        ultimo_pago: new Date('2024-01-15'),
        cliente: { _id: clienteId, nombre: 'Cliente Test' },
      } as any);

      mockClienteService.findByIdLean.mockResolvedValue({
        _id: clienteId,
        status: true,
        nombre: 'Cliente Test',
      });

      const result = await service.handlePaymentMade(
        creditoId, rutaId, clienteId, mockSession as ClientSession,
      );

      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: creditoId },
        {
          $set: {
            status: true,
            state: 'REGULAR',
            ultimo_pago: expect.any(Date),
          },
        },
        { session: mockSession },
      );

      expect(mockClienteService.setStatus).toHaveBeenCalledWith(clienteId, true, mockSession);
      expect(result.creditPaid).toBe(false);
      expect(result.clientStatus).toBe(true);
    });

    it('debe manejar precisión decimal considerando crédito pagado con saldo mínimo (0.001)', async () => {
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        _id: creditoId,
        saldo: 0.001,
        status: true,
        state: 'REGULAR',
        abonos: 999.999,
        total_pagar: 1000,
        valor_cuota: 100,
        fecha_inicio: new Date('2024-01-01'),
        daysOverdue: 0,
        ultimo_pago: new Date('2024-01-15'),
        cliente: { _id: clienteId, nombre: 'Cliente Test' },
      } as any);

      mockClienteService.findByIdLean.mockResolvedValue({
        _id: clienteId,
        status: true,
        nombre: 'Cliente Test',
      });

      const result = await service.handlePaymentMade(
        creditoId, rutaId, clienteId, mockSession as ClientSession,
      );

      expect(result.creditPaid).toBe(true);
      expect(result.clientStatus).toBe(false);
    });

    it('debe lanzar NotFoundException cuando cliente no existe', async () => {
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        saldo: 0,
        status: true,
      } as any);

      mockClienteService.findByIdLean.mockResolvedValue(null);

      await expect(
        service.handlePaymentMade(creditoId, rutaId, clienteId, mockSession as ClientSession),
      ).rejects.toThrow(NotFoundException);

      expect(mockClienteService.findByIdLean).toHaveBeenCalledWith(clienteId, mockSession);
    });

    it('debe mantener estado BUENO cuando crédito ya estaba pagado', async () => {
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        _id: creditoId,
        saldo: 0,
        status: false,
        state: 'BUENO',
        abonos: 1000,
        total_pagar: 1000,
        valor_cuota: 100,
        fecha_inicio: new Date('2024-01-01'),
        daysOverdue: 0,
        ultimo_pago: new Date('2024-01-15'),
        cliente: { _id: clienteId, nombre: 'Cliente Test' },
      } as any);

      mockClienteService.findByIdLean.mockResolvedValue({
        _id: clienteId,
        status: false,
        nombre: 'Cliente Test',
      });

      const result = await service.handlePaymentMade(
        creditoId, rutaId, clienteId, mockSession as ClientSession,
      );

      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: creditoId },
        {
          $set: {
            status: false,
            state: 'BUENO',
            ultimo_pago: expect.any(Date),
          },
        },
        { session: mockSession },
      );

      expect(mockClienteService.setStatus).toHaveBeenCalledWith(clienteId, false, mockSession);
      expect(result.creditPaid).toBe(true);
      expect(result.clientStatus).toBe(false);
    });
  });

  describe('create', () => {
    it('debe crear crédito y marcar cliente como activo', async () => {
      const mockSession = createMockSession();
      const createCreditoDto = {
        clienteId: 'cliente123',
        rutaId: 'ruta456',
        valor_credito: 1000,
        total_cuotas: 10,
        frecuencia_cobro: FrecuenciaCobro.DIARIO,
        interes: 10,
      };

      mockRutaService.findContextById.mockResolvedValue({
        _id: 'ruta456',
        timeZone: 'America/Guatemala',
        currency: 'GTQ',
      });

      mockCreditCalculatorSvc.calculateFromInterest.mockReturnValue({
        totalPagar: 1100,
        valorCuota: 110,
      });

      mockCreditoModel.create.mockResolvedValue([{
        _id: 'nuevoCredito123',
        toObject: () => ({
          _id: 'nuevoCredito123',
          cliente: 'cliente123',
          ruta: 'ruta456',
          valor_credito: 1000,
          interes: 10,
          total_cuotas: 10,
          total_pagar: 1100,
          valor_cuota: 110,
          frecuencia_cobro: FrecuenciaCobro.DIARIO,
          fecha_inicio: new Date('2024-01-01'),
          status: true,
          dueDate: new Date('2024-01-11'),
        }),
      }]);

      const result = await service.create(createCreditoDto as any, mockSession as ClientSession);

      expect(mockCreditoModel.create).toHaveBeenCalled();
      expect(mockClienteService.setStatus).toHaveBeenCalledWith('cliente123', true, mockSession);
      expect(result.status).toBe(true);
    });

    it('rechaza si el cliente ya tiene un crédito activo', async () => {
      const mockSession = createMockSession();
      mockRutaService.findContextById.mockResolvedValue({
        _id: 'ruta456',
        timeZone: 'America/Guatemala',
        currency: 'GTQ',
      });
      mockCreditCalculatorSvc.calculateFromInterest.mockReturnValue({
        totalPagar: 1100,
        valorCuota: 110,
      });
      mockCreditoModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'creditoActivoPrevio', status: true }),
      });

      await expect(
        service.create(
          {
            clienteId: 'cliente123',
            rutaId: 'ruta456',
            valor_credito: 1000,
            total_cuotas: 10,
            frecuencia_cobro: FrecuenciaCobro.DIARIO,
            interes: 10,
          } as any,
          mockSession as ClientSession,
        ),
      ).rejects.toThrow(/crédito activo/);

      expect(mockCreditoModel.create).not.toHaveBeenCalled();
      expect(mockClienteService.setStatus).not.toHaveBeenCalled();
    });

    it('carrera: create con código 11000 se mapea a BadRequest de crédito activo', async () => {
      const mockSession = createMockSession();
      mockRutaService.findContextById.mockResolvedValue({
        _id: 'ruta456',
        timeZone: 'America/Guatemala',
        currency: 'GTQ',
      });
      mockCreditCalculatorSvc.calculateFromInterest.mockReturnValue({
        totalPagar: 1100,
        valorCuota: 110,
      });
      mockCreditoModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      mockCreditoModel.create.mockRejectedValue({ code: 11000 });

      await expect(
        service.create(
          {
            clienteId: 'cliente123',
            rutaId: 'ruta456',
            valor_credito: 1000,
            total_cuotas: 10,
            frecuencia_cobro: FrecuenciaCobro.DIARIO,
            interes: 10,
          } as any,
          mockSession as ClientSession,
        ),
      ).rejects.toThrow(/crédito activo/);

      expect(mockClienteService.setStatus).not.toHaveBeenCalled();
    });
  });
});
