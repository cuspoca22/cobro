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

  describe('getScopedRutaIds', () => {
    it('SUPERADMIN y ADMIN → null (sin restricción de ruta)', () => {
      expect(
        service.getScopedRutaIds({ rol: ValidRoles.superAdmin }),
      ).toBeNull();
      expect(
        service.getScopedRutaIds({
          rol: ValidRoles.admin,
          empresa: empresaId,
        }),
      ).toBeNull();
    });

    it('SUPERVISOR → ids de rutas asignadas', () => {
      expect(
        service.getScopedRutaIds({
          rol: ValidRoles.supervisor,
          empresa: empresaId,
          rutas: [rutaAsignada, { _id: rutaOtra }],
        }),
      ).toEqual([rutaAsignada, rutaOtra]);
    });

    it('SUPERVISOR sin rutas → array vacío', () => {
      expect(
        service.getScopedRutaIds({
          rol: ValidRoles.supervisor,
          empresa: empresaId,
          rutas: [],
        }),
      ).toEqual([]);
    });

    it('COBRADOR → su ruta única', () => {
      expect(
        service.getScopedRutaIds({
          rol: ValidRoles.cobrador,
          ruta: rutaAsignada,
        }),
      ).toEqual([rutaAsignada]);
    });
  });
});
