import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { CreateUserDto } from '../src/auth/dto/create-user.dto';
import { LoginDto } from '../src/auth/dto/login-user.dto';
import { AuthService } from '../src/auth/auth.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let adminToken: string;
  let userToken: string;
  let adminUserId: string;
  let createdUserId: string;

  const adminUser: CreateUserDto = {
    username: `admin_e2e_${Date.now()}`,
    password: 'Password123!',
    nombre: 'Admin User E2E',
    rol: 'ADMIN',
    estado: true
  };

  const testUser: CreateUserDto = {
    username: `testuser_e2e_${Date.now()}`,
    password: 'Password123!',
    nombre: 'Test User E2E',
    rol: 'CLIENTE',
    estado: true
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);

    // Seed Admin User
    try {
      const createdAdmin = await authService.create(adminUser);
      adminUserId = createdAdmin._id.toString();
    } catch (error) {
      console.error("Admin creation failed", error);
    }

    // Login as Admin to get token
    const loginDto: LoginDto = {
      username: adminUser.username,
      password: adminUser.password
    };

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(loginDto)
      .expect(201);

    adminToken = response.body.token;
  });

  afterAll(async () => {
    if (adminUserId) {
      await authService.deleteUser(adminUserId);
    }
    if (createdUserId) {
      await authService.deleteUser(createdUserId);
    }
    await app.close();
  });

  it('/auth/new-user (POST) - with Admin Token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/new-user')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(testUser)
      .expect(201);

    expect(response.body).toHaveProperty('_id');
    // Backend converts username to uppercase
    expect(response.body).toHaveProperty('username', testUser.username.toUpperCase());
    createdUserId = response.body._id;
  });

  it('/auth/login (POST) - as New User', async () => {
    const loginDto: LoginDto = {
      username: testUser.username,
      password: testUser.password,
    };

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(loginDto)
      .expect(201);

    expect(response.body).toHaveProperty('user');
    expect(response.body).toHaveProperty('token');
    userToken = response.body.token;
  });

  it('/auth/revalidar (GET) - as New User', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/revalidar')
      // Authorization header required
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('user');
    expect(response.body).toHaveProperty('token');
    // User object in revalidar response also has uppercase username
    expect(response.body.user.username).toEqual(testUser.username.toUpperCase());
  });
});
