import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AppModule } from './../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { RutaService } from '../src/ruta/ruta.service';
import { ClienteService } from '../src/cliente/cliente.service';
import { MovimientoCajaService } from '../src/movimientoCaja/movimiento-caja.service';
import { EmpresaService } from '../src/empresa/empresa.service';
import { CreditoService } from '../src/credito/credito.service';
import { CreateUserDto } from '../src/auth/dto/create-user.dto';
import { CreateRutaDto } from '../src/ruta/dto/create-ruta.dto';
import { LoginDto } from '../src/auth/dto/login-user.dto';
import { FrecuenciaCobro } from '../src/credito/interfaces/frecuencia-cobro.enum';
import { SubTipo, TipoMovimiento } from '../src/movimientoCaja/interfaces';
import { BaseCalculoMora } from '../src/empresa/interfaces';
import { Ruta } from '../src/ruta/schema/ruta.schema';

/**
 * Smoke e2e: addPago + mora (rechazo / happy path).
 * Fixtures vía servicios; mutación de pago por HTTP (ownership + RutaAbierta).
 */
describe('Pago (e2e smoke)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let rutaService: RutaService;
  let clienteService: ClienteService;
  let movimientoCajaService: MovimientoCajaService;
  let empresaService: EmpresaService;
  let creditoService: CreditoService;
  let rutaModel: Model<Ruta>;

  let token: string;
  let userId: string;
  let rutaId: string;
  let clienteId: string;
  let creditoId: string;
  let empresaId: string;
  let clienteMoraId: string;
  let creditoMoraId: string;

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
    empresaService = moduleFixture.get(EmpresaService);
    creditoService = moduleFixture.get(CreditoService);
    rutaModel = moduleFixture.get(getModelToken(Ruta.name));

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

    const empresa = await empresaService.create({
      name: `Empresa Pago E2E ${stamp}`,
      country: 'MX',
      owner: userId,
      employes: [],
      rutas: [rutaId],
      isSubscriptionPaid: true,
      cobraMora: false,
      permiteMoraVoluntaria: false,
      porcentajeMora: 0,
      baseCalculoMora: BaseCalculoMora.VALOR_CUOTA,
    });
    empresaId = (empresa as any)._id.toString();
    await rutaModel.updateOne({ _id: rutaId }, { $set: { empresa: empresaId } });

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

    const clienteMora = await clienteService.create({
      dpi: `${stamp + 1}`.padStart(13, '2').slice(0, 13),
      nombre: 'Cliente Mora E2E',
      alias: 'ClienteMora',
      ciudad: 'Ciudad',
      direccion: 'Calle 2',
      telefono: '5559876543',
      ruta: rutaId,
      turno: 2,
    });
    clienteMoraId = (clienteMora.id || clienteMora._id).toString();

    const renovacionMora = await movimientoCajaService.addRenovacion({
      clienteId: clienteMoraId,
      rutaId,
      valor_credito: 1000,
      total_cuotas: 10,
      frecuencia_cobro: FrecuenciaCobro.DIARIO,
      interes: 20,
    });
    if (!renovacionMora?.credito?._id) {
      throw new Error('No se pudo crear el crédito de mora para e2e');
    }
    creditoMoraId = renovacionMora.credito._id.toString();
  }, 120000);

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

  it('POST /movimiento-caja/add — rechaza mora si la empresa no cobra mora', async () => {
    const response = await request(app.getHttpServer())
      .post('/movimiento-caja/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rutaId,
        creditoId,
        clienteId,
        monto: 110,
        montoMora: 10,
        tipoMovimiento: TipoMovimiento.INGRESO,
        subTipo: SubTipo.PAGOCREDITO,
      })
      .expect(400);

    const msg = response.body.message;
    const text = typeof msg === 'string' ? msg : msg?.message ?? JSON.stringify(msg);
    expect(text).toMatch(/no tiene habilitado el cobro de mora/);
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

  it('flujo mora: habilitar config → aplicar mora → pagar con montoMora', async () => {
    await empresaService.updateMoraConfig(empresaId, {
      cobraMora: true,
      permiteMoraVoluntaria: false,
      porcentajeMora: 10,
      baseCalculoMora: BaseCalculoMora.VALOR_CUOTA,
    });

    const aplicar = await request(app.getHttpServer())
      .post(`/credito/${creditoMoraId}/aplicar-mora`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 20, motivo: 'e2e atraso' })
      .expect(201);

    expect(aplicar.body.mora_adeudada).toBe(20);
    expect(aplicar.body.montoAplicado).toBe(20);

    const pago = await request(app.getHttpServer())
      .post('/movimiento-caja/add')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rutaId,
        creditoId: creditoMoraId,
        clienteId: clienteMoraId,
        monto: 120,
        montoMora: 20,
        tipoMovimiento: TipoMovimiento.INGRESO,
        subTipo: SubTipo.PAGOCREDITO,
      })
      .expect(201);

    expect(pago.body.ok).toBe(true);

    const credito = await creditoService.getCreditoById(creditoMoraId, rutaId);
    expect(credito.mora_adeudada ?? 0).toBe(0);
    expect(credito.mora_cobrada ?? 0).toBe(20);
  });
});
