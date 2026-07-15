import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { AppModule } from './../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { RutaService } from '../src/ruta/ruta.service';
import { ClienteService } from '../src/cliente/cliente.service';
import { MovimientoCajaService } from '../src/movimientoCaja/movimiento-caja.service';
import { CreateUserDto } from '../src/auth/dto/create-user.dto';
import { CreateRutaDto } from '../src/ruta/dto/create-ruta.dto';
import { LoginDto } from '../src/auth/dto/login-user.dto';
import { FrecuenciaCobro } from '../src/credito/interfaces/frecuencia-cobro.enum';
import { SubTipo, TipoMovimiento } from '../src/movimientoCaja/interfaces';

/**
 * Smoke e2e: addPago happy path + rechazo por pago del mismo día.
 * Fixtures vía servicios; mutación de pago por HTTP (ownership + RutaAbierta).
 */
describe('Pago (e2e smoke)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let rutaService: RutaService;
  let clienteService: ClienteService;
  let movimientoCajaService: MovimientoCajaService;

  let token: string;
  let userId: string;
  let rutaId: string;
  let clienteId: string;
  let creditoId: string;

  const stamp = Date.now();

  const userDto: CreateUserDto = {
    username: `pago_e2e_${stamp}`,
    password: 'Password123!',
    nombre: 'Pago E2E Super',
    rol: 'SUPERADMIN',
    estado: true,
  };

  const rutaDto: CreateRutaDto = {
    nombre: `Ruta Pago E2E ${stamp}`,
    ciudad: 'Ciudad Test',
    pais: 'Pais Test',
    timeZone: 'America/Mexico_City',
    autoOpen: false,
    currency: 'MXN',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get(AuthService);
    rutaService = moduleFixture.get(RutaService);
    clienteService = moduleFixture.get(ClienteService);
    movimientoCajaService = moduleFixture.get(MovimientoCajaService);

    const createdUser = await authService.create(userDto);
    userId = createdUser._id.toString();

    const loginDto: LoginDto = {
      username: userDto.username,
      password: userDto.password,
    };

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send(loginDto)
      .expect(201);

    token = loginResponse.body.token;

    const ruta = await rutaService.create(rutaDto);
    rutaId = ruta._id.toString();

    await request(app.getHttpServer())
      .patch(`/ruta/open/${rutaId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const cliente = await clienteService.create({
      dpi: `${stamp}`.padStart(13, '1').slice(0, 13),
      nombre: 'Cliente Pago E2E',
      alias: 'ClientePago',
      ciudad: 'Ciudad',
      direccion: 'Calle 1',
      telefono: '5551234567',
      ruta: rutaId,
      turno: 1,
    });
    clienteId = (cliente.id || cliente._id).toString();

    // Crédito activo + movimiento préstamo (saldo = total_pagar)
    const renovacion = await movimientoCajaService.addRenovacion({
      clienteId,
      rutaId,
      valor_credito: 1000,
      total_cuotas: 10,
      frecuencia_cobro: FrecuenciaCobro.DIARIO,
      interes: 20,
    });
    if (!renovacion?.credito?._id) {
      throw new Error('No se pudo crear el crédito de prueba para e2e pago');
    }
    creditoId = renovacion.credito._id.toString();
  }, 90000);

  afterAll(async () => {
    try {
      if (rutaId) {
        try {
          await rutaService.closeRuta(rutaId);
        } catch {
          /* puede estar cerrada o fallar por estado */
        }
        await rutaService.delete(rutaId);
      }
    } catch (e) {
      console.error('Cleanup ruta failed', e);
    }

    try {
      if (userId) await authService.deleteUser(userId);
    } catch (e) {
      console.error('Cleanup user failed', e);
    }

    await app.close();
  });

  it('POST /movimiento-caja/add — registra pago', async () => {
    const response = await request(app.getHttpServer())
      .post('/movimiento-caja/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rutaId,
        creditoId,
        clienteId,
        monto: 100,
        tipoMovimiento: TipoMovimiento.INGRESO,
        subTipo: SubTipo.PAGOCREDITO,
      })
      .expect(201);

    expect(response.body.ok).toBe(true);
  });

  it('POST /movimiento-caja/add — rechaza segundo pago el mismo día', async () => {
    const response = await request(app.getHttpServer())
      .post('/movimiento-caja/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rutaId,
        creditoId,
        clienteId,
        monto: 50,
        tipoMovimiento: TipoMovimiento.INGRESO,
        subTipo: SubTipo.PAGOCREDITO,
      })
      .expect(400);

    const msg = response.body.message;
    const text = typeof msg === 'string' ? msg : msg?.message ?? JSON.stringify(msg);
    expect(text).toMatch(/Ya ingresaste este pago/);
  });
});
