import { Test, TestingModule } from '@nestjs/testing';
import { RutaService } from './ruta.service';
import { getModelToken } from '@nestjs/mongoose';
import { Ruta } from './schema/ruta.schema';
import { AuthService } from '../auth/auth.service';
import { CajaService } from '../caja/caja.service';
import { CreditoService } from '../credito/credito.service';
import { ClienteService } from '../cliente/cliente.service';
import { MovimientoCajaService } from '../movimientoCaja/movimiento-caja.service';
import { EmpresaService } from '../empresa/empresa.service';
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
  let mockCajaService: any;
  let mockCreditoService: any;
  let mockClienteService: any;
  let mockMovimientoCajaService: any;
  let mockAuthService: any;
  let mockEmpresaService: any;
  let mockConnection: any;
  let mockSession: any;
  let mockSocketGateway: {
    emitRutaLockState: jest.Mock;
    emitCloseCaja: jest.Mock;
    emitOpenCaja: jest.Mock;
  };

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
      findByIdAndDelete: jest.fn(),
    };

    mockCajaService = {
      getUltimaCaja: jest.fn(),
      findByRutaAndFecha: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      getMovimientosResumen: jest.fn().mockResolvedValue(undefined),
      congelarSnapshotCierre: jest.fn().mockResolvedValue(undefined),
      deleteManyByRuta: jest.fn(),
      markClosed: jest.fn().mockResolvedValue(undefined),
      markOpen: jest.fn(),
      findByIdLean: jest.fn().mockResolvedValue(null),
    };

    mockCreditoService = {
      deleteManyByRuta: jest.fn(),
      findIdsAndValorByRuta: jest.fn().mockResolvedValue([]),
      getCarteraYGananciaByRuta: jest.fn().mockResolvedValue({ cartera: 0, ganancia_total: 0 }),
    };

    mockClienteService = {
      countByRuta: jest.fn().mockResolvedValue(0),
      deleteManyByRuta: jest.fn(),
    };

    mockMovimientoCajaService = {
      deleteManyByRuta: jest.fn(),
    };

    mockAuthService = {
      findOne: jest.fn(),
      findOneByRuta: jest.fn().mockResolvedValue(null),
      unsetRuta: jest.fn(),
    };

    mockEmpresaService = {
      pullRuta: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RutaService,
        {
          provide: getModelToken(Ruta.name),
          useValue: mockRutaModel,
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
          provide: CreditoService,
          useValue: mockCreditoService,
        },
        {
          provide: ClienteService,
          useValue: mockClienteService,
        },
        {
          provide: MovimientoCajaService,
          useValue: mockMovimientoCajaService,
        },
        {
          provide: EmpresaService,
          useValue: mockEmpresaService,
        },
        {
          provide: MessageGateway,
          useValue: {
            emitRutaLockState: jest.fn(),
            emitCloseCaja: jest.fn(),
            emitOpenCaja: jest.fn(),
          },
        },
        {
          provide: DateFnsAdapter,
          useValue: {
            getStartOfTodayInTimeZone: jest.fn().mockReturnValue(new Date()),
            getLocalTimeParts: jest.fn().mockReturnValue({ hour: 10, minute: 0 }),
          },
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
      ],
    }).compile();

    service = module.get<RutaService>(RutaService);
    mockSocketGateway = module.get(MessageGateway);
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
        _id: new Types.ObjectId(rutaId),
        status: false,
        timeZone: 'UTC',
        save: jest.fn(),
        caja_actual: null
      };
      const mockNewCaja = { id: new Types.ObjectId().toHexString() };

      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      mockCajaService.findByRutaAndFecha.mockResolvedValue(null);
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
      expect(mockSocketGateway.emitOpenCaja).toHaveBeenCalledWith(rutaId);
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should use previous box final value as base if available', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const mockRuta = {
        _id: new Types.ObjectId(rutaId),
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

      mockCajaService.findByRutaAndFecha.mockResolvedValue(null);
      mockCajaService.getUltimaCaja.mockResolvedValue({
        hayUltimaCaja: true,
        ultimaCaja: mockUltimaCaja,
      });

      mockCajaService.create.mockResolvedValue(mockNewCaja);

      await service.openRuta(rutaId);

      expect(mockCajaService.create).toHaveBeenCalledWith(expect.objectContaining({
        base: 1000
      }), expect.anything());
      expect(mockCajaService.markOpen).not.toHaveBeenCalled();
    });

    it('should reopen existing same-day caja without creating a new one', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const cajaId = new Types.ObjectId().toHexString();
      const mockRuta = {
        _id: new Types.ObjectId(rutaId),
        status: false,
        timeZone: 'UTC',
        save: jest.fn(),
        caja_actual: cajaId,
      };
      const cajaDelDia = {
        id: cajaId,
        base: 500,
        caja_final: 800,
        status: false,
      };
      const cajaReabierta = { ...cajaDelDia, status: true };

      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      mockCajaService.findByRutaAndFecha.mockResolvedValue(cajaDelDia);
      mockCajaService.markOpen.mockResolvedValue(cajaReabierta);

      const result = await service.openRuta(rutaId);

      expect(result).toEqual({ ok: true, caja: cajaReabierta });
      expect(mockRuta.status).toBe(true);
      expect(mockRuta.caja_actual).toEqual(new Types.ObjectId(cajaId));
      expect(mockCajaService.markOpen).toHaveBeenCalledWith(cajaId, expect.anything());
      expect(mockCajaService.create).not.toHaveBeenCalled();
      expect(mockCajaService.getUltimaCaja).not.toHaveBeenCalled();
      expect(mockSocketGateway.emitOpenCaja).toHaveBeenCalledWith(rutaId);
      expect(mockSession.commitTransaction).toHaveBeenCalled();
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
      const cajaId = new Types.ObjectId().toHexString();
      const mockRuta = { _id: rutaId, caja_actual: cajaId, status: true };

      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      mockCajaService.findByIdLean.mockResolvedValue(null);

      await expect(service.closeRuta(rutaId)).rejects.toThrow(NotFoundException);
      expect(mockSession.abortTransaction).toHaveBeenCalled();
    });

    it('should close ruta successfully', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const cajaId = new Types.ObjectId().toHexString();
      const mockRuta = {
        _id: rutaId,
        caja_actual: cajaId,
        status: true,
        save: jest.fn(),
        ultima_caja: null
      };

      mockRutaModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockRuta),
      });

      mockCajaService.findByIdLean.mockResolvedValue({ _id: cajaId, ruta: rutaId });
      mockCajaService.congelarSnapshotCierre.mockResolvedValue(undefined);
      mockCajaService.markClosed.mockResolvedValue(undefined);

      const result = await service.closeRuta(rutaId);

      expect(result).toBe(true);
      expect(mockRuta.status).toBe(false);
      expect(mockRuta.ultima_caja).toBe(cajaId);
      expect(mockRuta.save).toHaveBeenCalled();
      expect(mockCajaService.markClosed).toHaveBeenCalledWith(cajaId, expect.anything());
      expect(mockCajaService.congelarSnapshotCierre).toHaveBeenCalledWith(rutaId, expect.anything());
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSocketGateway.emitCloseCaja).toHaveBeenCalledWith(rutaId);
      expect(mockSession.endSession).toHaveBeenCalled();
    });

  });

  describe('lockRuta', () => {
    it('should throw NotFoundException if ruta does not exist', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      mockRutaModel.findById.mockResolvedValue(null);

      await expect(service.lockRuta(rutaId)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if ruta is closed', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      mockRutaModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(rutaId),
        status: false,
        isLocked: false,
        save: jest.fn(),
      });

      await expect(service.lockRuta(rutaId)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if ruta is already locked', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      mockRutaModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(rutaId),
        status: true,
        isLocked: true,
        save: jest.fn(),
      });

      await expect(service.lockRuta(rutaId)).rejects.toThrow(BadRequestException);
    });

    it('should lock ruta and emit block-caja payload', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const mockRuta = {
        _id: new Types.ObjectId(rutaId),
        status: true,
        isLocked: false,
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockRutaModel.findById.mockResolvedValue(mockRuta);

      const result = await service.lockRuta(rutaId);

      expect(mockRuta.isLocked).toBe(true);
      expect(mockRuta.save).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        ruta: rutaId,
        isLocked: true,
      });
      expect(mockSocketGateway.emitRutaLockState).toHaveBeenCalledWith({
        ruta: rutaId,
        isLocked: true,
      });
    });
  });

  describe('unlockRuta', () => {
    it('should throw NotFoundException if ruta does not exist', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      mockRutaModel.findById.mockResolvedValue(null);

      await expect(service.unlockRuta(rutaId)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if ruta is not locked', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      mockRutaModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(rutaId),
        status: true,
        isLocked: false,
        save: jest.fn(),
      });

      await expect(service.unlockRuta(rutaId)).rejects.toThrow(BadRequestException);
    });

    it('should unlock ruta and emit unblock-caja payload', async () => {
      const rutaId = new Types.ObjectId().toHexString();
      const mockRuta = {
        _id: new Types.ObjectId(rutaId),
        status: true,
        isLocked: true,
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockRutaModel.findById.mockResolvedValue(mockRuta);

      const result = await service.unlockRuta(rutaId);

      expect(mockRuta.isLocked).toBe(false);
      expect(mockRuta.save).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        ruta: rutaId,
        isLocked: false,
      });
      expect(mockSocketGateway.emitRutaLockState).toHaveBeenCalledWith({
        ruta: rutaId,
        isLocked: false,
      });
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
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockRuta),
          }),
        }),
      });
      mockClienteService.countByRuta
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockCreditoService.getCarteraYGananciaByRuta.mockResolvedValue({
        cartera: 0,
        ganancia_total: 0,
      });

      const result = await service.findOne(rutaId);
      expect(result).toBeDefined();
      expect(mockClienteService.countByRuta).toHaveBeenCalledTimes(2);
      expect(mockCreditoService.getCarteraYGananciaByRuta).toHaveBeenCalled();
    });

    it('should throw NotFoundException if ruta not found', async () => {
      const rutaId = 'someId';
      mockRutaModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
          }),
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
      expect(mockRutaModel.findByIdAndUpdate).toHaveBeenCalledWith(rutaId, updateRutaDto, { returnDocument: 'after' });
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
      mockClienteService.countByRuta
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5);
      mockCreditoService.findIdsAndValorByRuta.mockResolvedValue([
        { valor_credito: 1000 },
        { valor_credito: 2000 },
      ]);

      await service.actualizarRuta(rutaId);

      expect(mockRutaModel.findById).toHaveBeenCalledWith(rutaId);
      expect(mockClienteService.countByRuta).toHaveBeenCalledTimes(2);
      expect(mockCreditoService.findIdsAndValorByRuta).toHaveBeenCalledTimes(1);

      // Total prestado = 1000 + 2000 = 3000
      expect(mockRuta.updateOne).toHaveBeenCalledWith({
        total_prestado: 3000,
        clientes: 10,
        clientes_activos: 5,
      }, { returnDocument: 'after' });
    });

    it('should throw NotFoundException if ruta not found', async () => {
      const rutaId = 'someId';
      mockRutaModel.findById.mockResolvedValue(null);

      await expect(service.actualizarRuta(rutaId)).rejects.toThrow(NotFoundException);
    });
  });
});
