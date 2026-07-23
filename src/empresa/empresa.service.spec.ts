import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { EmpresaService } from './empresa.service';
import { Empresa } from './schemas/empresa.schema';
import { RutaService } from '../ruta/ruta.service';
import { AuthService } from '../auth/auth.service';
import { ClienteService } from '../cliente/cliente.service';
import { MessageGateway } from '../message/message.gateway';

describe('EmpresaService', () => {
  let service: EmpresaService;
  let mockEmpresaModel: any;
  let mockRutaSvc: any;
  let mockAuthSvc: any;
  let mockConnection: any;
  let mockSession: any;
  let mockMessageGateway: {
    emitMoraConfigActualizada: jest.Mock;
  };

  const empresaId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
      collection: jest.fn().mockReturnValue({
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      }),
    };

    mockEmpresaModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };

    mockRutaSvc = {
      delete: jest.fn(),
      findAllByEmpresa: jest.fn(),
      getEmpresaIdByRutaId: jest.fn(),
      setEmpresa: jest.fn(),
    };

    mockAuthSvc = {
      deleteManyByEmpresa: jest.fn(),
    };

    mockMessageGateway = {
      emitMoraConfigActualizada: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmpresaService,
        { provide: getModelToken(Empresa.name), useValue: mockEmpresaModel },
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: RutaService, useValue: mockRutaSvc },
        { provide: AuthService, useValue: mockAuthSvc },
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

  describe('remove (cascada)', () => {
    it('elimina rutas, usuarios, tracking y la empresa', async () => {
      const rutaId1 = new Types.ObjectId();
      const rutaId2 = new Types.ObjectId();
      const empId = new Types.ObjectId(empresaId);
      const employeId = new Types.ObjectId();

      mockEmpresaModel.findById.mockResolvedValue({
        _id: empId,
        rutas: [rutaId1],
        employes: [employeId],
      });
      mockRutaSvc.findAllByEmpresa.mockResolvedValue([{ _id: rutaId2 }]);
      mockRutaSvc.delete.mockResolvedValue(true);
      mockAuthSvc.deleteManyByEmpresa.mockResolvedValue(2);
      mockEmpresaModel.findByIdAndDelete.mockResolvedValue({ _id: empId });

      const result = await service.remove(empresaId);

      expect(mockRutaSvc.delete).toHaveBeenCalledWith(rutaId1.toString());
      expect(mockRutaSvc.delete).toHaveBeenCalledWith(rutaId2.toString());
      expect(mockAuthSvc.deleteManyByEmpresa).toHaveBeenCalledWith(
        empresaId,
        expect.any(Array),
      );
      expect(mockConnection.collection).toHaveBeenCalledWith('cobrador_tracking');
      expect(mockEmpresaModel.findByIdAndDelete).toHaveBeenCalledWith(empresaId);
      expect(result.message).toMatch(/Empresa eliminada/i);
    });

    it('lanza NotFoundException si la empresa no existe', async () => {
      mockEmpresaModel.findById.mockResolvedValue(null);

      await expect(service.remove(empresaId)).rejects.toThrow(NotFoundException);
    });

    it('continúa si una ruta ya no existe', async () => {
      const rutaId = new Types.ObjectId();
      mockEmpresaModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(empresaId),
        rutas: [rutaId],
        employes: [],
      });
      mockRutaSvc.findAllByEmpresa.mockResolvedValue([]);
      mockRutaSvc.delete.mockRejectedValue(new NotFoundException('gone'));
      mockAuthSvc.deleteManyByEmpresa.mockResolvedValue(0);
      mockEmpresaModel.findByIdAndDelete.mockResolvedValue({});

      const result = await service.remove(empresaId);

      expect(result.message).toMatch(/Empresa eliminada/i);
      expect(mockEmpresaModel.findByIdAndDelete).toHaveBeenCalled();
    });
  });

  describe('assignRuta', () => {
    const rutaId = new Types.ObjectId().toString();
    const toEmpresaId = new Types.ObjectId().toString();

    it('asigna ruta huérfana a empresa', async () => {
      mockEmpresaModel.findById.mockResolvedValue({ _id: toEmpresaId });
      mockRutaSvc.getEmpresaIdByRutaId.mockResolvedValue({
        exists: true,
        empresaId: null,
      });
      mockRutaSvc.setEmpresa.mockResolvedValue(undefined);
      mockEmpresaModel.findByIdAndUpdate.mockResolvedValue({});

      const result = await service.assignRuta({ rutaId, empresaId: toEmpresaId });

      expect(mockRutaSvc.setEmpresa).toHaveBeenCalledWith(rutaId, toEmpresaId, mockSession);
      expect(mockEmpresaModel.findByIdAndUpdate).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(result.message).toMatch(/asignada/i);
    });

    it('rechaza si la ruta ya tiene empresa', async () => {
      mockEmpresaModel.findById.mockResolvedValue({ _id: toEmpresaId });
      mockRutaSvc.getEmpresaIdByRutaId.mockResolvedValue({
        exists: true,
        empresaId: new Types.ObjectId().toString(),
      });

      await expect(
        service.assignRuta({ rutaId, empresaId: toEmpresaId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si la ruta no existe', async () => {
      mockEmpresaModel.findById.mockResolvedValue({ _id: toEmpresaId });
      mockRutaSvc.getEmpresaIdByRutaId.mockResolvedValue({ exists: false });

      await expect(
        service.assignRuta({ rutaId, empresaId: toEmpresaId }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
