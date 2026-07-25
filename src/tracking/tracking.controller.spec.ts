import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuthService } from '../auth/auth.service';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

jest.mock('src/auth/decorators/auth.decorator', () => ({ Auth: () => jest.fn() }));
jest.mock('src/auth/decorators/get-user.decorator', () => ({ GetUser: () => jest.fn() }));

describe('TrackingController', () => {
  let controller: TrackingController;
  let trackingService: {
    getEmpresaHoy: jest.Mock;
    getOnlineCobradorIds: jest.Mock;
    getCobradorHoy: jest.Mock;
    isCobradorOnline: jest.Mock;
  };
  let authService: {
    findTrackingProfileById: jest.Mock;
  };

  const mockEmpresaHoyResult = [
    {
      cobradorId: 'c1',
      nombre: 'Cobrador 1',
      rutaId: 'ruta1',
      online: true,
      puntos: [],
    },
  ];

  beforeEach(async () => {
    trackingService = {
      getEmpresaHoy: jest.fn().mockResolvedValue(mockEmpresaHoyResult),
      getOnlineCobradorIds: jest.fn().mockReturnValue(new Set(['c1'])),
      getCobradorHoy: jest.fn().mockResolvedValue({
        cobradorId: 'cobrador1',
        nombre: 'Cobrador 1',
        rutaId: 'ruta1',
        online: true,
        puntos: [],
      }),
      isCobradorOnline: jest.fn().mockReturnValue(true),
    };

    authService = {
      findTrackingProfileById: jest.fn().mockResolvedValue({
        _id: 'cobrador1',
        nombre: 'Cobrador 1',
        rutaId: 'ruta1',
        empresaId: 'emp1',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrackingController],
      providers: [
        { provide: TrackingService, useValue: trackingService },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    controller = module.get<TrackingController>(TrackingController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── getEmpresaHoy ──────────────────────────────────────────────

  describe('getEmpresaHoy', () => {
    it('ADMIN: debe llamar getEmpresaHoy con rutaIds undefined', async () => {
      const user = { rol: 'ADMIN', empresa: 'emp1' };

      const result = await controller.getEmpresaHoy('emp1', user as any);

      expect(trackingService.getOnlineCobradorIds).toHaveBeenCalledWith('emp1');
      expect(trackingService.getEmpresaHoy).toHaveBeenCalledWith(
        'emp1',
        expect.any(Set),
        undefined,
      );
      expect(result).toEqual(mockEmpresaHoyResult);
    });

    it('SUPERVISOR: debe llamar getEmpresaHoy con rutaIds ["r1"]', async () => {
      const user = { rol: 'SUPERVISOR', empresa: 'emp1', rutas: ['r1'] };

      const result = await controller.getEmpresaHoy('emp1', user as any);

      expect(trackingService.getOnlineCobradorIds).toHaveBeenCalledWith('emp1');
      expect(trackingService.getEmpresaHoy).toHaveBeenCalledWith(
        'emp1',
        expect.any(Set),
        ['r1'],
      );
      expect(result).toEqual(mockEmpresaHoyResult);
    });

    describe('assertSameEmpresa (a través de getEmpresaHoy)', () => {
      it('debe pasar cuando empresa es string y coincide', async () => {
        const user = { rol: 'ADMIN', empresa: 'emp1' };

        await expect(
          controller.getEmpresaHoy('emp1', user as any),
        ).resolves.toBeDefined();
      });

      it('debe pasar cuando empresa es { _id: "emp1" } y coincide (normalizeId)', async () => {
        const user = { rol: 'ADMIN', empresa: { _id: 'emp1', name: 'x' } };

        await expect(
          controller.getEmpresaHoy('emp1', user as any),
        ).resolves.toBeDefined();
      });

      it('debe lanzar ForbiddenException cuando empresa del usuario no coincide', async () => {
        const user = { rol: 'ADMIN', empresa: 'emp2' };

        await expect(
          controller.getEmpresaHoy('emp1', user as any),
        ).rejects.toThrow(ForbiddenException);
      });

      it('debe lanzar ForbiddenException cuando empresa es objeto populated con _id diferente', async () => {
        const user = {
          rol: 'ADMIN',
          empresa: { _id: 'other', name: 'x' },
        };

        await expect(
          controller.getEmpresaHoy('emp1', user as any),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  // ── getCobradorHoy ─────────────────────────────────────────────

  describe('getCobradorHoy', () => {
    it('ADMIN: debe poder ver cualquier cobrador de su empresa', async () => {
      const user = { rol: 'ADMIN', empresa: 'emp1' };
      authService.findTrackingProfileById.mockResolvedValue({
        _id: 'cobrador2',
        nombre: 'Cobrador 2',
        rutaId: 'ruta2',
        empresaId: 'emp1',
      });
      trackingService.isCobradorOnline.mockReturnValue(false);
      trackingService.getCobradorHoy.mockResolvedValue({
        cobradorId: 'cobrador2',
        nombre: 'Cobrador 2',
        rutaId: 'ruta2',
        online: false,
        puntos: [],
      });

      const result = await controller.getCobradorHoy(
        'cobrador2',
        user as any,
      );

      expect(trackingService.getCobradorHoy).toHaveBeenCalledWith(
        'cobrador2',
        false,
      );
      expect(result.cobradorId).toBe('cobrador2');
    });

    it('SUPERVISOR: debe lanzar ForbiddenException cuando el cobrador no pertenece a sus rutas', async () => {
      const user = { rol: 'SUPERVISOR', empresa: 'emp1', rutas: ['ruta1'] };
      authService.findTrackingProfileById.mockResolvedValue({
        _id: 'cobrador2',
        nombre: 'Cobrador 2',
        rutaId: 'ruta2',
        empresaId: 'emp1',
      });

      await expect(
        controller.getCobradorHoy('cobrador2', user as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe lanzar NotFoundException cuando el cobrador no existe', async () => {
      const user = { rol: 'ADMIN', empresa: 'emp1' };
      authService.findTrackingProfileById.mockResolvedValue(null);

      await expect(
        controller.getCobradorHoy('inexistente', user as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar ForbiddenException cuando el cobrador no tiene empresa asignada', async () => {
      const user = { rol: 'ADMIN', empresa: 'emp1' };
      authService.findTrackingProfileById.mockResolvedValue({
        _id: 'cobrador1',
        nombre: 'SinEmpresa',
        rutaId: 'ruta1',
        empresaId: null,
      });

      await expect(
        controller.getCobradorHoy('cobrador1', user as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('SUPERVISOR: debe poder ver cobrador dentro de sus rutas asignadas', async () => {
      const user = { rol: 'SUPERVISOR', empresa: 'emp1', rutas: ['ruta1', 'ruta2'] };
      authService.findTrackingProfileById.mockResolvedValue({
        _id: 'cobrador1',
        nombre: 'Cobrador 1',
        rutaId: 'ruta2',
        empresaId: 'emp1',
      });
      trackingService.isCobradorOnline.mockReturnValue(true);

      const result = await controller.getCobradorHoy('cobrador1', user as any);

      expect(trackingService.isCobradorOnline).toHaveBeenCalledWith('cobrador1');
      expect(trackingService.getCobradorHoy).toHaveBeenCalledWith('cobrador1', true);
      expect(result).toBeDefined();
    });
  });
});
