import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AppModule } from './../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EmpresaService } from '../src/empresa/empresa.service';
import { CreateUserDto } from '../src/auth/dto/create-user.dto';
import { LoginDto } from '../src/auth/dto/login-user.dto';
import { BaseCalculoMora } from '../src/empresa/interfaces';
import { Empresa } from '../src/empresa/schemas/empresa.schema';
import { User } from '../src/auth/schemas/user.schema';
import {
  Announcement,
  AnnouncementType,
} from '../src/announcement/schemas/announcement.schema';

/**
 * Smoke e2e: suscripción → aviso PAYMENT_REMINDER → limpia;
 * suspender bloquea login del ADMIN de la empresa.
 */
describe('Subscription + announcements (e2e smoke)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let empresaService: EmpresaService;
  let empresaModel: Model<Empresa>;
  let userModel: Model<User>;
  let announcementModel: Model<Announcement>;

  let saToken: string;
  let superAdminId: string;
  let empresaId: string;
  let adminUsername: string;
  let adminPassword: string;
  let adminUserId: string;

  const stamp = Date.now();

  const superAdminDto: CreateUserDto = {
    username: `sub_e2e_sa_${stamp}`,
    password: 'Password123!',
    nombre: 'Sub E2E Super',
    rol: 'SUPERADMIN',
    estado: true,
  };

  async function waitFor(
    predicate: () => Promise<boolean>,
    timeoutMs = 3000,
    stepMs = 50,
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await predicate()) return;
      await new Promise((r) => setTimeout(r, stepMs));
    }
    throw new Error('Timeout esperando condición async (event bus)');
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    authService = moduleFixture.get(AuthService);
    empresaService = moduleFixture.get(EmpresaService);
    empresaModel = moduleFixture.get(getModelToken(Empresa.name));
    userModel = moduleFixture.get(getModelToken(User.name));
    announcementModel = moduleFixture.get(getModelToken(Announcement.name));

    const createdSuper = await authService.create(superAdminDto, {
      rol: 'SUPERADMIN',
    });
    superAdminId = createdSuper._id.toString();

    const loginSa = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: superAdminDto.username,
        password: superAdminDto.password,
      } satisfies LoginDto)
      .expect(201);
    saToken = loginSa.body.token;

    const empresa = await empresaService.create({
      name: `Empresa Sub Smoke ${stamp}`,
      country: 'MX',
      owner: superAdminId,
      employes: [],
      rutas: [],
      dayOfPay: 15,
      isSubscriptionPaid: true,
      cobraMora: false,
      permiteMoraVoluntaria: false,
      porcentajeMora: 0,
      baseCalculoMora: BaseCalculoMora.VALOR_CUOTA,
    });
    empresaId = (empresa as any)._id.toString();

    adminUsername = `sub_e2e_admin_${stamp}`;
    adminPassword = 'Password123!';
    const adminDto: CreateUserDto = {
      username: adminUsername,
      password: adminPassword,
      nombre: 'Sub E2E Admin',
      rol: 'ADMIN',
      estado: true,
      empresa: empresaId,
    };
    const createdAdmin = await authService.create(adminDto, {
      rol: 'SUPERADMIN',
    });
    adminUserId = createdAdmin._id.toString();
    await empresaModel.findByIdAndUpdate(empresaId, {
      $addToSet: { employes: new Types.ObjectId(adminUserId) },
    });
  }, 60000);

  afterAll(async () => {
    try {
      if (empresaId) {
        await announcementModel.deleteMany({
          empresaIds: new Types.ObjectId(empresaId),
        });
        await empresaModel.findByIdAndDelete(empresaId);
      }
      if (adminUserId) await userModel.findByIdAndDelete(adminUserId);
      if (superAdminId) await userModel.findByIdAndDelete(superAdminId);
    } finally {
      await app.close();
    }
  });

  it('marcar no pagada → crea aviso PAYMENT_REMINDER activo', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/empresa/${empresaId}/subscription`)
      .set('Authorization', `Bearer ${saToken}`)
      .send({ isSubscriptionPaid: false })
      .expect(200);

    expect(res.body.isSubscriptionPaid).toBe(false);

    await waitFor(async () => {
      const n = await announcementModel.countDocuments({
        isActive: true,
        type: AnnouncementType.PAYMENT_REMINDER,
        empresaIds: new Types.ObjectId(empresaId),
      });
      return n >= 1;
    });

    const aviso = await announcementModel
      .findOne({
        isActive: true,
        type: AnnouncementType.PAYMENT_REMINDER,
        empresaIds: new Types.ObjectId(empresaId),
      })
      .lean();

    expect(aviso).toBeTruthy();
    expect(aviso!.title).toMatch(/suscripción/i);
  });

  it('marcar pagada → desactiva avisos de pago', async () => {
    await request(app.getHttpServer())
      .patch(`/empresa/${empresaId}/subscription`)
      .set('Authorization', `Bearer ${saToken}`)
      .send({ isSubscriptionPaid: true })
      .expect(200);

    await waitFor(async () => {
      const n = await announcementModel.countDocuments({
        isActive: true,
        type: AnnouncementType.PAYMENT_REMINDER,
        empresaIds: new Types.ObjectId(empresaId),
      });
      return n === 0;
    });
  });

  it('suspender → ADMIN de la empresa no puede login', async () => {
    await request(app.getHttpServer())
      .post(`/empresa/${empresaId}/suspend`)
      .set('Authorization', `Bearer ${saToken}`)
      .send({ reason: 'PAYMENT' })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: adminUsername,
        password: adminPassword,
      } satisfies LoginDto)
      .expect(401);

    expect(
      login.body?.error === 'SUBSCRIPTION_SUSPENDED' ||
        JSON.stringify(login.body).includes('SUBSCRIPTION_SUSPENDED') ||
        JSON.stringify(login.body).includes('suspendido'),
    ).toBe(true);
  });

  it('unsuspend + markPaid → ADMIN puede login otra vez', async () => {
    await request(app.getHttpServer())
      .post(`/empresa/${empresaId}/unsuspend`)
      .query({ markPaid: 'true' })
      .set('Authorization', `Bearer ${saToken}`)
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: adminUsername,
        password: adminPassword,
      } satisfies LoginDto)
      .expect(201);

    expect(login.body.token).toBeTruthy();
  });
});
