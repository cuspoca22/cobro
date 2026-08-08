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
    updateProfile: jest.fn(),
    deleteUser: jest.fn(),
    logout: jest.fn(),
    clearSession: jest.fn(),
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
      };

      const result = { ...mockUserEntity, ...createUserDto };
      mockAuthService.create.mockResolvedValue(result);

      expect(await controller.create(createUserDto, mockUserEntity)).toBe(result);
      expect(mockAuthService.create).toHaveBeenCalledWith(createUserDto, mockUserEntity);
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
      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto, req, {
        client: undefined,
      });
    });

    it('should pass cobrador client hint from query', async () => {
      const loginDto: LoginDto = {
        username: 'COBRADOR1',
        password: 'password123',
      };
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as Request;
      mockAuthService.login.mockResolvedValue({ token: 't' });

      await controller.login(loginDto, req, 'COBRADOR');
      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto, req, {
        client: 'cobrador',
      });
    });

    it('should pass admin client hint from query', async () => {
      const loginDto: LoginDto = {
        username: 'ADMIN1',
        password: 'password123',
      };
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as Request;
      mockAuthService.login.mockResolvedValue({ token: 't' });

      await controller.login(loginDto, req, undefined, 'true');
      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto, req, {
        client: 'admin',
      });
    });
  });

  describe('findAll', () => {
    it('should return an array of users', async () => {
      const result = [mockUserEntity];
      mockAuthService.findAll.mockResolvedValue(result);

      expect(await controller.findAll(mockUserEntity)).toBe(result);
      expect(mockAuthService.findAll).toHaveBeenCalledWith(mockUserEntity, undefined);
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

      expect(await controller.findOne(mockUserEntity, term)).toBe(result);
      expect(mockAuthService.findOne).toHaveBeenCalledWith(term, mockUserEntity);
    });
  });

  describe('updateMe', () => {
    it('should update the authenticated user profile', async () => {
      const userDto: GetUserDto = { ...mockUserEntity } as unknown as GetUserDto;
      const dto = { nombre: 'Updated Name' };
      const result = { ...mockUserEntity, ...dto };

      mockAuthService.updateProfile.mockResolvedValue(result);

      expect(await controller.updateMe(userDto, dto)).toBe(result);
      expect(mockAuthService.updateProfile).toHaveBeenCalledWith(userDto.id, dto);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const id = 'someId';
      const updateUserDto: UpdateUserDto = { nombre: 'Updated Name' };
      const result = { ...mockUserEntity, ...updateUserDto };

      mockAuthService.update.mockResolvedValue(result);

      expect(await controller.update(id, updateUserDto, mockUserEntity)).toBe(result);
      expect(mockAuthService.update).toHaveBeenCalledWith(id, updateUserDto, mockUserEntity);
    });
  });

  describe('logout', () => {
    it('should logout from Authorization header', async () => {
      mockAuthService.logout.mockResolvedValue({
        ok: true,
        released: true,
      });
      const req = {
        headers: { authorization: 'Bearer abc' },
      } as any;

      expect(await controller.logout(req)).toEqual({
        ok: true,
        released: true,
      });
      expect(mockAuthService.logout).toHaveBeenCalledWith('Bearer abc');
    });
  });

  describe('clearSession', () => {
    it('should clear session for a user', async () => {
      mockAuthService.clearSession.mockResolvedValue({ ok: true });

      expect(await controller.clearSession('someId', mockUserEntity)).toEqual({
        ok: true,
      });
      expect(mockAuthService.clearSession).toHaveBeenCalledWith(
        'someId',
        mockUserEntity,
      );
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
