import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AppModule } from './../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { RutaService } from '../src/ruta/ruta.service';
import { ClienteService } from '../src/cliente/cliente.service';
import { EmpresaService } from '../src/empresa/empresa.service';
import { CreateUserDto } from '../src/auth/dto/create-user.dto';
import { CreateRutaDto } from '../src/ruta/dto/create-ruta.dto';
import { LoginDto } from '../src/auth/dto/login-user.dto';
import { BaseCalculoMora } from '../src/empresa/interfaces';
import { Ruta } from '../src/ruta/schema/ruta.schema';
import { Empresa } from '../src/empresa/schemas/empresa.schema';
import { Cliente } from '../src/cliente/schema/cliente.schema';
import { User } from '../src/auth/schemas/user.schema';

/**
 * Smoke e2e ligero: DELETE /ruta/:id y DELETE /empresa/:id (cascada + auth).
 * Fixtures vía servicios; borrado por HTTP.
 */
describe('Cascada delete (e2e smoke)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let rutaService: RutaService;
  let clienteService: ClienteService;
  let empresaService: EmpresaService;
  let rutaModel: Model<Ruta>;
  let empresaModel: Model<Empresa>;
  let clienteModel: Model<Cliente>;
  let userModel: Model<User>;

  let token: string;
  let superAdminId: string;

  let rutaToDeleteId: string;
  let clienteOnRutaId: string;
  let empresaKeepId: string;

  let empresaToDeleteId: string;
  let rutaOnEmpresaId: string;
  let employeeId: string;

  const stamp = Date.now();

  const superAdminDto: CreateUserDto = {
    username: `cascada_e2e_${stamp}`,
    password: 'Password123!',
    nombre: 'Cascada E2E Super',
    rol: 'SUPERADMIN',
    estado: true,
  };

  const rutaDto = (suffix: string): CreateRutaDto => ({
    nombre: `Ruta Cascada ${suffix} ${stamp}`,
    ciudad: 'Ciudad Test',
    pais: 'Pais Test',
    timeZone: 'America/Mexico_City',
    autoOpen: false,
    currency: 'MXN',
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get(AuthService);
    rutaService = moduleFixture.get(RutaService);
    clienteService = moduleFixture.get(ClienteService);
    empresaService = moduleFixture.get(EmpresaService);
    rutaModel = moduleFixture.get(getModelToken(Ruta.name));
    empresaModel = moduleFixture.get(getModelToken(Empresa.name));
    clienteModel = moduleFixture.get(getModelToken(Cliente.name));
    userModel = moduleFixture.get(getModelToken(User.name));

    // Seed bootstrap: actor SUPERADMIN permite crear el primer SA de prueba
    const createdSuper = await authService.create(superAdminDto, {
      rol: 'SUPERADMIN',
    });
    superAdminId = createdSuper._id.toString();

    const loginDto: LoginDto = {
      username: superAdminDto.username,
      password: superAdminDto.password,
    };
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send(loginDto)
      .expect(201);
    token = loginResponse.body.token;

    // --- Fixture A: ruta + cliente + empresa (para DELETE ruta) ---
    const rutaA = await rutaService.create(rutaDto('A'));
    rutaToDeleteId = rutaA._id.toString();

    const empresaA = await empresaService.create({
      name: `Empresa Keep Cascada ${stamp}`,
      country: 'MX',
      owner: superAdminId,
      employes: [],
      rutas: [rutaToDeleteId],
      isSubscriptionPaid: true,
      cobraMora: false,
      permiteMoraVoluntaria: false,
      porcentajeMora: 0,
      baseCalculoMora: BaseCalculoMora.VALOR_CUOTA,
    });
    empresaKeepId = (empresaA as any)._id.toString();
    await rutaModel.updateOne(
      { _id: rutaToDeleteId },
      { $set: { empresa: empresaKeepId } },
    );

    const cliente = await clienteService.create({
      dpi: `${stamp}`.padStart(13, '3').slice(0, 13),
      nombre: 'Cliente Cascada E2E',
      alias: 'CascadaCli',
      ciudad: 'Ciudad',
      direccion: 'Calle 1',
      telefono: '5551112233',
      ruta: rutaToDeleteId,
      turno: 1,
    });
    clienteOnRutaId = (cliente.id || cliente._id).toString();

    // --- Fixture B: empresa + ruta + empleado (para DELETE empresa) ---
    const rutaB = await rutaService.create(rutaDto('B'));
    rutaOnEmpresaId = rutaB._id.toString();

    const employee = await authService.create({
      username: `emp_cascada_${stamp}`,
      password: 'Password123!',
      nombre: 'Empleado Cascada',
      rol: 'ADMIN',
      estado: true,
      empresa: undefined,
    });
    employeeId = employee._id.toString();

    const empresaB = await empresaService.create({
      name: `Empresa Delete Cascada ${stamp}`,
      country: 'MX',
      owner: superAdminId,
      employes: [employeeId],
      rutas: [rutaOnEmpresaId],
      isSubscriptionPaid: true,
      cobraMora: false,
      permiteMoraVoluntaria: false,
      porcentajeMora: 0,
      baseCalculoMora: BaseCalculoMora.VALOR_CUOTA,
    });
    empresaToDeleteId = (empresaB as any)._id.toString();

    await rutaModel.updateOne(
      { _id: rutaOnEmpresaId },
      { $set: { empresa: empresaToDeleteId } },
    );
    await userModel.updateOne(
      { _id: employeeId },
      { $set: { empresa: empresaToDeleteId } },
    );
  }, 120000);

  afterAll(async () => {
    try {
      if (empresaKeepId) {
        const stillThere = await empresaModel.findById(empresaKeepId).lean();
        if (stillThere) await empresaService.remove(empresaKeepId);
      }
    } catch (e) {
      console.error('Cleanup empresaKeep failed', e);
    }

    try {
      if (empresaToDeleteId) {
        const stillThere = await empresaModel.findById(empresaToDeleteId).lean();
        if (stillThere) await empresaService.remove(empresaToDeleteId);
      }
    } catch (e) {
      console.error('Cleanup empresaToDelete failed', e);
    }

    try {
      if (rutaToDeleteId) {
        const stillThere = await rutaModel.findById(rutaToDeleteId).lean();
        if (stillThere) await rutaService.delete(rutaToDeleteId);
      }
    } catch (e) {
      console.error('Cleanup rutaA failed', e);
    }

    try {
      if (rutaOnEmpresaId) {
        const stillThere = await rutaModel.findById(rutaOnEmpresaId).lean();
        if (stillThere) await rutaService.delete(rutaOnEmpresaId);
      }
    } catch (e) {
      console.error('Cleanup rutaB failed', e);
    }

    try {
      if (employeeId) {
        const stillThere = await userModel.findById(employeeId).lean();
        if (stillThere) await authService.deleteUser(employeeId);
      }
    } catch (e) {
      console.error('Cleanup employee failed', e);
    }

    try {
      if (superAdminId) await authService.deleteUser(superAdminId);
    } catch (e) {
      console.error('Cleanup superAdmin failed', e);
    }

    await app.close();
  });

  it('DELETE /ruta/:id — cascada (ruta + cliente) y pull de empresa', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/ruta/${rutaToDeleteId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body === true || response.text === 'true').toBe(true);

    expect(await rutaModel.findById(rutaToDeleteId).lean()).toBeNull();
    expect(await clienteModel.findById(clienteOnRutaId).lean()).toBeNull();

    const empresa = await empresaModel.findById(empresaKeepId).lean();
    expect(empresa).toBeTruthy();
    const rutas = ((empresa as any).rutas || []).map((r: any) => r.toString());
    expect(rutas).not.toContain(rutaToDeleteId);
  });

  it('DELETE /ruta/:id — 404 si ya no existe', async () => {
    await request(app.getHttpServer())
      .delete(`/ruta/${rutaToDeleteId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('DELETE /ruta/:id — 401 sin token', async () => {
    await request(app.getHttpServer())
      .delete(`/ruta/${rutaOnEmpresaId}`)
      .expect(401);
  });

  it('DELETE /empresa/:id — cascada (empresa + ruta + empleado)', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/empresa/${empresaToDeleteId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.message).toMatch(/Empresa eliminada/i);

    expect(await empresaModel.findById(empresaToDeleteId).lean()).toBeNull();
    expect(await rutaModel.findById(rutaOnEmpresaId).lean()).toBeNull();
    expect(await userModel.findById(employeeId).lean()).toBeNull();
  });

  it('DELETE /empresa/:id — 404 si ya no existe', async () => {
    await request(app.getHttpServer())
      .delete(`/empresa/${empresaToDeleteId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
