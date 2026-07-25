import { Test, TestingModule } from '@nestjs/testing';
import { MovimientoCajaController } from './movimiento-caja.controller';
import { MovimientoCajaService } from './movimiento-caja.service';

jest.mock('src/auth/decorators/auth.decorator', () => ({ Auth: () => jest.fn() }));
jest.mock('src/auth/decorators/get-user.decorator', () => ({
  GetUser: () => jest.fn(),
}));
jest.mock('src/common/decorators', () => ({
  RutaAbierta: () => jest.fn(),
}));
jest.mock('src/common/ownership', () => ({
  RutaOwnership: () => jest.fn(),
  RutaOwnershipService: class {},
}));

describe('MovimientoCajaController', () => {
  let controller: MovimientoCajaController;
  let service: MovimientoCajaService;

  const mockService = {
    getHistorialPagos: jest.fn(),
    getResumenDiario: jest.fn(),
    getPagosConUbicacionEmpresa: jest.fn(),
    getResumenOficina: jest.fn(),
    addPago: jest.fn(),
    addRenovacion: jest.fn(),
    addOficinaMovimiento: jest.fn(),
    updatePago: jest.fn(),
    deletePago: jest.fn(),
    updateMovimiento: jest.fn(),
    updateCredito: jest.fn(),
    deleteCredito: jest.fn(),
    deleteCreditoAsSuperAdmin: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MovimientoCajaController],
      providers: [
        { provide: MovimientoCajaService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<MovimientoCajaController>(MovimientoCajaController);
    service = module.get<MovimientoCajaService>(MovimientoCajaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPagosConUbicacion', () => {
    it('SUPERADMIN puede ver ubicaciones de cualquier empresa', async () => {
      mockService.getPagosConUbicacionEmpresa.mockResolvedValue([]);
      const user = { rol: 'SUPERADMIN', empresa: 'emp1' };

      await controller.getPagosConUbicacion('emp1', user as any);

      expect(mockService.getPagosConUbicacionEmpresa).toHaveBeenCalledWith(
        'emp1',
        undefined,
        undefined, // null → undefined (sin filtro)
      );
    });

    it('impide ver ubicaciones de otra empresa', async () => {
      const user = { rol: 'ADMIN', empresa: 'emp1' };

      await expect(
        controller.getPagosConUbicacion('emp2', user as any),
      ).rejects.toThrow('No puedes ver ubicaciones de pagos de otra empresa');
    });

    it('SUPERVISOR filtra por sus rutas asignadas', async () => {
      mockService.getPagosConUbicacionEmpresa.mockResolvedValue([]);
      const user = { rol: 'SUPERVISOR', empresa: 'emp1', rutas: [{ _id: 'r1' }, { _id: 'r2' }] };

      await controller.getPagosConUbicacion('emp1', user as any);

      expect(mockService.getPagosConUbicacionEmpresa).toHaveBeenCalledWith(
        'emp1',
        undefined,
        ['r1', 'r2'],
      );
    });

    it('COBRADOR filtra por su ruta asignada', async () => {
      mockService.getPagosConUbicacionEmpresa.mockResolvedValue([]);
      const user = { rol: 'COBRADOR', empresa: 'emp1', ruta: 'r1' };

      await controller.getPagosConUbicacion('emp1', user as any);

      expect(mockService.getPagosConUbicacionEmpresa).toHaveBeenCalledWith(
        'emp1',
        undefined,
        ['r1'],
      );
    });

    it('maneja empresa como objeto poblado con normalizeId', async () => {
      mockService.getPagosConUbicacionEmpresa.mockResolvedValue([]);
      const user = { rol: 'ADMIN', empresa: { _id: 'emp1', name: 'Test' } };

      await controller.getPagosConUbicacion('emp1', user as any);

      expect(mockService.getPagosConUbicacionEmpresa).toHaveBeenCalledWith(
        'emp1',
        undefined,
        undefined,
      );
    });
  });
});
