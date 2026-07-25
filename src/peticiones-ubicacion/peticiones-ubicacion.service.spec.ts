import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PeticionesUbicacionService } from './peticiones-ubicacion.service';
import { ClienteService } from 'src/cliente/cliente.service';

describe('PeticionesUbicacionService', () => {
  let service: PeticionesUbicacionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeticionesUbicacionService,
        {
          provide: getModelToken('PeticionesUbicacion'),
          useValue: {
            find: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              lean: jest.fn().mockResolvedValue([]),
              exec: jest.fn().mockResolvedValue([]),
            }),
            create: jest.fn(),
            findById: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(null),
              exec: jest.fn().mockResolvedValue(null),
            }),
            findByIdAndUpdate: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(null),
              exec: jest.fn().mockResolvedValue(null),
            }),
            findByIdAndDelete: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(null),
              exec: jest.fn().mockResolvedValue(null),
            }),
          },
        },
        {
          provide: ClienteService,
          useValue: {
            findByAdmin: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<PeticionesUbicacionService>(PeticionesUbicacionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
