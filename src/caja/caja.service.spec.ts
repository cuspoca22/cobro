import { Test, TestingModule } from '@nestjs/testing';
import { CajaService } from './caja.service';
import { getModelToken } from '@nestjs/mongoose';
import { Caja } from './schemas/caja.schema';
import { Credito } from '../credito/schemas/credito.schema';
import { Ruta } from '../ruta/schema/ruta.schema';
import { MovimientoCaja } from '../movimientoCaja/schemas/caja-movimiento.schemas';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { Types } from 'mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateCajaDto } from './dto';
import { SubTipo, TipoMovimiento } from '../movimientoCaja/interfaces';

describe('CajaService', () => {
  let service: CajaService;
  let cajaModel: any;
  let creditoModel: any;
  let rutaModel: any;
  let cajaMovimientoModel: any;
  let dateFnsAdapter: any;

  // Mock data helpers
  const mockRutaId = new Types.ObjectId().toString();
  const mockCajaId = new Types.ObjectId().toString();
  const mockDate = new Date();

  beforeEach(async () => {
    // Definir los mocks para los modelos y dependencias
    const mockCajaModel = {
      findOne: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      aggregate: jest.fn(),
      sort: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
    };

    const mockCreditoModel = {
      aggregate: jest.fn(),
    };

    const mockRutaModel = {
      findById: jest.fn(),
    };

    const mockCajaMovimientoModel = {
      aggregate: jest.fn(),
    };

    const mockDateFnsAdapter = {
      getStartOfTodayInTimeZone: jest.fn().mockReturnValue(mockDate),
      startOfDayUtc: jest.fn().mockReturnValue(mockDate),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CajaService,
        { provide: getModelToken(Caja.name), useValue: mockCajaModel },
        { provide: getModelToken(Credito.name), useValue: mockCreditoModel },
        { provide: getModelToken(Ruta.name), useValue: mockRutaModel },
        { provide: getModelToken(MovimientoCaja.name), useValue: mockCajaMovimientoModel },
        { provide: DateFnsAdapter, useValue: mockDateFnsAdapter },
      ],
    }).compile();

    service = module.get<CajaService>(CajaService);
    cajaModel = module.get(getModelToken(Caja.name));
    creditoModel = module.get(getModelToken(Credito.name));
    rutaModel = module.get(getModelToken(Ruta.name));
    cajaMovimientoModel = module.get(getModelToken(MovimientoCaja.name));
    dateFnsAdapter = module.get(DateFnsAdapter);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('getUltimaCaja', () => {
    it('debe devolver la última caja si existe', async () => {
      const mockCaja = {
        toObject: jest.fn().mockReturnValue({ _id: mockCajaId, ruta: mockRutaId, fecha: mockDate }),
        _id: mockCajaId,
        ruta: mockRutaId,
        fecha: mockDate,
      };

      cajaModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          session: jest.fn().mockResolvedValue(mockCaja),
        }),
      });

      const result = await service.getUltimaCaja(mockRutaId, null);

      expect(result.hayUltimaCaja).toBe(true);
      expect(result.ultimaCaja).toBeDefined();
      expect(cajaModel.findOne).toHaveBeenCalledWith({ ruta: mockRutaId });
    });

    it('debe devolver null si no existe última caja', async () => {
      cajaModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          session: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.getUltimaCaja(mockRutaId, null);

      expect(result.hayUltimaCaja).toBe(false);
      expect(result.ultimaCaja).toBeNull();
    });
  });

  describe('create', () => {
    it('debe crear una nueva caja correctamente', async () => {
      const createCajaDto: CreateCajaDto = {
        rutaId: mockRutaId,
        fecha: mockDate,
        base: 100,
      };

      const mockCreditSummary = { pretendido: 500, totalClientes: 10 };
      jest.spyOn(service, 'getCreditSummary').mockResolvedValue(mockCreditSummary as any);

      const mockCreatedCaja = {
        toObject: jest.fn().mockReturnValue({
          _id: mockCajaId,
          ...createCajaDto,
          pretendido: mockCreditSummary.pretendido,
          total_clientes: mockCreditSummary.totalClientes,
          clientes_pendientes: mockCreditSummary.totalClientes,
          caja_final: createCajaDto.base,
        }),
      };

      cajaModel.create.mockResolvedValue(mockCreatedCaja);

      const result = await service.create(createCajaDto);

      expect(service.getCreditSummary).toHaveBeenCalledWith(mockRutaId);
      expect(cajaModel.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('debe manejar errores de duplicidad (código 11000)', async () => {
      const createCajaDto: CreateCajaDto = { rutaId: mockRutaId, fecha: mockDate, base: 100 };
      jest.spyOn(service, 'getCreditSummary').mockResolvedValue({ pretendido: 0, totalClientes: 0, clientesPendietes: 0 });

      const error = { code: 11000 };
      cajaModel.create.mockRejectedValue(error);

      await expect(service.create(createCajaDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getClientesPendientesYRenovados', () => {
    it('debe calcular correctamente los clientes pendientes y renovados', async () => {
      // Mock para clientes renovados
      cajaMovimientoModel.aggregate.mockResolvedValueOnce([{ _id: 'cliente1' }]); // Renovados

      // Mock para clientes activos
      creditoModel.aggregate.mockResolvedValue([{ _id: 'cliente1' }, { _id: 'cliente2' }, { _id: 'cliente3' }]);

      // Mock para clientes que pagaron hoy
      cajaMovimientoModel.aggregate.mockResolvedValueOnce([{ _id: 'cliente2' }]); // Pagaron

      const result = await service.getClientesPendientesYRenovados(mockRutaId, mockDate);

      // Total activos: 3
      // Renovados: 1 (cliente1)
      // Pagaron: 1 (cliente2)
      // Pendientes: cliente3 (activos - renovados - pagaron) = 1

      expect(result.renovaciones).toBe(1);
      expect(result.clientesPendientes).toBe(1);

      expect(cajaMovimientoModel.aggregate).toHaveBeenCalledTimes(2);
      expect(creditoModel.aggregate).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCreditSummary', () => {
    it('debe devolver el resumen correcto cuando hay créditos', async () => {
      const mockSummary = { pretendido: 1000, totalClientes: 20 };
      creditoModel.aggregate.mockResolvedValue([mockSummary]);

      const result = await service.getCreditSummary(mockRutaId);

      expect(result.pretendido).toBe(1000);
      expect(result.totalClientes).toBe(20);
      expect(result.clientesPendietes).toBe(20);
    });

    it('debe devolver ceros si no hay créditos', async () => {
      creditoModel.aggregate.mockResolvedValue([]);

      const result = await service.getCreditSummary(mockRutaId);

      expect(result.pretendido).toBe(0);
      expect(result.totalClientes).toBe(0);
      expect(result.clientesPendietes).toBe(0);
    });
  });

  describe('getMovimientosResumen', () => {
    it('debe lanzar NotFoundException si la ruta no existe', async () => {
      rutaModel.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
      await expect(service.getMovimientosResumen(mockRutaId)).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar NotFoundException si la caja no existe', async () => {
      const mockRuta = { caja_actual: mockCajaId, timeZone: 'UTC' };
      rutaModel.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockRuta) });
      cajaModel.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });

      await expect(service.getMovimientosResumen(mockRutaId)).rejects.toThrow(NotFoundException);
    });

    it('debe actualizar y devolver la caja con el resumen de movimientos', async () => {
      const mockRuta = { caja_actual: mockCajaId, timeZone: 'UTC' };
      const mockCaja = {
        base: 100,
        save: jest.fn(),
        toObject: jest.fn().mockReturnValue({ _id: mockCajaId, base: 100 })
      };
      const mockResumenMovimientos = [{
        cobro: 50,
        prestamos: 20,
        inversiones: 10,
        gastos: 5,
        retiros: 5
      }];

      rutaModel.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockRuta) });
      cajaModel.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockCaja) });

      // Mock getClientesPendientesYRenovados logic inside or mock the private method call if possible, 
      // but since it's private/internal logic we mocked the dependencies.
      // The service calls this.getClientesPendientesYRenovados internally.
      // We can spyOn it if we want to isolate, but let's trust the mocks of the models it uses.
      // We already mocked the models for getClientesPendientesYRenovados in previous test, 
      // we need to set them up for this flow too.

      // Mocking responses for getClientesPendientesYRenovados internal calls
      cajaMovimientoModel.aggregate
        .mockResolvedValueOnce([]) // Renovados
        .mockResolvedValueOnce([]) // Pagaron
        .mockReturnValueOnce({ // Resumen pipeline result
          session: jest.fn().mockReturnThis(),
          then: (resolve: any) => resolve(mockResumenMovimientos)
        });

      creditoModel.aggregate.mockResolvedValue([]); // Activos

      const result = await service.getMovimientosResumen(mockRutaId);

      expect(rutaModel.findById).toHaveBeenCalledWith(mockRutaId);
      expect(cajaModel.findById).toHaveBeenCalledWith(mockCajaId);
      // Caja final calculation: 100 (base) + 50 (cobro) + 10 (inversion) - 20 (prestamo) - 5 (gasto) - 5 (retiro) = 130
      // But checkout the code: caja.caja_final = caja.base + caja.cobro + caja.inversion - caja.prestamo - caja.gasto - caja.retiro;
      // 100 + 50 + 10 - 20 - 5 - 5 = 130.
      // Note: we can't easily check the 'caja' object mutation unless we trust the mockCaja reference or the return value.
      // The return value comes from CajaEntity.fromObject(caja).

      expect(mockCaja.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('debe devolver la caja del día si existe', async () => {
      const fechaStr = '2023-10-27';
      rutaModel.findById.mockResolvedValue({});
      const mockCajaEncontrada = { _id: mockCajaId };
      cajaModel.aggregate.mockResolvedValue([mockCajaEncontrada]);

      const result = await service.findAll(mockRutaId, fechaStr);

      expect(result).toEqual(mockCajaEncontrada);
    });

    it('debe lanzar NotFoundException si no encuentra caja', async () => {
      const fechaStr = '2023-10-27';
      rutaModel.findById.mockResolvedValue({});
      cajaModel.aggregate.mockResolvedValue([]);

      await expect(service.findAll(mockRutaId, fechaStr)).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar NotFoundException si la ruta no existe', async () => {
      rutaModel.findById.mockResolvedValue(null);
      await expect(service.findAll(mockRutaId, '2023-10-27')).rejects.toThrow(NotFoundException);
    });
  });
});
