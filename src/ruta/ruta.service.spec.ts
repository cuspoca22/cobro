import { Test, TestingModule } from '@nestjs/testing';
import { RutaService } from './ruta.service';
import { getModelToken } from '@nestjs/mongoose';
import { Ruta } from './schema/ruta.schema';
import { Credito } from '../credito/schemas/credito.schema';
import { Cliente } from '../cliente/schema/cliente.schema';
import { Caja } from '../caja/schemas/caja.schema';
import { AuthService } from '../auth/auth.service';
import { CajaService } from '../caja/caja.service';
import { MessageGateway } from '../message/message.gateway';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('RutaService', () => {
  let service: RutaService;
  let mockRutaModel: any;
  let mockCajaModel: any;
  let mockCajaService: any;
  let mockConnection: any;
  let mockSession: any;

  beforeEach(async () => {
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    mockRutaModel = {
      findById: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    mockCajaModel = {
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockCajaService = {
      getUltimaCaja: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RutaService,
        {
          provide: getModelToken(Ruta.name),
          useValue: mockRutaModel,
        },
        {
          provide: getModelToken(Credito.name),
          useValue: {},
        },
        {
          provide: getModelToken(Cliente.name),
          useValue: {},
        },
        {
          provide: getModelToken(Caja.name),
          useValue: mockCajaModel,
        },
        {
          provide: AuthService,
          useValue: {},
        },
        {
          provide: CajaService,
          useValue: mockCajaService,
        },
        {
          provide: MessageGateway,
          useValue: {},
        },
        {
          provide: DateFnsAdapter,
          useValue: {
            getStartOfTodayInTimeZone: jest.fn().mockReturnValue(new Date()),
          },
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
      ],
    }).compile();

    service = module.get<RutaService>(RutaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('openRuta', () => {
    it('should throw BadRequestException if ruta is already open', async () => {
      const rutaId = 'someId';
      const mockRuta = { status: true };

      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      await expect(service.openRuta(rutaId)).rejects.toThrow(BadRequestException);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should open ruta successfully if not open', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const mockRuta = {
        status: false,
        timeZone: 'UTC',
        save: jest.fn(),
        caja_actual: null
      };
      const mockNewCaja = { id: new Types.ObjectId().toHexString() };

      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      mockCajaService.getUltimaCaja.mockResolvedValue({
        hayUltimaCaja: false,
        ultimaCaja: null,
      });

      mockCajaService.create.mockResolvedValue(mockNewCaja);

      const result = await service.openRuta(rutaId);

      expect(result).toEqual({ ok: true, caja: mockNewCaja });
      expect(mockRuta.status).toBe(true);
      expect(mockRuta.save).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should use previous box final value as base if available', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const mockRuta = {
        status: false,
        timeZone: 'UTC',
        save: jest.fn(),
        caja_actual: null
      };
      const mockUltimaCaja = { caja_final: 1000 };
      const mockNewCaja = { id: new Types.ObjectId().toHexString() };

      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      mockCajaService.getUltimaCaja.mockResolvedValue({
        hayUltimaCaja: true,
        ultimaCaja: mockUltimaCaja,
      });

      mockCajaService.create.mockResolvedValue(mockNewCaja);

      await service.openRuta(rutaId);

      expect(mockCajaService.create).toHaveBeenCalledWith(expect.objectContaining({
        base: 1000
      }));
    });
  });

  describe('closeRuta', () => {
    it('should throw NotFoundException if ruta does not exist', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(service.closeRuta(rutaId)).rejects.toThrow('La ruta con el id ' + rutaId + ' no existe');
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should throw BadRequestException if ruta has no caja_actual', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const mockRuta = { caja_actual: null };
      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      await expect(service.closeRuta(rutaId)).rejects.toThrow(BadRequestException);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if ruta is already closed', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const mockRuta = { caja_actual: 'someCajaId', status: false };
      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      await expect(service.closeRuta(rutaId)).rejects.toThrow(BadRequestException);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if caja does not exist', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const mockRuta = { caja_actual: new Types.ObjectId().toHexString(), status: true };

      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      mockCajaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(service.closeRuta(rutaId)).rejects.toThrow(NotFoundException);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should close ruta successfully', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const cajaId = new Types.ObjectId().toHexString();
      const mockRuta = {
        caja_actual: cajaId,
        status: true,
        save: jest.fn(),
        ultima_caja: null
      };
      const mockCaja = {
        _id: cajaId,
        status: true,
        save: jest.fn()
      };

      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      mockCajaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockCaja),
      });

      const result = await service.closeRuta(rutaId);

      expect(result).toBe(true);
      expect(mockRuta.status).toBe(false);
      expect(mockRuta.ultima_caja).toBe(cajaId);
      expect(mockCaja.status).toBe(false);
      expect(mockRuta.save).toHaveBeenCalled();
      expect(mockCaja.save).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });
});
