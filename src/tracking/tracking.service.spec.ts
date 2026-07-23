import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { TrackingService } from './tracking.service';
import { CobradorTracking } from './schemas/cobrador-tracking.schema';
import { User } from '../auth/schemas/user.schema';
import { Ruta } from '../ruta/schema/ruta.schema';

describe('TrackingService', () => {
  let service: TrackingService;
  let mockTrackingModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
  };
  let mockUserModel: {
    find: jest.Mock;
    findById: jest.Mock;
  };
  let mockRutaModel: {
    find: jest.Mock;
    findById: jest.Mock;
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
    mockUserModel = {
      find: jest.fn(),
      findById: jest.fn(),
    };
    mockRutaModel = {
      find: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingService,
        { provide: getModelToken(CobradorTracking.name), useValue: mockTrackingModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Ruta.name), useValue: mockRutaModel },
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
      mockRutaModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      mockTrackingModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getEmpresaHoy(empresaId, new Set());
      expect(result).toEqual([]);
    });

    it('incluye cobradores con tracking del día y marca online', async () => {
      mockRutaModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ timeZone: 'UTC' }]),
        }),
      });

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

      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: new Types.ObjectId(cobradorId),
              nombre: 'Demo',
              ruta: rutaId,
            },
          ]),
        }),
      });

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
      mockRutaModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });
      mockTrackingModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });
      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: new Types.ObjectId(cobradorId),
              nombre: 'Solo Online',
              ruta: rutaId,
            },
          ]),
        }),
      });

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
  });

  describe('getCobradorHoy', () => {
    it('lanza NotFoundException si el cobrador no existe', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        service.getCobradorHoy(cobradorId, false),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
