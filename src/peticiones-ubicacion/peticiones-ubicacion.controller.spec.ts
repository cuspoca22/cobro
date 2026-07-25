import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PeticionesUbicacionController } from './peticiones-ubicacion.controller';
import { PeticionesUbicacionService } from './peticiones-ubicacion.service';
import { ValidRoles } from '../auth/interfaces/valid-roles';

jest.mock('src/auth/decorators/auth.decorator', () => ({ Auth: () => jest.fn() }));
jest.mock('src/auth/decorators/get-user.decorator', () => ({ GetUser: () => jest.fn() }));

describe('PeticionesUbicacionController', () => {
  let controller: PeticionesUbicacionController;
  let service: jest.Mocked<PeticionesUbicacionService>;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PeticionesUbicacionController],
      providers: [
        {
          provide: PeticionesUbicacionService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<PeticionesUbicacionController>(PeticionesUbicacionController);
    service = module.get(PeticionesUbicacionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ===================== CREATE =====================
  describe('create', () => {
    const createDto = {
      id_ruta: 'ruta1',
      id_cliente: 'cliente1',
      old_ubicacion: [-90.5, 14.6],
      new_ubicacion: [-90.4, 14.7],
    } as any;

    it('COBRADOR with ruta=ruta1 creating petition with id_ruta=ruta1 should pass (Bug C1 fix)', async () => {
      const user = { rol: ValidRoles.cobrador, ruta: 'ruta1' } as any;
      mockService.create.mockResolvedValue(true);

      const result = await controller.create(createDto, user);

      expect(result).toBe(true);
      expect(mockService.create).toHaveBeenCalledWith(createDto, user);
    });

    it('COBRADOR with ruta=ruta1 creating petition with id_ruta=ruta2 should throw ForbiddenException', async () => {
      const user = { rol: ValidRoles.cobrador, ruta: 'ruta1' } as any;
      const dtoRuta2 = { ...createDto, id_ruta: 'ruta2' };

      await expect(controller.create(dtoRuta2, user)).rejects.toThrow(ForbiddenException);
      expect(mockService.create).not.toHaveBeenCalled();
    });

    it('COBRADOR WITHOUT ruta (ruta undefined) creating petition should throw ForbiddenException (Bug C1)', async () => {
      const user = { rol: ValidRoles.cobrador, ruta: undefined } as any;
      const dtoWithRuta = { ...createDto, id_ruta: 'any-ruta' };

      await expect(controller.create(dtoWithRuta, user)).rejects.toThrow(ForbiddenException);
      expect(mockService.create).not.toHaveBeenCalled();
    });

    it('ADMIN creating petition bypasses ruta scope check', async () => {
      const user = { rol: ValidRoles.admin, empresa: 'emp1' } as any;
      const dtoAnyRuta = { ...createDto, id_ruta: 'any-ruta' };
      mockService.create.mockResolvedValue(true);

      const result = await controller.create(dtoAnyRuta, user);

      expect(result).toBe(true);
      expect(mockService.create).toHaveBeenCalledWith(dtoAnyRuta, user);
    });

    it('create with no id_ruta in dto skips scope check entirely', async () => {
      const user = { rol: ValidRoles.cobrador, ruta: undefined } as any;
      const dtoNoRuta = { ...createDto };
      delete dtoNoRuta.id_ruta;
      mockService.create.mockResolvedValue(true);

      const result = await controller.create(dtoNoRuta, user);

      expect(result).toBe(true);
      expect(mockService.create).toHaveBeenCalledWith(dtoNoRuta, user);
    });
  });

  // ===================== FINDALL =====================
  describe('findAll', () => {
    const filterDto = { estado: 'pendiente' } as any;

    it('ADMIN user: empresa normalized, no ruta scope filter applied', async () => {
      const user = { rol: ValidRoles.admin, empresa: 'empId' } as any;
      mockService.findAll.mockResolvedValue([]);

      await controller.findAll(user, filterDto);

      const callArgs = mockService.findAll.mock.calls[0][0];
      expect(callArgs.id_empresa).toBe('empId');
      expect(callArgs.rutaIds).toBeUndefined();
    });

    it('SUPERVISOR with rutas=[r1,r2]: rutaIds passed to service', async () => {
      const user = { rol: ValidRoles.supervisor, empresa: 'empId', rutas: ['r1', 'r2'] } as any;
      mockService.findAll.mockResolvedValue([]);

      await controller.findAll(user, filterDto);

      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          id_empresa: 'empId',
          rutaIds: ['r1', 'r2'],
        }),
      );
    });

    it('User with no empresa throws BadRequestException', async () => {
      const user = { rol: ValidRoles.admin, empresa: undefined } as any;

      await expect(controller.findAll(user, filterDto)).rejects.toThrow(BadRequestException);
      expect(mockService.findAll).not.toHaveBeenCalled();
    });

    it('Query with id_ruta outside scope for supervisor throws ForbiddenException', async () => {
      const user = { rol: ValidRoles.supervisor, empresa: 'empId', rutas: ['r1', 'r2'] } as any;
      const dtoWithRuta = { ...filterDto, id_ruta: 'r3' };

      await expect(controller.findAll(user, dtoWithRuta)).rejects.toThrow(ForbiddenException);
      expect(mockService.findAll).not.toHaveBeenCalled();
    });

    it('superAdmin bypasses empresa check and ruta scope', async () => {
      const user = { rol: ValidRoles.superAdmin } as any;
      mockService.findAll.mockResolvedValue([]);

      await controller.findAll(user, filterDto);

      const callArgs = mockService.findAll.mock.calls[0][0];
      expect(callArgs.id_empresa).toBeUndefined();
      expect(callArgs.rutaIds).toBeUndefined();
    });

    it('normalizes empresa object to string id via normalizeId', async () => {
      const user = { rol: ValidRoles.admin, empresa: { _id: 'empObjId', name: 'test' } } as any;
      mockService.findAll.mockResolvedValue([]);

      await controller.findAll(user, filterDto);

      const callArgs = mockService.findAll.mock.calls[0][0];
      expect(callArgs.id_empresa).toBe('empObjId');
    });

    it('converts fecha strings to Date objects', async () => {
      const user = { rol: ValidRoles.superAdmin } as any;
      const dtoWithDates = {
        fecha_desde: '2024-01-01T00:00:00.000Z',
        fecha_hasta: '2024-12-31T00:00:00.000Z',
      } as any;
      mockService.findAll.mockResolvedValue([]);

      await controller.findAll(user, dtoWithDates);

      const callArgs = mockService.findAll.mock.calls[0][0];
      expect(callArgs.fecha_desde).toBeInstanceOf(Date);
      expect(callArgs.fecha_hasta).toBeInstanceOf(Date);
    });
  });

  // ===================== FINDONE =====================
  describe('findOne', () => {
    const petId = '507f1f77bcf86cd799439011';

    it('should return entity when ruta id is in user scope', async () => {
      const user = { rol: ValidRoles.cobrador, ruta: 'ruta1' } as any;
      const pet = { ruta: { id: 'ruta1' } } as any;
      mockService.findOne.mockResolvedValue(pet);

      const result = await controller.findOne(user, petId);

      expect(result).toBe(pet);
      expect(mockService.findOne).toHaveBeenCalledWith(petId);
    });

    it('should throw ForbiddenException when ruta id is outside scope', async () => {
      const user = { rol: ValidRoles.cobrador, ruta: 'ruta1' } as any;
      const pet = { ruta: { id: 'ruta2' } } as any;
      mockService.findOne.mockResolvedValue(pet);

      await expect(controller.findOne(user, petId)).rejects.toThrow(ForbiddenException);
      expect(mockService.findOne).toHaveBeenCalledWith(petId);
    });

    it('should pass when entity has no ruta populated', async () => {
      const user = { rol: ValidRoles.cobrador, ruta: undefined } as any;
      const pet = { ruta: null } as any;
      mockService.findOne.mockResolvedValue(pet);

      const result = await controller.findOne(user, petId);

      expect(result).toBe(pet);
    });

    it('admin bypasses ruta scope check on findOne', async () => {
      const user = { rol: ValidRoles.admin, empresa: 'emp1' } as any;
      const pet = { ruta: { id: 'any-ruta' } } as any;
      mockService.findOne.mockResolvedValue(pet);

      const result = await controller.findOne(user, petId);

      expect(result).toBe(pet);
    });
  });

  // ===================== UPDATE =====================
  describe('update', () => {
    const petId = '507f1f77bcf86cd799439011';
    const updateDto = { estado: 'aceptada' } as any;

    it('should update when ruta is in supervisor scope', async () => {
      const user = { rol: ValidRoles.supervisor, rutas: ['r1', 'r2'] } as any;
      const pet = { ruta: { id: 'r1' } } as any;
      mockService.findOne.mockResolvedValue(pet);
      mockService.update.mockResolvedValue({ ...pet, ...updateDto });

      const result = await controller.update(user, petId, updateDto);

      expect(result).toEqual({ ...pet, ...updateDto });
      expect(mockService.findOne).toHaveBeenCalledWith(petId);
      expect(mockService.update).toHaveBeenCalledWith(petId, updateDto);
    });

    it('should throw ForbiddenException when ruta is outside scope', async () => {
      const user = { rol: ValidRoles.supervisor, rutas: ['r1', 'r2'] } as any;
      const pet = { ruta: { id: 'r3' } } as any;
      mockService.findOne.mockResolvedValue(pet);

      await expect(controller.update(user, petId, updateDto)).rejects.toThrow(ForbiddenException);
      expect(mockService.update).not.toHaveBeenCalled();
    });

    it('should update when entity has no ruta populated', async () => {
      const user = { rol: ValidRoles.supervisor, rutas: ['r1'] } as any;
      const pet = { ruta: null } as any;
      mockService.findOne.mockResolvedValue(pet);
      mockService.update.mockResolvedValue(pet);

      await controller.update(user, petId, updateDto);

      expect(mockService.update).toHaveBeenCalledWith(petId, updateDto);
    });
  });

  // ===================== REMOVE =====================
  describe('remove', () => {
    it('should delegate to service.remove', async () => {
      const petId = '507f1f77bcf86cd799439011';
      mockService.remove.mockResolvedValue({ message: 'eliminado' });

      const result = await controller.remove(petId);

      expect(result).toEqual({ message: 'eliminado' });
      expect(mockService.remove).toHaveBeenCalledWith(petId);
    });
  });
});
