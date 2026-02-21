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
import { BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CreateRutaDto } from './dto/create-ruta.dto';
import { UpdateRutaDto } from './dto/update-ruta.dto';

describe('RutaService', () => {
  let service: RutaService;
  let mockRutaModel: any;
  let mockCajaModel: any;
  let mockCajaService: any;
  let mockCreditoModel: any;
  let mockClienteModel: any;
  let mockAuthService: any;
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

    mockCreditoModel = {
      find: jest.fn(),
    };

    mockClienteModel = {
      countDocuments: jest.fn(),
    };

    mockAuthService = {
      findOne: jest.fn(),
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
          useValue: mockCreditoModel,
        },
        {
          provide: getModelToken(Cliente.name),
          useValue: mockClienteModel,
        },
        {
          provide: getModelToken(Caja.name),
          useValue: mockCajaModel,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
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
      expect(mockRuta.save).toHaveBeenCalledWith({ session: expect.anything() });
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
      }), expect.anything());
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

  describe('create', () => {
    it('should create a ruta successfully', async () => {
      const createRutaDto: CreateRutaDto = { nombre: 'Ruta 1', ciudad: 'City', pais: 'Country', timeZone: 'UTC', autoOpen: true, currency: 'COP' };
      const mockCreatedRuta = { ...createRutaDto, _id: 'someId' };
      mockRutaModel.create.mockResolvedValue(mockCreatedRuta);

      const result = await service.create(createRutaDto);

      expect(result).toEqual(mockCreatedRuta);
      expect(mockRutaModel.create).toHaveBeenCalledWith(createRutaDto);
    });

    it('should handle exceptions during creation', async () => {
      const createRutaDto: CreateRutaDto = { nombre: 'Ruta 1', ciudad: 'City', pais: 'Country', timeZone: 'UTC', autoOpen: true, currency: 'COP' };
      mockRutaModel.create.mockRejectedValue(new Error('Some error'));

      await expect(service.create(createRutaDto)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findOne', () => {
    it('should return a ruta if found', async () => {
      const rutaId = 'someId';
      const mockRuta = { _id: rutaId, nombre: 'Ruta 1' };
      mockRutaModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockRuta),
        }),
      });

      const result = await service.findOne(rutaId);
      expect(result).toEqual(mockRuta);
    });

    it('should throw NotFoundException if ruta not found', async () => {
      const rutaId = 'someId';
      mockRutaModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(service.findOne(rutaId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a ruta successfully', async () => {
      const rutaId = 'someId';
      const updateRutaDto: UpdateRutaDto = { nombre: 'Ruta Updated' };
      const mockUpdatedRuta = { _id: rutaId, ...updateRutaDto };
      mockRutaModel.findByIdAndUpdate.mockResolvedValue(mockUpdatedRuta);

      const result = await service.update(rutaId, updateRutaDto);
      expect(result).toEqual(mockUpdatedRuta);
      expect(mockRutaModel.findByIdAndUpdate).toHaveBeenCalledWith(rutaId, updateRutaDto, { new: true });
    });
  });

  describe('actualizarRuta', () => {
    it('should update ruta stats successfully', async () => {
      const rutaId = 'someId';
      const mockRuta = {
        _id: rutaId,
        updateOne: jest.fn().mockResolvedValue(true),
      };

      mockRutaModel.findById.mockResolvedValue(mockRuta);
      mockClienteModel.countDocuments.mockImplementation((filter) => {
        if (filter.status === true) return Promise.resolve(5); // clientes activos
        return Promise.resolve(10); // total clientes
      });
      mockCreditoModel.find.mockImplementation((filter) => {
        if (filter.status === true) return Promise.resolve([]); // creditos activos
        return Promise.resolve([
          { valor_credito: 1000 },
          { valor_credito: 2000 }
        ]); // todos los creditos for totalPrestado calculation
      });

      await service.actualizarRuta(rutaId);

      expect(mockRutaModel.findById).toHaveBeenCalledWith(rutaId);
      expect(mockClienteModel.countDocuments).toHaveBeenCalledTimes(2);
      expect(mockCreditoModel.find).toHaveBeenCalledTimes(2);

      // Total prestado = 1000 + 2000 = 3000
      expect(mockRuta.updateOne).toHaveBeenCalledWith({
        total_prestado: 3000,
        clientes: 10,
        clientes_activos: 5,
      }, { new: true });
    });

    it('should throw NotFoundException if ruta not found', async () => {
      const rutaId = 'someId';
      mockRutaModel.findById.mockResolvedValue(null);

      await expect(service.actualizarRuta(rutaId)).rejects.toThrow(NotFoundException);
    });
  });
});
