import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

import { ValidRoles } from 'src/auth/interfaces';
import { RutaOwnershipService } from './ruta-ownership.service';

describe('RutaOwnershipService SUPERVISOR', () => {
  const empresaId = new Types.ObjectId().toString();
  const rutaAsignada = new Types.ObjectId().toString();
  const rutaOtra = new Types.ObjectId().toString();

  let service: RutaOwnershipService;
  let rutaService: { getEmpresaIdByRutaId: jest.Mock };

  beforeEach(() => {
    rutaService = {
      getEmpresaIdByRutaId: jest.fn(),
    };
    service = new RutaOwnershipService(
      rutaService as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('permite SUPERVISOR sobre ruta asignada de su empresa', async () => {
    rutaService.getEmpresaIdByRutaId.mockResolvedValue({
      exists: true,
      empresaId,
    });

    await expect(
      service.assertCanAccessRuta(
        {
          rol: ValidRoles.supervisor,
          empresa: empresaId,
          rutas: [rutaAsignada],
        },
        rutaAsignada,
      ),
    ).resolves.toBeUndefined();
  });

  it('deniega SUPERVISOR sobre ruta de la empresa no asignada', async () => {
    rutaService.getEmpresaIdByRutaId.mockResolvedValue({
      exists: true,
      empresaId,
    });

    await expect(
      service.assertCanAccessRuta(
        {
          rol: ValidRoles.supervisor,
          empresa: empresaId,
          rutas: [rutaAsignada],
        },
        rutaOtra,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deniega SUPERVISOR sin rutas asignadas', async () => {
    rutaService.getEmpresaIdByRutaId.mockResolvedValue({
      exists: true,
      empresaId,
    });

    await expect(
      service.assertCanAccessRuta(
        {
          rol: ValidRoles.supervisor,
          empresa: empresaId,
          rutas: [],
        },
        rutaAsignada,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ADMIN sigue pudiendo operar cualquier ruta de su empresa', async () => {
    rutaService.getEmpresaIdByRutaId.mockResolvedValue({
      exists: true,
      empresaId,
    });

    await expect(
      service.assertCanAccessRuta(
        {
          rol: ValidRoles.admin,
          empresa: empresaId,
        },
        rutaOtra,
      ),
    ).resolves.toBeUndefined();
  });
});
