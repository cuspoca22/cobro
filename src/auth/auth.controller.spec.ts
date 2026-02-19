import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CreateUserDto, LoginDto, UpdateUserDto, GetUserDto } from './dto';
import { UserEntity } from './entities/user.entity';
import { Request } from 'express';

jest.mock('./decorators', () => ({
  Auth: () => jest.fn(),
  GetUser: () => jest.fn(),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    create: jest.fn(),
    login: jest.fn(),
    findAll: jest.fn(),
    checkStatus: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    deleteUser: jest.fn(),
  };

  const mockUserEntity: UserEntity = {
    id: 'someId',
    email: 'test@test.com',
    username: 'TESTUSER',
    rol: 'ADMIN',
    isActive: true,
    ruta: null,
    empresa: null
  } as unknown as UserEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const createUserDto: CreateUserDto = {
        username: 'newUser',
        password: 'password123',
        nombre: 'New User',
        rol: 'ADMIN',
        close_ruta: false
      };

      const result = { ...mockUserEntity, ...createUserDto };
      mockAuthService.create.mockResolvedValue(result);

      expect(await controller.create(createUserDto)).toBe(result);
      expect(mockAuthService.create).toHaveBeenCalledWith(createUserDto);
    });
  });

  describe('login', () => {
    it('should login a user', async () => {
      const loginDto: LoginDto = {
        username: 'TESTUSER',
        password: 'password123',
      };
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as Request;
      // @ts-ignore
      const result = { user: mockUserEntity, token: 'someToken' };

      mockAuthService.login.mockResolvedValue(result);

      expect(await controller.login(loginDto, req)).toBe(result);
      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto, req);
    });
  });

  describe('findAll', () => {
    it('should return an array of users', async () => {
      const result = [mockUserEntity];
      mockAuthService.findAll.mockResolvedValue(result);

      expect(await controller.findAll(mockUserEntity)).toBe(result);
      expect(mockAuthService.findAll).toHaveBeenCalledWith(mockUserEntity);
    });
  });

  describe('checkStatus', () => {
    it('should check user status', async () => {
      const userDto: GetUserDto = { ...mockUserEntity } as unknown as GetUserDto;
      // @ts-ignore
      const result = { user: mockUserEntity, token: 'newToken' };

      mockAuthService.checkStatus.mockResolvedValue(result);

      expect(await controller.checkStatus(userDto)).toBe(result);
      expect(mockAuthService.checkStatus).toHaveBeenCalledWith(userDto);
    });
  });

  describe('findOne', () => {
    it('should find one user by term', async () => {
      const term = 'someId';
      const result = mockUserEntity;
      mockAuthService.findOne.mockResolvedValue(result);

      expect(await controller.findOne(term)).toBe(result);
      expect(mockAuthService.findOne).toHaveBeenCalledWith(term);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const id = 'someId';
      const updateUserDto: UpdateUserDto = { nombre: 'Updated Name' };
      const result = { ...mockUserEntity, ...updateUserDto };

      mockAuthService.update.mockResolvedValue(result);

      expect(await controller.update(id, updateUserDto)).toBe(result);
      expect(mockAuthService.update).toHaveBeenCalledWith(id, updateUserDto);
    });
  });

  describe('delete', () => {
    it('should delete a user', async () => {
      const id = 'someId';
      const result = id;
      mockAuthService.deleteUser.mockResolvedValue(result);

      expect(await controller.delete(id)).toBe(result);
      expect(mockAuthService.deleteUser).toHaveBeenCalledWith(id);
    });
  });
});
