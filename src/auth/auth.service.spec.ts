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
      { password: 'hashed-pwd' },
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
