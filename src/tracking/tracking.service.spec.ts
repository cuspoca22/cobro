import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { TrackingService } from './tracking.service';
import { CobradorTracking } from './schemas/cobrador-tracking.schema';
import { AuthService } from '../auth/auth.service';
import { RutaService } from '../ruta/ruta.service';

describe('TrackingService', () => {
  let service: TrackingService;
  let mockTrackingModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
  };
  let authService: {
    findTrackingProfilesByIds: jest.Mock;
    findTrackingProfileById: jest.Mock;
  };
  let rutaService: {
    findLean: jest.Mock;
  };

  const empresaId = new Types.ObjectId().toString();
  const cobradorId = new Types.ObjectId().toString();
  const rutaId = new Types.ObjectId();

  beforeEach(async () => {
    mockTrackingModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn() }),
    };
    authService = {
      findTrackingProfilesByIds: jest.fn(),
      findTrackingProfileById: jest.fn(),
    };
    rutaService = {
      findLean: jest.fn().mockResolvedValue([{ timeZone: 'UTC' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingService,
        { provide: getModelToken(CobradorTracking.name), useValue: mockTrackingModel },
        { provide: AuthService, useValue: authService },
        { provide: RutaService, useValue: rutaService },
      ],
    }).compile();

    service = module.get(TrackingService);
  });

  describe('presencia online', () => {
    it('register/unregister y getOnlineCobradorIds por empresa', () => {
      service.registerCobradorOnline('sock-1', {
        userId: cobradorId,
        empresaId,
        nombre: 'Demo',
        rutaId: rutaId.toString(),
      });

      expect(service.isCobradorOnline(cobradorId)).toBe(true);
      expect(service.getOnlineCobradorIds(empresaId).has(cobradorId)).toBe(true);
      expect(service.getOnlineCobradorIds(new Types.ObjectId().toString()).size).toBe(0);

      // segundo socket: aún online
      service.registerCobradorOnline('sock-2', {
        userId: cobradorId,
        empresaId,
        nombre: 'Demo',
        rutaId: rutaId.toString(),
      });
      expect(service.unregisterCobradorSocket(cobradorId, 'sock-1')).toBe(false);
      expect(service.isCobradorOnline(cobradorId)).toBe(true);

      expect(service.unregisterCobradorSocket(cobradorId, 'sock-2')).toBe(true);
      expect(service.isCobradorOnline(cobradorId)).toBe(false);
    });
  });

  describe('getEmpresaHoy', () => {
    it('retorna [] si no hay docs ni online', async () => {
      rutaService.findLean.mockResolvedValue([]);
      mockTrackingModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getEmpresaHoy(empresaId, new Set());
      expect(result).toEqual([]);
    });

    it('incluye cobradores con tracking del día y marca online', async () => {
      const at = new Date('2026-07-22T18:00:00.000Z');
      mockTrackingModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(),
            cobrador: new Types.ObjectId(cobradorId),
            ruta: rutaId,
            puntos: [
              {
                coordinates: [-90.5, 14.6],
                at,
                accuracy: 10,
              },
            ],
            ultimaUbicacion: {
              coordinates: [-90.5, 14.6],
              at,
              accuracy: 10,
            },
          },
        ]),
      });

      authService.findTrackingProfilesByIds.mockResolvedValue([
        {
          _id: cobradorId,
          nombre: 'Demo',
          rutaId: rutaId.toString(),
        },
      ]);

      const result = await service.getEmpresaHoy(
        empresaId,
        new Set([cobradorId]),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        cobradorId,
        nombre: 'Demo',
        online: true,
      });
      expect(result[0].puntos).toHaveLength(1);
      expect(result[0].ultimaUbicacion?.lng).toBe(-90.5);
    });

    it('incluye cobrador online sin puntos del día', async () => {
      mockTrackingModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });
      authService.findTrackingProfilesByIds.mockResolvedValue([
        {
          _id: cobradorId,
          nombre: 'Solo Online',
          rutaId: rutaId.toString(),
        },
      ]);

      const result = await service.getEmpresaHoy(
        empresaId,
        new Set([cobradorId]),
      );

      expect(result).toEqual([
        expect.objectContaining({
          cobradorId,
          nombre: 'Solo Online',
          online: true,
          puntos: [],
        }),
      ]);
    });

    it('filtra por rutaIds cuando se pasa scope de supervisor', async () => {
      mockTrackingModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getEmpresaHoy(
        empresaId,
        new Set([cobradorId]),
        [],
      );
      expect(result).toEqual([]);
      expect(mockTrackingModel.find).not.toHaveBeenCalled();
    });
  });

  describe('getCobradorHoy', () => {
    it('lanza NotFoundException si el cobrador no existe', async () => {
      authService.findTrackingProfileById.mockResolvedValue(null);

      await expect(
        service.getCobradorHoy(cobradorId, false),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
