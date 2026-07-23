import { Test, TestingModule } from '@nestjs/testing';
import { CreditoController } from './credito.controller';
import { CreditoService } from './credito.service';
import { GetUserDto } from '../auth/dto/get-user.dto';
import { RutaOwnershipService } from 'src/common/ownership';

jest.mock('../auth/decorators', () => ({
  Auth: () => jest.fn(),
  GetUser: () => jest.fn(),
}));

jest.mock('src/common/ownership', () => ({
  RutaOwnership: () => jest.fn(),
  RutaOwnershipService: jest.fn().mockImplementation(() => ({
    resolveRutaId: jest.fn().mockResolvedValue('rutaId'),
    toId: (v: any) => (v == null || v === '' ? null : String(v)),
    assertCanAccessRuta: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('CreditoController', () => {
  let controller: CreditoController;

  const mockCreditoService = {
    getCreditosByRuta: jest.fn(),
    getHistorialCreditos: jest.fn(),
    getCreditoById: jest.fn(),
    aplicarMora: jest.fn(),
    perdonarMora: jest.fn(),
  };

  const mockOwnershipService = {
    resolveRutaId: jest.fn().mockResolvedValue('rutaId'),
    toId: (v: any) => (v == null || v === '' ? null : String(v)),
    assertCanAccessRuta: jest.fn().mockResolvedValue(undefined),
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
        {
          provide: RutaOwnershipService,
          useValue: mockOwnershipService,
        },
      ],
    }).compile();

    controller = module.get<CreditoController>(CreditoController);
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

      expect(await controller.findOne(creditId)).toBe(result);
      expect(mockOwnershipService.resolveRutaId).toHaveBeenCalledWith({ creditoId: creditId });
      expect(mockCreditoService.getCreditoById).toHaveBeenCalledWith(creditId, 'rutaId');
    });
  });

  describe('aplicarMora', () => {
    it('delega al service con creditoId, dto.monto, user.id y dto.motivo', async () => {
      const creditoId = 'credito123';
      const dto = { monto: 25, motivo: 'atraso' };
      const expected = { creditoId, mora_adeudada: 35, montoAplicado: 25 };
      mockCreditoService.aplicarMora.mockResolvedValue(expected);

      const result = await controller.aplicarMora(creditoId, dto, mockUser);

      expect(result).toBe(expected);
      expect(mockCreditoService.aplicarMora).toHaveBeenCalledWith(
        creditoId,
        dto.monto,
        mockUser.id,
        dto.motivo,
      );
    });
  });

  describe('perdonarMora', () => {
    it('delega al service con creditoId, dto.monto, user.id y dto.motivo', async () => {
      const creditoId = 'credito123';
      const dto = { monto: 20, motivo: 'buen historial' };
      const expected = { creditoId, mora_adeudada: 30, montoPerdonado: 20 };
      mockCreditoService.perdonarMora.mockResolvedValue(expected);

      const result = await controller.perdonarMora(creditoId, dto, mockUser);

      expect(result).toBe(expected);
      expect(mockCreditoService.perdonarMora).toHaveBeenCalledWith(
        creditoId,
        dto.monto,
        mockUser.id,
        dto.motivo,
      );
    });
  });
});
