import { Test, TestingModule } from '@nestjs/testing';
import { ClienteController } from './cliente.controller';
import { ClienteService } from './cliente.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { Cliente } from './schema/cliente.schema';

jest.mock('../auth/decorators/auth.decorator', () => ({
  Auth: () => jest.fn(),
}));
jest.mock('../common/decorators', () => ({
  RutaAbierta: () => jest.fn(),
}));
jest.mock('../common/ownership', () => ({
  RutaOwnership: () => jest.fn(),
}));

describe('ClienteController', () => {
  let controller: ClienteController;
  let clienteService: ClienteService;

  const mockClienteService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByAdmin: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockCliente = {
    _id: 'someId',
    nombre: 'Juan Perez',
    dpi: '1234567890101',
    ruta: 'rutaId',
    status: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClienteController],
      providers: [
        {
          provide: ClienteService,
          useValue: mockClienteService,
        },
      ],
    }).compile();

    controller = module.get<ClienteController>(ClienteController);
    clienteService = module.get<ClienteService>(ClienteService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new client', async () => {
      const createClienteDto: CreateClienteDto = {
        nombre: 'Juan Perez',
        alias: 'Juan',
        dpi: '1234567890101',
        ruta: 'rutaId',
        telefono: '12345678',
        direccion: 'Zona 1',
        ciudad: 'Guatemala',
        turno: 1
      };

      const result = { ...mockCliente, ...createClienteDto } as any;
      mockClienteService.create.mockResolvedValue(result);

      expect(await controller.create(createClienteDto)).toBe(result);
      expect(mockClienteService.create).toHaveBeenCalledWith(createClienteDto);
    });
  });

  describe('findAll', () => {
    it('should return an array of clients', async () => {
      const status = true;
      const idRuta = 'rutaId';
      const result = [mockCliente];

      mockClienteService.findAll.mockResolvedValue(result);

      expect(await controller.findAll(status, idRuta)).toBe(result);
      expect(mockClienteService.findAll).toHaveBeenCalledWith(status, idRuta);
    });
  });

  describe('findByAdmin', () => {
    it('should return an array of clients for admin', async () => {
      const idRuta = 'rutaId';
      const result = [mockCliente];

      mockClienteService.findByAdmin.mockResolvedValue(result);

      expect(await controller.findAllByAdmin(idRuta)).toBe(result);
      expect(mockClienteService.findByAdmin).toHaveBeenCalledWith(idRuta);
    });
  });

  describe('findOne', () => {
    it('should find one client by term', async () => {
      const term = 'someId';
      const result = mockCliente;

      mockClienteService.findOne.mockResolvedValue(result);

      expect(await controller.findOne(term)).toBe(result);
      expect(mockClienteService.findOne).toHaveBeenCalledWith(term);
    });
  });

  describe('update', () => {
    it('should update a client', async () => {
      const id = 'someId';
      const updateClienteDto: UpdateClienteDto = { nombre: 'Juan Updated' };
      const result = { ...mockCliente, ...updateClienteDto };

      mockClienteService.update.mockResolvedValue(result);

      expect(await controller.update(id, updateClienteDto)).toBe(result);
      expect(mockClienteService.update).toHaveBeenCalledWith(id, updateClienteDto);
    });
  });

  describe('remove', () => {
    it('should remove a client', async () => {
      const id = 'someId';
      const result = true;

      mockClienteService.remove.mockResolvedValue(result);

      expect(await controller.remove(id)).toBe(result);
      expect(mockClienteService.remove).toHaveBeenCalledWith(id);
    });
  });
});
