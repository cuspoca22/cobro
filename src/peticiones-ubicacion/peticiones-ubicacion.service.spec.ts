import { Test, TestingModule } from '@nestjs/testing';
import { PeticionesUbicacionService } from './peticiones-ubicacion.service';

describe('PeticionesUbicacionService', () => {
  let service: PeticionesUbicacionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PeticionesUbicacionService],
    }).compile();

    service = module.get<PeticionesUbicacionService>(PeticionesUbicacionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
