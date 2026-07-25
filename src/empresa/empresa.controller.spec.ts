import { Test, TestingModule } from '@nestjs/testing';
import { EmpresaController } from './empresa.controller';
import { EmpresaService } from './empresa.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { CreateUserDto } from '../auth/dto';

jest.mock('src/auth/decorators', () => ({
  Auth: () => jest.fn(),
  GetUser: () => jest.fn(),
}), { virtual: true });

describe('EmpresaController', () => {
  let controller: EmpresaController;
  let empresaService: EmpresaService;

  const mockEmpresaService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findEmpresaWithRutasOpened: jest.fn(),
    findRutasByEmpresa: jest.fn(),
    getAllEmpresas: jest.fn(),
    getOverdueEmpresas: jest.fn(),
    getEmpresaById: jest.fn(),
    update: jest.fn(),
    updateSubscription: jest.fn(),
    suspendEmpresa: jest.fn(),
    unsuspendEmpresa: jest.fn(),
    addEmploye: jest.fn(),
    deleteEmpleado: jest.fn(),
    addRuta: jest.fn(),
    addOwner: jest.fn(),
    remove: jest.fn(),
    assertCanAccessEmpresa: jest.fn(),
    moveEmpleado: jest.fn(),
    moveRuta: jest.fn(),
    assignRuta: jest.fn(),
  };

  const mockUser = {
    empresa: 'empresaId',
    rol: 'ADMIN',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmpresaController],
      providers: [
        {
          provide: EmpresaService,
          useValue: mockEmpresaService,
        },
      ],
    }).compile();

    controller = module.get<EmpresaController>(EmpresaController);
    empresaService = module.get<EmpresaService>(EmpresaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create an empresa', async () => {
      const dto: CreateEmpresaDto = {
        name: 'Empresa 1',
        email: 'test@test.com',
        phone: '12345678',
        country: 'GT',
        owner: 'ownerId',
        employes: [],
        rutas: [],
        isSubscriptionPaid: true
      };
      const result = { ...dto, _id: '1' };
      mockEmpresaService.create.mockResolvedValue(result);

      expect(await controller.create(dto)).toBe(result);
      expect(mockEmpresaService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return employees of an empresa', async () => {
      const empresaId = 'empresaId';
      const result = [];
      mockEmpresaService.findAll.mockResolvedValue(result);

      expect(await controller.findAll(mockUser, empresaId)).toBe(result);
      expect(mockEmpresaService.findAll).toHaveBeenCalledWith(empresaId);
    });
  });

  describe('findEmpresaWithRutasOpened', () => {
    it('should return empresas with open routes', async () => {
      const result = [];
      mockEmpresaService.findEmpresaWithRutasOpened.mockResolvedValue(result);

      expect(await controller.findEmpresaWithRutasOpened(mockUser)).toBe(result);
      expect(mockEmpresaService.findEmpresaWithRutasOpened).toHaveBeenCalledWith(
        mockUser.empresa,
      );
    });
  });

  describe('findOne', () => {
    it('should return rutas by empresa for ADMIN user', async () => {
      const result = {};
      mockEmpresaService.findRutasByEmpresa.mockResolvedValue(result);

      expect(await controller.findOne(mockUser)).toBe(result);
      expect(mockEmpresaService.findRutasByEmpresa).toHaveBeenCalledWith(
        mockUser.empresa,
        { includeEmployes: true, rutaIds: null },
      );
    });

    it('SUPERVISOR recibe solo sus rutas y sin empleados', async () => {
      const supervisor = {
        empresa: 'empresaId',
        rol: 'SUPERVISOR',
        rutas: ['ruta1', 'ruta2'],
      };
      const result = {};
      mockEmpresaService.findRutasByEmpresa.mockResolvedValue(result);

      expect(await controller.findOne(supervisor)).toBe(result);
      expect(mockEmpresaService.findRutasByEmpresa).toHaveBeenCalledWith(
        'empresaId',
        { includeEmployes: false, rutaIds: ['ruta1', 'ruta2'] },
      );
    });

    it('SUPERADMIN sin empresa no hace toString y retorna vacío', async () => {
      const sa = { rol: 'SUPERADMIN' };
      const result = await controller.findOne(sa);
      expect(result).toEqual({
        id: null,
        name: null,
        rutas: [],
        employes: [],
      });
      expect(mockEmpresaService.findRutasByEmpresa).not.toHaveBeenCalled();
    });

    it('usuario sin empresa lanza BadRequestException', () => {
      const badUser = { rol: 'ADMIN' };
      expect(() => controller.findOne(badUser)).toThrow();
    });
  });

  describe('findById', () => {
    it('SUPERADMIN sin empresa puede ver detalle por id', async () => {
      const sa = { rol: 'SUPERADMIN' };
      const empresa = { id: 'emp1', name: 'Test' };
      mockEmpresaService.getEmpresaById.mockResolvedValue(empresa);

      expect(await controller.findById(sa, 'emp1')).toBe(empresa);
      expect(mockEmpresaService.assertCanAccessEmpresa).toHaveBeenCalledWith(sa, 'emp1');
      expect(mockEmpresaService.getEmpresaById).toHaveBeenCalledWith('emp1', {
        includeEmployes: true,
        rutaIds: null,
      });
    });

    it('SUPERVISOR recibe solo sus rutas y sin empleados en detalle', async () => {
      const supervisor = {
        empresa: 'empresaId',
        rol: 'SUPERVISOR',
        rutas: [{ _id: 'ruta1' }],
      };
      const empresa = { id: 'empresaId', name: 'Test' };
      mockEmpresaService.getEmpresaById.mockResolvedValue(empresa);

      expect(await controller.findById(supervisor, 'empresaId')).toBe(empresa);
      expect(mockEmpresaService.getEmpresaById).toHaveBeenCalledWith('empresaId', {
        includeEmployes: false,
        rutaIds: ['ruta1'],
      });
    });
  });

  describe('update', () => {
    it('should update an empresa', async () => {
      const id = '1';
      const dto: UpdateEmpresaDto = { name: 'New Name' };
      const result = true;
      mockEmpresaService.update.mockResolvedValue(result);

      expect(await controller.update(mockUser, id, dto)).toBe(result);
      expect(mockEmpresaService.update).toHaveBeenCalledWith(id, dto);
    });
  });

  describe('addEmploye', () => {
    it('should add an employee', async () => {
      const dto: CreateUserDto = {
        username: 'user',
        password: 'pwd',
        nombre: 'User',
        rol: 'COBRADOR',
      };
      const result = true;
      mockEmpresaService.addEmploye.mockResolvedValue(result);

      expect(await controller.addEmploye(mockUser, dto)).toBe(result);
      expect(mockEmpresaService.addEmploye).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  describe('assignRuta', () => {
    it('delega al service assignRuta', async () => {
      const dto = { rutaId: 'ruta1', empresaId: 'emp1' };
      const result = { message: 'Ruta asignada a la empresa' };
      mockEmpresaService.assignRuta.mockResolvedValue(result);

      expect(await controller.assignRuta(dto)).toBe(result);
      expect(mockEmpresaService.assignRuta).toHaveBeenCalledWith(dto);
    });
  });
});
