import { Test, TestingModule } from '@nestjs/testing';
import { CreditoController } from './credito.controller';
import { CreditoService } from './credito.service';
import { GetUserDto } from '../auth/dto/get-user.dto';

jest.mock('../auth/decorators', () => ({
  Auth: () => jest.fn(),
  GetUser: () => jest.fn(),
}));

describe('CreditoController', () => {
  let controller: CreditoController;
  let creditoService: CreditoService;

  const mockCreditoService = {
    getCreditosByRuta: jest.fn(),
    getHistorialCreditos: jest.fn(),
    getCreditoById: jest.fn(),
  };

  const mockUser: GetUserDto = {
    id: 'userId',
    username: 'user',
    ruta: 'rutaId',
    rol: 'COBRADOR',
    nombre: 'User',
    empresa: 'empresaId',
    estado: true,
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditoController],
      providers: [
        {
          provide: CreditoService,
          useValue: mockCreditoService,
        },
      ],
    }).compile();

    controller = module.get<CreditoController>(CreditoController);
    creditoService = module.get<CreditoService>(CreditoService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCreditosByRuta', () => {
    it('should return credits for a route', async () => {
      const result = [{ id: 'credit1' }];
      mockCreditoService.getCreditosByRuta.mockResolvedValue(result);

      expect(await controller.getCreditosByRuta(mockUser)).toBe(result);
      expect(mockCreditoService.getCreditosByRuta).toHaveBeenCalledWith(mockUser.ruta);
    });
  });

  describe('getHistorial', () => {
    it('should return credit history for a client', async () => {
      const clienteId = 'clientId';
      const result = [{ id: 'history1' }];
      mockCreditoService.getHistorialCreditos.mockResolvedValue(result);

      expect(await controller.getHistorial(clienteId)).toBe(result);
      expect(mockCreditoService.getHistorialCreditos).toHaveBeenCalledWith(clienteId);
    });
  });

  describe('findOne', () => {
    it('should return a credit by id', async () => {
      const creditId = 'creditId';
      const result = { id: 'credit1' };
      mockCreditoService.getCreditoById.mockResolvedValue(result);

      expect(await controller.findOne(mockUser, creditId)).toBe(result);
      expect(mockCreditoService.getCreditoById).toHaveBeenCalledWith(creditId, mockUser.ruta);
    });
  });
});
