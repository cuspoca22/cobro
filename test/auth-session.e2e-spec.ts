import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AddressInfo } from 'net';

import { AppModule } from './../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { EmpresaService } from '../src/empresa/empresa.service';
import { CreateUserDto } from '../src/auth/dto/create-user.dto';
import { LoginDto } from '../src/auth/dto/login-user.dto';
import { BaseCalculoMora } from '../src/empresa/interfaces';

/**
 * Integración: sesión única + liberación admin → WS session-revoked
 * y JWT inválido en revalidar.
 */
describe('Auth session release (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let empresaService: EmpresaService;
  let baseUrl: string;

  let superAdminId: string;
  let targetAdminId: string;
  let empresaId: string;
  let superAdminToken: string;

  const stamp = Date.now();
  const password = 'Password123!';

  const superAdminDto: CreateUserDto = {
    username: `sess_e2e_sa_${stamp}`,
    password,
    nombre: 'Session E2E Super',
    rol: 'SUPERADMIN',
    estado: true,
  };

  function waitForEvent<T = unknown>(
    socket: Socket,
    event: string,
    timeoutMs = 8000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout esperando WS event "${event}"`));
      }, timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  /** Conecta y espera a que el gateway termine de unir rooms (handleConnection async). */
  async function connectWs(token: string): Promise<Socket> {
    const socket = await new Promise<Socket>((resolve, reject) => {
      const s = io(baseUrl, {
        transports: ['websocket'],
        auth: { token },
        forceNew: true,
        reconnection: false,
      });

      const timer = setTimeout(() => {
        s.close();
        reject(new Error('Timeout conectando WebSocket'));
      }, 8000);

      s.on('connect', () => {
        clearTimeout(timer);
        resolve(s);
      });
      s.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      s.on('disconnect', (reason) => {
        // Si el server corta por auth (p. ej. sin empresa), fallar temprano.
        if (reason === 'io server disconnect') {
          clearTimeout(timer);
          reject(new Error('WS desconectado por el servidor (auth/rooms)'));
        }
      });
    });

    await new Promise((r) => setTimeout(r, 300));
    if (!socket.connected) {
      throw new Error('WS no quedó conectado tras el handshake');
    }
    return socket;
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
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    authService = moduleFixture.get(AuthService);
    empresaService = moduleFixture.get(EmpresaService);

    const sa = await authService.create(superAdminDto, {
      rol: 'SUPERADMIN',
    });
    superAdminId = sa._id.toString();

    const empresa = await empresaService.create({
      name: `Empresa Sess E2E ${stamp}`,
      country: 'GT',
      owner: superAdminId,
      employes: [],
      rutas: [],
      dayOfPay: 15,
      isSubscriptionPaid: true,
      cobraMora: false,
      permiteMoraVoluntaria: false,
      porcentajeMora: 0,
      baseCalculoMora: BaseCalculoMora.VALOR_CUOTA,
    } as any);
    empresaId = (empresa as any)._id.toString();

    const targetAdminDto: CreateUserDto = {
      username: `sess_e2e_admin_${stamp}`,
      password,
      nombre: 'Session E2E Admin',
      rol: 'ADMIN',
      estado: true,
      empresa: empresaId,
    };

    const target = await authService.create(targetAdminDto, {
      rol: 'SUPERADMIN',
    });
    targetAdminId = target._id.toString();
    await authService.setEmpresa(targetAdminId, empresaId);

    const saLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .query({ admin: 'true' })
      .send({
        username: superAdminDto.username,
        password,
      } satisfies LoginDto)
      .expect(201);

    superAdminToken = saLogin.body.token;
  }, 60_000);

  afterAll(async () => {
    if (targetAdminId) {
      try {
        await authService.deleteUser(targetAdminId);
      } catch {
        /* ignore */
      }
    }
    if (empresaId) {
      try {
        await empresaService.hardDeleteById(empresaId);
      } catch {
        /* ignore */
      }
    }
    if (superAdminId) {
      try {
        await authService.deleteUser(superAdminId);
      } catch {
        /* ignore */
      }
    }
    await app.close();
  });

  it('login con hint cobrador rechaza ADMIN (ROLE_CLIENT_MISMATCH)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .query({ rol: 'COBRADOR' })
      .send({
        username: `sess_e2e_admin_${stamp}`,
        password,
      } satisfies LoginDto)
      .expect(401);

    expect(res.body.error ?? res.body.message).toEqual(
      expect.stringMatching(/ROLE_CLIENT_MISMATCH|cobro/i),
    );
  });

  it(
    'clear-session emite session-revoked y session:state; JWT queda inválido',
    async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .query({ admin: 'true' })
        .send({
          username: `sess_e2e_admin_${stamp}`,
          password,
        } satisfies LoginDto)
        .expect(201);

      const targetToken: string = loginRes.body.token;
      const targetUserId: string =
        loginRes.body.user?.id ?? loginRes.body.user?._id ?? targetAdminId;

      expect(loginRes.body.user?.empresa || empresaId).toBeTruthy();

      const socket = await connectWs(targetToken);
      const revokedPromise = waitForEvent<{ reason?: string }>(
        socket,
        'session-revoked',
      );
      const statePromise = waitForEvent<{
        userId: string;
        hasActiveSession: boolean;
        reason?: string;
      }>(socket, 'session:state');

      await request(app.getHttpServer())
        .post(`/auth/clear-session/${targetUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(201);

      const revoked = await revokedPromise;
      expect(revoked.reason).toBe('ADMIN_CLEAR');

      const state = await statePromise;
      expect(String(state.userId)).toBe(String(targetUserId));
      expect(state.hasActiveSession).toBe(false);
      expect(state.reason).toBe('ADMIN_CLEAR');

      socket.close();

      const revalidar = await request(app.getHttpServer())
        .get('/auth/revalidar')
        .set('Authorization', `Bearer ${targetToken}`)
        .expect(401);

      const errCode = revalidar.body?.error ?? revalidar.body?.message;
      expect(String(errCode)).toMatch(/SESSION_INVALID|Unauthorized|sesión/i);
    },
    20_000,
  );

  it('tras liberar sesión, un nuevo login del mismo usuario funciona', async () => {
    await request(app.getHttpServer())
      .post(`/auth/clear-session/${targetAdminId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .query({ admin: 'true' })
      .send({
        username: `sess_e2e_admin_${stamp}`,
        password,
      } satisfies LoginDto)
      .expect(201);

    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.user).toBeDefined();

    await request(app.getHttpServer())
      .get('/auth/revalidar')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .expect(200);
  });

  it(
    'SESSION_ALREADY_ACTIVE si hay WS vivo y se intenta otro login',
    async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .query({ admin: 'true' })
        .send({
          username: `sess_e2e_admin_${stamp}`,
          password,
        } satisfies LoginDto)
        .expect(201);

      const socket = await connectWs(loginRes.body.token);

      const blocked = await request(app.getHttpServer())
        .post('/auth/login')
        .query({ admin: 'true' })
        .send({
          username: `sess_e2e_admin_${stamp}`,
          password,
        } satisfies LoginDto)
        .expect(401);

      expect(blocked.body.error ?? blocked.body.message).toEqual(
        expect.stringMatching(/SESSION_ALREADY_ACTIVE|sesión activa/i),
      );

      socket.close();

      await request(app.getHttpServer())
        .post(`/auth/clear-session/${targetAdminId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
    },
    20_000,
  );

  it(
    'force=true permite login aunque haya WS vivo y revoca la sesión previa',
    async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .query({ admin: 'true' })
        .send({
          username: `sess_e2e_admin_${stamp}`,
          password,
        } satisfies LoginDto)
        .expect(201);

      const socket = await connectWs(loginRes.body.token);
      const revoked = new Promise<void>((resolve) => {
        socket.once('session-revoked', () => resolve());
      });

      const forced = await request(app.getHttpServer())
        .post('/auth/login')
        .query({ admin: 'true' })
        .send({
          username: `sess_e2e_admin_${stamp}`,
          password,
          force: true,
        } satisfies LoginDto)
        .expect(201);

      expect(forced.body.token).toBeDefined();
      expect(forced.body.token).not.toBe(loginRes.body.token);

      await Promise.race([
        revoked,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout session-revoked')), 5_000),
        ),
      ]);

      socket.close();

      await request(app.getHttpServer())
        .get('/auth/revalidar')
        .set('Authorization', `Bearer ${forced.body.token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/auth/clear-session/${targetAdminId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
    },
    20_000,
  );
});
