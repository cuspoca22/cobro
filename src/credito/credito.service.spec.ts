import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { ClientSession } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreditoService } from './credito.service';
import { Credito } from './schemas/credito.schema';
import { MoraAplicacion, TipoMoraAplicacion } from './schemas/mora-aplicacion.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditCalculatorService } from './helpers/credit.calculator.service';
import { CurrencyService } from '../currency/currency.service';
import { ClienteService } from '../cliente/cliente.service';
import { RutaService } from '../ruta/ruta.service';
import { EmpresaService } from '../empresa/empresa.service';
import { MessageGateway } from '../message/message.gateway';
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
  let mockMessageGateway: { emitMoraActualizada: jest.Mock };
  let mockEmpresaService: { getMoraConfigById: jest.Mock };
  let mockMoraAplicacionModel: { create: jest.Mock };

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
      findContextById: jest.fn().mockResolvedValue({
        _id: 'ruta789',
        timeZone: 'America/Guatemala',
        currency: 'COP',
      }),
      getEmpresaIdByRutaId: jest.fn().mockResolvedValue({ exists: false }),
    };

    mockCreditCalculatorSvc = {
      calculateFromInterest: jest.fn(),
      calculateFromCuota: jest.fn(),
      getDueDate: jest.fn(() => new Date('2024-02-01')),
      calculatePaidUntilDate: jest.fn(() => new Date('2024-01-01')),
      calculateDaysOverdue: jest.fn(() => 0),
      classifyClient: jest.fn(() => 'BUENO'),
      calcularMoraSugerida: jest.fn(() => 0),
    };

    mockMessageGateway = {
      emitMoraActualizada: jest.fn(),
    };

    mockEmpresaService = {
      getMoraConfigById: jest.fn().mockResolvedValue(null),
    };

    mockMoraAplicacionModel = {
      create: jest.fn().mockResolvedValue([{}]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditoService,
        { provide: getModelToken(Credito.name), useValue: mockCreditoModel },
        { provide: getModelToken(MoraAplicacion.name), useValue: mockMoraAplicacionModel },
        { provide: ClienteService, useValue: mockClienteService },
        { provide: RutaService, useValue: mockRutaService },
        { provide: EmpresaService, useValue: mockEmpresaService },
        { provide: MessageGateway, useValue: mockMessageGateway },
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
        { provide: CurrencyService, useValue: {
          round: jest.fn((value) => value),
          formatShareAmount: jest.fn((value: number, code?: string) => {
            const symbol = code === 'GTQ' ? 'Q' : '$';
            return `${symbol}\u00A0${Math.round(Number(value) || 0)}`;
          }),
        } },
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

    it('debe incluir desglose de mora en el comprobante cuando aplica', async () => {
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        _id: creditoId,
        saldo: 900,
        mora_adeudada: 30,
        mora_cobrada: 20,
        cobraMora: true,
        status: true,
        state: 'BUENO',
        abonos: 100,
        total_pagar: 1000,
        valor_cuota: 100,
        fecha_inicio: new Date('2024-01-01'),
        daysOverdue: 0,
        ultimo_pago: new Date('2024-01-15'),
        paymentsToday: {
          monto: 120,
          montoAbono: 100,
          montoMora: 20,
          createdAt: new Date('2024-01-15'),
        },
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

      expect(result.message).toContain('Comprobante de pago');
      expect(result.message).toContain('Mora adeudada: $\u00A030');
      expect(result.message).toContain('Mora cobrada: $\u00A020');
      expect(result.message).toContain('Abono: $\u00A0100');
      expect(result.message).toContain('Total pagado: $\u00A0120');
      expect(result.message).not.toContain('cuota Abonada');
      expect(result.message).not.toContain('Clasificación');
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

    it('debe mantener crédito/cliente activos si saldo≈0 pero mora_adeudada>0', async () => {
      const mockSession = createMockSession();
      const creditoId = 'credito123';
      const clienteId = 'cliente456';
      const rutaId = 'ruta789';

      jest.spyOn(service, 'getCreditoById').mockResolvedValue({
        _id: creditoId,
        saldo: 0,
        mora_adeudada: 50,
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

  describe('aplicarMora / perdonarMora', () => {
    const usuarioId = '507f1f77bcf86cd799439011';

    beforeEach(() => {
      mockRutaService.getEmpresaIdByRutaId.mockResolvedValue({
        exists: true,
        empresaId: 'empresa123',
      });
      mockEmpresaService.getMoraConfigById.mockResolvedValue({
        cobraMora: true,
        permiteMoraVoluntaria: false,
        porcentajeMora: 10,
        baseCalculoMora: 'VALOR_CUOTA',
      });
    });

    it('emite mora-actualizada tras aplicar mora', async () => {
      const mockSession = createMockSession();
      const credito = {
        _id: { toString: () => 'credito123' },
        status: true,
        ruta: { toString: () => 'ruta789' },
        mora_adeudada: 10,
      };

      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(credito),
      });
      mockCreditoModel.updateOne.mockResolvedValue({ acknowledged: true });

      const result = await service.aplicarMora(
        'credito123',
        25,
        usuarioId,
        'atraso',
        mockSession as ClientSession,
      );

      expect(result).toEqual({
        creditoId: 'credito123',
        mora_adeudada: 35,
        montoAplicado: 25,
      });
      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: credito._id },
        { $set: { mora_adeudada: 35 } },
        { session: mockSession },
      );
      expect(mockMessageGateway.emitMoraActualizada).toHaveBeenCalledWith({
        ruta: 'ruta789',
        empresa: 'empresa123',
        creditoId: 'credito123',
        tipo: 'APLICAR',
        monto: 25,
        mora_adeudada: 35,
      });
    });

    it('emite mora-actualizada tras perdonar mora', async () => {
      const mockSession = createMockSession();
      const credito = {
        _id: { toString: () => 'credito123' },
        status: true,
        ruta: { toString: () => 'ruta789' },
        mora_adeudada: 50,
      };

      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(credito),
      });
      mockCreditoModel.updateOne.mockResolvedValue({ acknowledged: true });

      const result = await service.perdonarMora(
        'credito123',
        20,
        usuarioId,
        'buen historial',
        mockSession as ClientSession,
      );

      expect(result).toEqual({
        creditoId: 'credito123',
        mora_adeudada: 30,
        montoPerdonado: 20,
      });
      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: credito._id },
        { $set: { mora_adeudada: 30 } },
        { session: mockSession },
      );
      expect(mockMessageGateway.emitMoraActualizada).toHaveBeenCalledWith({
        ruta: 'ruta789',
        empresa: 'empresa123',
        creditoId: 'credito123',
        tipo: 'PERDONAR',
        monto: 20,
        mora_adeudada: 30,
      });
    });

    it('rechaza aplicarMora si crédito no existe', async () => {
      const mockSession = createMockSession();
      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.aplicarMora('credito123', 25, usuarioId, 'atraso', mockSession as ClientSession),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza aplicarMora si crédito saldado', async () => {
      const mockSession = createMockSession();
      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          _id: { toString: () => 'credito123' },
          status: false,
          ruta: { toString: () => 'ruta789' },
          mora_adeudada: 0,
        }),
      });

      await expect(
        service.aplicarMora('credito123', 25, usuarioId, 'atraso', mockSession as ClientSession),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza aplicarMora si empresa no cobra mora', async () => {
      const mockSession = createMockSession();
      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          _id: { toString: () => 'credito123' },
          status: true,
          ruta: { toString: () => 'ruta789' },
          mora_adeudada: 10,
        }),
      });
      mockEmpresaService.getMoraConfigById.mockResolvedValue({
        cobraMora: false,
        permiteMoraVoluntaria: false,
        porcentajeMora: 10,
        baseCalculoMora: 'VALOR_CUOTA',
      });

      await expect(
        service.aplicarMora('credito123', 25, usuarioId, 'atraso', mockSession as ClientSession),
      ).rejects.toThrow(/no tiene habilitado el cobro de mora/);
    });

    it('rechaza aplicarMora si monto <= 0', async () => {
      const mockSession = createMockSession();
      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          _id: { toString: () => 'credito123' },
          status: true,
          ruta: { toString: () => 'ruta789' },
          mora_adeudada: 10,
        }),
      });

      await expect(
        service.aplicarMora('credito123', 0, usuarioId, 'atraso', mockSession as ClientSession),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza perdonarMora si monto supera mora_adeudada', async () => {
      const mockSession = createMockSession();
      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          _id: { toString: () => 'credito123' },
          status: true,
          ruta: { toString: () => 'ruta789' },
          mora_adeudada: 20,
        }),
      });

      await expect(
        service.perdonarMora('credito123', 25, usuarioId, 'buen historial', mockSession as ClientSession),
      ).rejects.toThrow(/No se puede perdonar más mora/);
    });

    it('al aplicar mora llama create con tipo APLICAR y montos antes/despues', async () => {
      const mockSession = createMockSession();
      const credito = {
        _id: { toString: () => 'credito123' },
        status: true,
        ruta: { toString: () => 'ruta789' },
        mora_adeudada: 10,
      };

      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(credito),
      });
      mockCreditoModel.updateOne.mockResolvedValue({ acknowledged: true });

      await service.aplicarMora(
        'credito123',
        25,
        usuarioId,
        'atraso',
        mockSession as ClientSession,
      );

      expect(mockMoraAplicacionModel.create).toHaveBeenCalledWith(
        [expect.objectContaining({
          credito: credito._id,
          tipo: TipoMoraAplicacion.APLICAR,
          monto: 25,
          motivo: 'atraso',
          mora_adeudada_antes: 10,
          mora_adeudada_despues: 35,
        })],
        { session: mockSession },
      );
    });
  });

  describe('applyMoraCobroOnCredito', () => {
    it('reduce mora_adeudada e incrementa mora_cobrada vía updateOne', async () => {
      const mockSession = createMockSession();
      const credito = {
        _id: 'credito123',
        mora_adeudada: 30,
        mora_cobrada: 10,
      };

      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(credito),
      });
      mockCreditoModel.updateOne.mockResolvedValue({ acknowledged: true });

      await service.applyMoraCobroOnCredito('credito123', 20, 0, mockSession as ClientSession);

      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: credito._id },
        { $set: { mora_adeudada: 10, mora_cobrada: 30 } },
        { session: mockSession },
      );
    });

    it('con moraAAplicar > 0 aumenta adeudada antes de cobrar', async () => {
      const mockSession = createMockSession();
      const credito = {
        _id: 'credito123',
        mora_adeudada: 0,
        mora_cobrada: 0,
      };

      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(credito),
      });
      mockCreditoModel.updateOne.mockResolvedValue({ acknowledged: true });

      await service.applyMoraCobroOnCredito('credito123', 10, 10, mockSession as ClientSession);

      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: credito._id },
        { $set: { mora_adeudada: 0, mora_cobrada: 10 } },
        { session: mockSession },
      );
    });

    it('no-op si montoMora=0 y moraAAplicar=0 (no llama updateOne)', async () => {
      const mockSession = createMockSession();

      await service.applyMoraCobroOnCredito('credito123', 0, 0, mockSession as ClientSession);

      expect(mockCreditoModel.findById).not.toHaveBeenCalled();
      expect(mockCreditoModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('revertMoraCobroOnCredito', () => {
    it('restaura mora_adeudada y baja mora_cobrada vía updateOne', async () => {
      const mockSession = createMockSession();
      const credito = {
        _id: 'credito123',
        mora_adeudada: 10,
        mora_cobrada: 30,
      };

      mockCreditoModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(credito),
      });
      mockCreditoModel.updateOne.mockResolvedValue({ acknowledged: true });

      await service.revertMoraCobroOnCredito('credito123', 20, mockSession as ClientSession);

      expect(mockCreditoModel.updateOne).toHaveBeenCalledWith(
        { _id: credito._id },
        { $set: { mora_adeudada: 30, mora_cobrada: 10 } },
        { session: mockSession },
      );
    });

    it('no-op si montoMoraAnterior <= 0', async () => {
      const mockSession = createMockSession();

      await service.revertMoraCobroOnCredito('credito123', 0, mockSession as ClientSession);

      expect(mockCreditoModel.findById).not.toHaveBeenCalled();
      expect(mockCreditoModel.updateOne).not.toHaveBeenCalled();
    });
  });
});
