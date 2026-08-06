import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';

import { AuthService } from './auth.service';
import { User } from './schemas/user.schema';
import { LogAuth } from 'src/log-auth/entities/log-auth.entity';
import { CajaDayCheckService } from 'src/caja/caja-day-check.service';
import { EmpresaService } from 'src/empresa/empresa.service';
import { ValidRoles } from './interfaces';
import { MessageGateway } from 'src/message/message.gateway';

const messageGatewayMock = {
  emitSessionRevoked: jest.fn(),
  hasActiveUserConnection: jest.fn().mockReturnValue(false),
  emitSessionState: jest.fn(),
};

describe('AuthService.normalizeRoleAssignment', () => {
  let service: AuthService;

  beforeEach(() => {
    service = Object.create(AuthService.prototype) as AuthService;
  });

  it('COBRADOR conserva ruta y limpia rutas', () => {
    const result = service.normalizeRoleAssignment({
      rol: 'COBRADOR',
      ruta: 'ruta1',
      rutas: ['a', 'b'],
      nombre: 'Test',
      username: 'test',
      password: '123456',
    });

    expect(result.ruta).toBe('ruta1');
    expect(result.rutas).toEqual([]);
  });

  it('SUPERVISOR conserva rutas y limpia ruta', () => {
    const result = service.normalizeRoleAssignment({
      rol: 'SUPERVISOR',
      ruta: 'ruta1',
      rutas: ['a', 'b'],
      nombre: 'Test',
      username: 'test',
      password: '123456',
    });

    expect(result.ruta).toBeNull();
    expect(result.rutas).toEqual(['a', 'b']);
  });

  it('ADMIN limpia ruta y rutas', () => {
    const result = service.normalizeRoleAssignment({
      rol: 'ADMIN',
      ruta: 'ruta1',
      rutas: ['a'],
      nombre: 'Test',
      username: 'test',
      password: '123456',
    });

    expect(result.ruta).toBeNull();
    expect(result.rutas).toEqual([]);
  });
});

describe('AuthService.updateProfile', () => {
  let service: AuthService;
  let mockUserModel: { findById: jest.Mock };

  const userId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockUserModel = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(LogAuth.name), useValue: {} },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: CajaDayCheckService, useValue: {} },
        { provide: EmpresaService, useValue: {} },
        { provide: MessageGateway, useValue: messageGatewayMock },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  function mockUserDoc(overrides: Record<string, unknown> = {}) {
    const updateOne = jest.fn().mockResolvedValue(undefined);
    const doc = {
      _id: new Types.ObjectId(userId),
      nombre: 'Nombre Original',
      username: 'userorig',
      rol: ValidRoles.admin,
      empresa: new Types.ObjectId(),
      estado: true,
      ruta: null,
      rutas: [],
      toJSON: () => ({
        _id: userId,
        nombre: 'Nombre Original',
        username: 'userorig',
        rol: ValidRoles.admin,
        empresa: doc.empresa,
        estado: true,
      }),
      updateOne,
      ...overrides,
    };
    mockUserModel.findById.mockResolvedValue(doc);
    return doc;
  }

  it('actualiza nombre y username', async () => {
    const doc = mockUserDoc();

    const result = await service.updateProfile(userId, {
      nombre: 'Nuevo Nombre',
      username: 'nuevouser',
    });

    expect(doc.updateOne).toHaveBeenCalledWith(
      { nombre: 'Nuevo Nombre', username: 'nuevouser' },
      { returnDocument: 'after' },
    );
    expect(result.nombre).toBe('Nuevo Nombre');
    expect(result.username).toBe('nuevouser');
    expect(result.rol).toBe(ValidRoles.admin);
  });

  it('hashea password cuando se envía', async () => {
    const doc = mockUserDoc();
    const hashSpy = jest.spyOn(bcrypt, 'hashSync').mockReturnValue('hashed-pwd' as never);

    await service.updateProfile(userId, { password: 'secreto1' });

    expect(hashSpy).toHaveBeenCalledWith('secreto1', 10);
    expect(doc.updateOne).toHaveBeenCalledWith(
      {
        password: 'hashed-pwd',
        activeSessionId: null,
        activeSessionExpiresAt: null,
      },
      { returnDocument: 'after' },
    );
    hashSpy.mockRestore();
  });

  it('no incluye password en la respuesta', async () => {
    mockUserDoc();
    jest.spyOn(bcrypt, 'hashSync').mockReturnValue('hashed-pwd' as never);

    const result = await service.updateProfile(userId, { password: 'secreto1' });

    expect((result as any).password).toBeUndefined();
    (bcrypt.hashSync as jest.Mock).mockRestore?.();
  });

  it('lanza NotFoundException si el usuario no existe', async () => {
    mockUserModel.findById.mockResolvedValue(null);

    await expect(
      service.updateProfile(userId, { nombre: 'Algo' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rechaza si no hay campos para actualizar', async () => {
    mockUserDoc();

    await expect(service.updateProfile(userId, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza nombre corto', async () => {
    mockUserDoc();

    await expect(
      service.updateProfile(userId, { nombre: 'ab' }),
    ).rejects.toThrow(/nombre/i);
  });

  it('rechaza username corto', async () => {
    mockUserDoc();

    await expect(
      service.updateProfile(userId, { username: 'ab' }),
    ).rejects.toThrow(/usuario/i);
  });

  it('rechaza password menor a 6 caracteres', async () => {
    mockUserDoc();

    await expect(
      service.updateProfile(userId, { password: '123' }),
    ).rejects.toThrow(/contraseña/i);
  });

  it('ignora password vacío y actualiza solo nombre', async () => {
    const doc = mockUserDoc();

    await service.updateProfile(userId, {
      nombre: 'Solo Nombre',
      password: '' as any,
    });

    expect(doc.updateOne).toHaveBeenCalledWith(
      { nombre: 'Solo Nombre' },
      { returnDocument: 'after' },
    );
  });
});

describe('AuthService.deleteUser', () => {
  let service: AuthService;
  let mockUserModel: {
    findById: jest.Mock;
    findByIdAndDelete: jest.Mock;
  };
  let mockEmpresaService: { pullEmploye: jest.Mock };

  const userId = new Types.ObjectId().toString();
  const empresaId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockUserModel = {
      findById: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    mockEmpresaService = {
      pullEmploye: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(LogAuth.name), useValue: {} },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: CajaDayCheckService, useValue: {} },
        { provide: EmpresaService, useValue: mockEmpresaService },
        { provide: MessageGateway, useValue: messageGatewayMock },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('hace pullEmploye y borra el usuario', async () => {
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(userId),
        empresa: new Types.ObjectId(empresaId),
      }),
    });
    mockUserModel.findByIdAndDelete.mockResolvedValue({ _id: userId });

    const result = await service.deleteUser(userId);

    expect(mockEmpresaService.pullEmploye).toHaveBeenCalledWith(empresaId, userId);
    expect(mockUserModel.findByIdAndDelete).toHaveBeenCalledWith(userId);
    expect(result).toEqual({ ok: true, id: userId });
  });

  it('borra el usuario aunque pullEmploye falle', async () => {
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(userId),
        empresa: new Types.ObjectId(empresaId),
      }),
    });
    mockEmpresaService.pullEmploye.mockRejectedValue(new Error('empresa gone'));
    mockUserModel.findByIdAndDelete.mockResolvedValue({ _id: userId });

    const result = await service.deleteUser(userId);

    expect(mockUserModel.findByIdAndDelete).toHaveBeenCalledWith(userId);
    expect(result).toEqual({ ok: true, id: userId });
  });

  it('no llama pullEmploye si el usuario no tiene empresa', async () => {
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(userId),
        empresa: null,
      }),
    });
    mockUserModel.findByIdAndDelete.mockResolvedValue({ _id: userId });

    await service.deleteUser(userId);

    expect(mockEmpresaService.pullEmploye).not.toHaveBeenCalled();
    expect(mockUserModel.findByIdAndDelete).toHaveBeenCalledWith(userId);
  });

  it('lanza NotFoundException si el usuario no existe', async () => {
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    await expect(service.deleteUser(userId)).rejects.toThrow(NotFoundException);
    expect(mockUserModel.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('rechaza id inválido', async () => {
    await expect(service.deleteUser('no-es-objectid')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('AuthService sesión única', () => {
  let service: AuthService;
  let mockUserModel: {
    findOne: jest.Mock;
    findById: jest.Mock;
    updateOne: jest.Mock;
  };
  let mockLogAuth: { create: jest.Mock };
  let mockJwt: { sign: jest.Mock };
  let mockMessageGateway: {
    emitSessionRevoked: jest.Mock;
    hasActiveUserConnection: jest.Mock;
    emitSessionState: jest.Mock;
  };
  let mockEmpresaService: { isAccessSuspended: jest.Mock };

  const userId = new Types.ObjectId();

  beforeEach(async () => {
    mockUserModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    mockLogAuth = { create: jest.fn().mockResolvedValue({}) };
    mockJwt = { sign: jest.fn().mockReturnValue('jwt-token') };
    mockMessageGateway = {
      emitSessionRevoked: jest.fn(),
      hasActiveUserConnection: jest.fn().mockReturnValue(false),
      emitSessionState: jest.fn(),
    };
    mockEmpresaService = { isAccessSuspended: jest.fn().mockResolvedValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(LogAuth.name), useValue: mockLogAuth },
        { provide: JwtService, useValue: mockJwt },
        { provide: CajaDayCheckService, useValue: {} },
        { provide: EmpresaService, useValue: mockEmpresaService },
        { provide: MessageGateway, useValue: mockMessageGateway },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
    mockJwt.sign.mockReturnValue('jwt-token');
    mockUserModel.updateOne.mockResolvedValue({ matchedCount: 1 });
    mockLogAuth.create.mockResolvedValue({});
    mockEmpresaService.isAccessSuspended.mockResolvedValue(false);
  });

  function leanAdmin(overrides: Record<string, unknown> = {}) {
    return {
      _id: userId,
      nombre: 'Admin',
      username: 'ADMIN1',
      password: bcrypt.hashSync('secret12', 10),
      rol: ValidRoles.admin,
      estado: true,
      empresa: new Types.ObjectId(),
      ruta: null,
      rutas: [],
      activeSessionId: null,
      activeSessionExpiresAt: null,
      ...overrides,
    };
  }

  it('login crea sesión y firma JWT con sid', async () => {
    const user = leanAdmin();
    mockUserModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(user),
      }),
    });

    const result = await service.login(
      { username: 'admin1', password: 'secret12' },
      { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as any,
    );

    expect(result.token).toBe('jwt-token');
    expect(mockUserModel.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      expect.objectContaining({
        $set: expect.objectContaining({
          activeSessionId: expect.any(String),
          activeSessionExpiresAt: expect.any(Date),
        }),
      }),
    );
    expect(mockMessageGateway.emitSessionState).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: userId.toString(),
        hasActiveSession: true,
        reason: 'LOGIN',
      }),
    );
    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        id: userId.toString(),
        sid: expect.any(String),
      }),
    );
  });

  it('login rechaza si hay sesión activa con cliente WS vivo', async () => {
    const user = leanAdmin({
      activeSessionId: 'sid-previo',
      activeSessionExpiresAt: new Date(Date.now() + 60_000),
    });
    mockUserModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(user),
      }),
    });
    mockMessageGateway.hasActiveUserConnection.mockReturnValue(true);

    await expect(
      service.login(
        { username: 'admin1', password: 'secret12' },
        { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as any,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'SESSION_ALREADY_ACTIVE' }),
    });

    expect(mockLogAuth.create).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'SESSION_ALREADY_ACTIVE' }),
    );
    expect(mockUserModel.updateOne).not.toHaveBeenCalled();
    expect(mockMessageGateway.emitSessionRevoked).not.toHaveBeenCalled();
  });

  it('login con force=true revoca sesión WS viva y crea sid nuevo', async () => {
    const user = leanAdmin({
      activeSessionId: 'sid-previo',
      activeSessionExpiresAt: new Date(Date.now() + 60_000),
    });
    mockUserModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(user),
      }),
    });
    mockMessageGateway.hasActiveUserConnection.mockReturnValue(true);

    const result = await service.login(
      { username: 'admin1', password: 'secret12', force: true },
      { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as any,
    );

    expect(result.token).toBe('jwt-token');
    expect(mockLogAuth.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'SESSION_FORCE_LOGIN',
        isSuccessful: true,
      }),
    );
    expect(mockMessageGateway.emitSessionRevoked).toHaveBeenCalledWith(
      userId.toString(),
      { reason: 'FORCE_LOGIN' },
    );
    expect(mockUserModel.updateOne).toHaveBeenCalledWith(
      { _id: user._id },
      {
        $set: {
          activeSessionId: expect.any(String),
          activeSessionExpiresAt: expect.any(Date),
        },
      },
    );
  });

  it('login recupera sesión huérfana si no hay cliente WS', async () => {
    const user = leanAdmin({
      activeSessionId: 'sid-previo',
      activeSessionExpiresAt: new Date(Date.now() + 60_000),
    });
    mockUserModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(user),
      }),
    });
    mockMessageGateway.hasActiveUserConnection.mockReturnValue(false);

    const result = await service.login(
      { username: 'admin1', password: 'secret12' },
      { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as any,
    );

    expect(result.token).toBe('jwt-token');
    expect(mockLogAuth.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'SESSION_ORPHAN_RECLAIM',
        isSuccessful: true,
      }),
    );
    expect(mockMessageGateway.emitSessionRevoked).toHaveBeenCalledWith(
      userId.toString(),
      { reason: 'ORPHAN_RECLAIM' },
    );
    expect(mockUserModel.updateOne).toHaveBeenCalledWith(
      { _id: user._id },
      {
        $set: {
          activeSessionId: expect.any(String),
          activeSessionExpiresAt: expect.any(Date),
        },
      },
    );
  });

  it('login permite si la sesión previa expiró', async () => {
    const user = leanAdmin({
      activeSessionId: 'sid-viejo',
      activeSessionExpiresAt: new Date(Date.now() - 60_000),
    });
    mockUserModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(user),
      }),
    });

    const result = await service.login(
      { username: 'admin1', password: 'secret12' },
      { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as any,
    );

    expect(result.token).toBe('jwt-token');
    expect(mockUserModel.updateOne).toHaveBeenCalled();
  });

  it('login rechaza ADMIN en cliente cobrador', async () => {
    const user = leanAdmin();
    mockUserModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(user),
      }),
    });

    await expect(
      service.login(
        { username: 'admin1', password: 'secret12' },
        { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as any,
        { client: 'cobrador' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'ROLE_CLIENT_MISMATCH' }),
    });
    expect(mockUserModel.updateOne).not.toHaveBeenCalled();
  });

  it('login rechaza COBRADOR en cliente admin', async () => {
    const user = leanAdmin({ rol: ValidRoles.cobrador, ruta: null });
    mockUserModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(user),
      }),
    });

    await expect(
      service.login(
        { username: 'admin1', password: 'secret12' },
        { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as any,
        { client: 'admin' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'ROLE_CLIENT_MISMATCH' }),
    });
  });

  it('logout limpia sesión si el sid coincide', async () => {
    const result = await service.logout({
      id: userId.toString(),
      sid: 'sid-actual',
    } as any);

    expect(result).toEqual({ ok: true });
    expect(mockUserModel.updateOne).toHaveBeenCalledWith(
      { _id: userId.toString(), activeSessionId: 'sid-actual' },
      {
        $set: {
          activeSessionId: null,
          activeSessionExpiresAt: null,
        },
      },
    );
    expect(mockMessageGateway.emitSessionState).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: userId.toString(),
        hasActiveSession: false,
        reason: 'LOGOUT',
      }),
    );
  });

  it('checkStatus reutiliza sid y renueva expiresAt', async () => {
    const result = await service.checkStatus({
      id: userId.toString(),
      sid: 'sid-actual',
      rol: ValidRoles.admin,
      empresa: new Types.ObjectId().toString(),
    } as any);

    expect(result.token).toBe('jwt-token');
    expect(mockUserModel.updateOne).toHaveBeenCalledWith(
      { _id: userId.toString(), activeSessionId: 'sid-actual' },
      { $set: { activeSessionExpiresAt: expect.any(Date) } },
    );
    expect(mockJwt.sign).toHaveBeenCalledWith({
      id: userId.toString(),
      sid: 'sid-actual',
    });
  });

  it('clearSession limpia y emite session-revoked', async () => {
    const doc = {
      _id: userId,
      nombre: 'Admin',
      username: 'ADMIN1',
      rol: ValidRoles.admin,
      estado: true,
      empresa: new Types.ObjectId(),
      activeSessionId: 'sid-x',
      activeSessionExpiresAt: new Date(Date.now() + 60_000),
      toObject: function () {
        return { ...this };
      },
    };
    mockUserModel.findById.mockReturnValue({
      where: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue(doc),
        }),
      }),
    });

    const actor = {
      id: new Types.ObjectId().toString(),
      rol: ValidRoles.superAdmin,
    } as any;

    const result = await service.clearSession(userId.toString(), actor);

    expect(result).toEqual({ ok: true });
    expect(mockUserModel.updateOne).toHaveBeenCalledWith(
      { _id: userId.toString() },
      {
        $set: {
          activeSessionId: null,
          activeSessionExpiresAt: null,
        },
      },
    );
    expect(mockMessageGateway.emitSessionRevoked).toHaveBeenCalledWith(
      userId.toString(),
      { reason: 'ADMIN_CLEAR' },
    );
    expect(mockMessageGateway.emitSessionState).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: userId.toString(),
        hasActiveSession: false,
        reason: 'ADMIN_CLEAR',
      }),
    );
  });
});
