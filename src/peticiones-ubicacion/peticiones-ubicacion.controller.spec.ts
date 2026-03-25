import { Test, TestingModule } from '@nestjs/testing';
import { PeticionesUbicacionController } from './peticiones-ubicacion.controller';
import { PeticionesUbicacionService } from './peticiones-ubicacion.service';

describe('PeticionesUbicacionController', () => {
  let controller: PeticionesUbicacionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PeticionesUbicacionController],
      providers: [PeticionesUbicacionService],
    }).compile();

    controller = module.get<PeticionesUbicacionController>(PeticionesUbicacionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
