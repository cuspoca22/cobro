import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Connection, ClientSession } from 'mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CreditoService } from './credito.service';
import { Credito } from './schemas/credito.schema';
import { Cliente } from '../cliente/schema/cliente.schema';
import { Ruta } from '../ruta/schema/ruta.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditCalculatorService } from './helpers/credit.calculator.service';
import { CurrencyService } from '../currency/currency.service';
import { FrecuenciaCobro } from './interfaces/frecuencia-cobro.enum';

// Mock de ClientSession
const createMockSession = (): Partial<ClientSession> => ({
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
  inTransaction: jest.fn(() => true),
  hasEnded: false,
});

// Helper para mockear chain de Mongoose (findById().session())
const createMockMongooseQuery = (mockData: any) => {
  const query = {
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(mockData),
    then: jest.fn().mockImplementation(function (onFulfilled, onRejected) {
      return Promise.resolve(mockData).then(onFulfilled, onRejected);
    }),
    catch: jest.fn(),
    finally: jest.fn(),
  };
  // Hacer el objeto thenable (simular una Promise)
  const thenable = Object.assign(
    Promise.resolve(mockData),
    query
  );
  return thenable;
};

describe('CreditoService', () => {
  let service: CreditoService;
  let mockCreditoModel: any;
  let mockClienteModel: any;
  let mockRutaModel: any;
  let mockConnection: any;
  let mockDateFnsAdapter: any;
  let mockCreditCalculatorSvc: any;
  let mockCurrencyService: any;

  beforeEach(async () => {
    // Mock de modelos
    mockCreditoModel = {
      countDocuments: jest.fn(),
      updateOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      aggregate: jest.fn(),
    };

    mockClienteModel = {
      findById: jest.fn(() => ({
        session: jest.fn().mockReturnThis(),
        lean: jest.fn(),
      })),
      updateOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    mockRutaModel = {
      findById: jest.fn(() => ({
        session: jest.fn().mockReturnThis(),
        lean: jest.fn(),
      })),
    };

    mockConnection = {
      startSession: jest.fn(() => createMockSession()),
    };

    mockDateFnsAdapter = {
      getStartOfTodayInTimeZone: jest.fn(() => new Date('2024-01-01')),
      getEndOfTodayInTimeZone: jest.fn(() => new Date('2024-01-01T23:59:59.999')),
      differenceInDays: jest.fn(() => 0),
      isBefore: jest.fn(() => false),
    };

    mockCurrencyService = {
      round: jest.fn((value) => value),
    };

    mockCreditCalculatorSvc = {
      calculateFromInterest: jest.fn(),
      calculateFromCuota: jest.fn(),
      getDueDate: jest.fn(() => new Date('2024-02-01')),
      calculatePaidUntilDate: jest.fn(() => new Date('2024-01-01')),
      classifyClient: jest.fn(() => 'BUENO'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditoService,
        {
          provide: getModelToken(Credito.name),
          useValue: mockCreditoModel,
        },
        {
          provide: getModelToken(Cliente.name),
          useValue: mockClienteModel,
        },
        {
          provide: getModelToken(Ruta.name),
          useValue: mockRutaModel,
        },
        {
          provide: DateFnsAdapter,
          useValue: mockDateFnsAdapter,
        },
        {
          provide: CreditCalculatorService,
          useValue: mockCreditCalculatorSvc,
        },
        {
          provide: CurrencyService,
          useValue: mockCurrencyService,
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
      ],
    }).compile();

    service = module.get<CreditoService>(CreditoService);
  });

  describe('handlePaymentMade', () => {
    it('debe marcar cliente como inactivo cuando paga crédito completamente (saldo = 0)', async () => {
      // Arrange
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      // Mock getCreditoById para retornar crédito con saldo 0
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

      mockClienteModel.findById.mockResolvedValue({
        _id: clienteId,
        status: true,
        nombre: 'Cliente Test',
      });

      // Act
      const result = await service.handlePaymentMade(
        creditoId, rutaId, clienteId, mockSession as ClientSession
      );

      // Assert
      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: creditoId },
        {
          $set: {
            status: false, // Crédito marcado como inactivo
            state: 'BUENO', // Estado cambia a BUENO cuando se paga
            ultimo_pago: expect.any(Date),
          }
        },
        { session: mockSession }
      );

      expect(mockClienteModel.updateOne).toHaveBeenCalledWith(
        { _id: clienteId },
        { $set: { status: false } }, // Cliente marcado como inactivo
        { session: mockSession }
      );

      expect(result.creditPaid).toBe(true);
      expect(result.clientStatus).toBe(false);
      expect(result.ok).toBe(true);
    });

    it('debe mantener cliente activo cuando crédito NO está pagado completamente (saldo > 0)', async () => {
      // Arrange
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      // Mock getCreditoById para retornar crédito con saldo pendiente
      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        _id: creditoId,
        saldo: 500, // Saldo pendiente
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

      const mockQuery = createMockMongooseQuery({
        _id: clienteId,
        status: true,
        nombre: 'Cliente Test',
      });
      mockClienteModel.findById.mockReturnValue(mockQuery);

      // Act
      const result = await service.handlePaymentMade(
        creditoId, rutaId, clienteId, mockSession as ClientSession
      );

      // Assert
      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: creditoId },
        {
          $set: {
            status: true, // Crédito sigue activo
            state: 'REGULAR', // Mantiene estado actual
            ultimo_pago: expect.any(Date),
          }
        },
        { session: mockSession }
      );

      expect(mockClienteModel.updateOne).toHaveBeenCalledWith(
        { _id: clienteId },
        { $set: { status: true } }, // Cliente sigue activo
        { session: mockSession }
      );

      expect(result.creditPaid).toBe(false);
      expect(result.clientStatus).toBe(true);
    });

    it('debe manejar precisión decimal considerando crédito pagado con saldo mínimo (0.001)', async () => {
      // Arrange
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      // Mock getCreditoById para retornar crédito con saldo muy pequeño
      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        _id: creditoId,
        saldo: 0.001, // Menor que tolerancia (0.01)
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

      mockClienteModel.findById.mockResolvedValue({
        _id: clienteId,
        status: true,
        nombre: 'Cliente Test',
      });

      // Act
      const result = await service.handlePaymentMade(
        creditoId, rutaId, clienteId, mockSession as ClientSession
      );

      // Assert - Debe considerar pagado (0.001 redondeado a 0.00)
      expect(result.creditPaid).toBe(true);
      expect(result.clientStatus).toBe(false); // Cliente inactivo
    });

    it('debe lanzar NotFoundException cuando cliente no existe', async () => {
      // Arrange
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        saldo: 0,
        status: true,
      } as any);

      mockClienteModel.findById.mockResolvedValue(null); // Cliente no encontrado

      // Act & Assert
      await expect(
        service.handlePaymentMade(creditoId, rutaId, clienteId, mockSession as ClientSession)
      ).rejects.toThrow(NotFoundException);

      expect(mockClienteModel.findById).toHaveBeenCalledWith(clienteId, null, { session: mockSession });
    });

    it('debe mantener estado BUENO cuando crédito ya estaba pagado', async () => {
      // Arrange
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      // Mock crédito ya pagado (status: false)
      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        _id: creditoId,
        saldo: 0,
        status: false, // Ya estaba inactivo
        state: 'BUENO',
        abonos: 1000,
        total_pagar: 1000,
        valor_cuota: 100,
        fecha_inicio: new Date('2024-01-01'),
        daysOverdue: 0,
        ultimo_pago: new Date('2024-01-15'),
        cliente: { _id: clienteId, nombre: 'Cliente Test' },
      } as any);

      mockClienteModel.findById.mockResolvedValue({
        _id: clienteId,
        status: false, // Cliente ya inactivo
        nombre: 'Cliente Test',
      });

      // Act
      const result = await service.handlePaymentMade(
        creditoId, rutaId, clienteId, mockSession as ClientSession
      );

      // Assert - No debe cambiar estados ya correctos
      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: creditoId },
        {
          $set: {
            status: false, // Mantiene inactivo
            state: 'BUENO', // Mantiene BUENO
            ultimo_pago: expect.any(Date),
          }
        },
        { session: mockSession }
      );

      expect(mockClienteModel.updateOne).toHaveBeenCalledWith(
        { _id: clienteId },
        { $set: { status: false } }, // Mantiene inactivo
        { session: mockSession }
      );

      expect(result.creditPaid).toBe(true);
      expect(result.clientStatus).toBe(false);
    });
  });

  describe('create', () => {
    it('debe crear crédito y marcar cliente como activo', async () => {
      // Arrange
      const mockSession = createMockSession();
      const createCreditoDto = {
        clienteId: 'cliente123',
        rutaId: 'ruta456',
        valor_credito: 1000,
        total_cuotas: 10,
        frecuencia_cobro: FrecuenciaCobro.DIARIO,
        interes: 10,
      };

      mockRutaModel.findById.mockResolvedValue({
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

      // Act
      const result = await service.create(createCreditoDto as any, mockSession as ClientSession);

      // Assert
      expect(mockCreditoModel.create).toHaveBeenCalled();
      expect(mockClienteModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'cliente123',
        { $set: { status: true } }, // Cliente marcado como activo
        { returnDocument: 'after', session: mockSession }
      );
      expect(result.status).toBe(true);
    });
  });
});