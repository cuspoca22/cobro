import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RenovacionController } from './renovacion.controller';
import { RenovacionService } from './renovacion.service';

jest.mock('src/auth/decorators/auth.decorator', () => ({ Auth: () => jest.fn() }));
jest.mock('src/auth/decorators/get-user.decorator', () => ({
  GetUser: () => jest.fn(),
}));

describe('RenovacionController', () => {
  let controller: RenovacionController;
  let service: RenovacionService;

  const mockService = {
    getRenovacionesDiarias: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RenovacionController],
      providers: [
        { provide: RenovacionService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<RenovacionController>(RenovacionController);
    service = module.get<RenovacionService>(RenovacionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getRenovacionesDiarias', () => {
    it('ADMIN sin filtro de ruta pasa scoped como undefined', async () => {
      const user = { empresa: 'emp1', rol: 'ADMIN' };
      const query = { fecha: '2024-01-01' };

      await controller.getRenovacionesDiarias(user as any, query as any);

      expect(mockService.getRenovacionesDiarias).toHaveBeenCalledWith(
        query,
        'emp1',
        undefined,
      );
    });

    it('SUPERVISOR filtra renovaciones por sus rutas', async () => {
      const user = { empresa: 'emp1', rol: 'SUPERVISOR', rutas: ['r1', 'r2'] };
      const query = { fecha: '2024-01-01' };

      await controller.getRenovacionesDiarias(user as any, query as any);

      expect(mockService.getRenovacionesDiarias).toHaveBeenCalledWith(
        query,
        'emp1',
        ['r1', 'r2'],
      );
    });

    it('SUPERVISOR no puede filtrar por ruta fuera de su scope', async () => {
      const user = { empresa: 'emp1', rol: 'SUPERVISOR', rutas: ['r1'] };
      const query = { fecha: '2024-01-01', rutaId: 'r2' };

      await expect(
        controller.getRenovacionesDiarias(user as any, query as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza ForbiddenException si usuario no tiene empresa', async () => {
      const user = { rol: 'ADMIN' };

      await expect(
        controller.getRenovacionesDiarias(user as any, { fecha: '2024-01-01' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('normaliza empresa cuando es objeto poblado', async () => {
      const user = { empresa: { _id: 'emp1', name: 'Test' }, rol: 'ADMIN' };
      const query = { fecha: '2024-01-01' };

      await controller.getRenovacionesDiarias(user as any, query as any);

      expect(mockService.getRenovacionesDiarias).toHaveBeenCalledWith(
        query,
        'emp1',
        undefined,
      );
    });
  });
});
