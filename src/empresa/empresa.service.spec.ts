import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { EmpresaService } from './empresa.service';
import { Empresa } from './schemas/empresa.schema';
import { RutaService } from '../ruta/ruta.service';
import { AuthService } from '../auth/auth.service';
import { ClienteService } from '../cliente/cliente.service';
import { MessageGateway } from '../message/message.gateway';

describe('EmpresaService', () => {
  let service: EmpresaService;
  let mockEmpresaModel: {
    findById: jest.Mock;
  };
  let mockMessageGateway: {
    emitMoraConfigActualizada: jest.Mock;
  };

  const empresaId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockEmpresaModel = {
      findById: jest.fn(),
    };

    mockMessageGateway = {
      emitMoraConfigActualizada: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmpresaService,
        { provide: getModelToken(Empresa.name), useValue: mockEmpresaModel },
        { provide: RutaService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: ClienteService, useValue: {} },
        { provide: MessageGateway, useValue: mockMessageGateway },
      ],
    }).compile();

    service = module.get<EmpresaService>(EmpresaService);
  });

  describe('updateMoraConfig', () => {
    it('actualiza config, guarda y emite mora-config-actualizada', async () => {
      const saveMock = jest.fn().mockResolvedValue(undefined);
      const empresaDoc = {
        _id: new Types.ObjectId(empresaId),
        cobraMora: false,
        permiteMoraVoluntaria: false,
        porcentajeMora: 0,
        baseCalculoMora: 'VALOR_CUOTA',
        save: saveMock,
      };

      mockEmpresaModel.findById.mockResolvedValue(empresaDoc);

      const result = await service.updateMoraConfig(empresaId, {
        cobraMora: true,
        porcentajeMora: 10,
      });

      expect(saveMock).toHaveBeenCalled();
      expect(result).toEqual({
        id: empresaId,
        cobraMora: true,
        permiteMoraVoluntaria: false,
        porcentajeMora: 10,
        baseCalculoMora: 'VALOR_CUOTA',
      });
      expect(mockMessageGateway.emitMoraConfigActualizada).toHaveBeenCalledWith({
        empresa: empresaId,
        cobraMora: true,
        permiteMoraVoluntaria: false,
        porcentajeMora: 10,
        baseCalculoMora: 'VALOR_CUOTA',
      });
    });

    it('lanza NotFoundException si la empresa no existe', async () => {
      mockEmpresaModel.findById.mockResolvedValue(null);

      await expect(
        service.updateMoraConfig(empresaId, { cobraMora: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMoraConfigById', () => {
    it('retorna config lean con defaults', async () => {
      const leanMock = jest.fn().mockResolvedValue({
        cobraMora: true,
        permiteMoraVoluntaria: true,
        porcentajeMora: 5,
        baseCalculoMora: 'SALDO',
      });
      mockEmpresaModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: leanMock }),
      });

      const result = await service.getMoraConfigById(empresaId);

      expect(mockEmpresaModel.findById).toHaveBeenCalledWith(empresaId);
      expect(leanMock).toHaveBeenCalled();
      expect(result).toEqual({
        cobraMora: true,
        permiteMoraVoluntaria: true,
        porcentajeMora: 5,
        baseCalculoMora: 'SALDO',
      });
    });

    it('retorna null si la empresa no existe', async () => {
      mockEmpresaModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      });

      const result = await service.getMoraConfigById(empresaId);

      expect(result).toBeNull();
    });
  });
});
