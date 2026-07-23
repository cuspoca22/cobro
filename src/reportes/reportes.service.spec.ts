import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';

import { ReportesService } from './reportes.service';
import { EmpresaService } from '../empresa/empresa.service';
import { RutaService } from '../ruta/ruta.service';
import { ClienteService } from '../cliente/cliente.service';
import { CreditoService } from '../credito/credito.service';
import { CajaService } from '../caja/caja.service';
import { MovimientoCajaService } from '../movimientoCaja/movimiento-caja.service';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

import * as nodemailer from 'nodemailer';

describe('ReportesService backup', () => {
  let service: ReportesService;
  let mockEmpresaService: {
    findByIdLean: jest.Mock;
  };
  let mockRutaService: {
    findLean: jest.Mock;
  };
  let mockCreditoService: {
    aggregatePipeline: jest.Mock;
  };
  let mockConfigService: {
    get: jest.Mock;
  };

  const empresaId = new Types.ObjectId().toString();
  const rutaId = new Types.ObjectId();

  beforeEach(async () => {
    mockEmpresaService = {
      findByIdLean: jest.fn(),
    };
    mockRutaService = {
      findLean: jest.fn(),
    };
    mockCreditoService = {
      aggregatePipeline: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportesService,
        { provide: EmpresaService, useValue: mockEmpresaService },
        { provide: RutaService, useValue: mockRutaService },
        { provide: ClienteService, useValue: {} },
        { provide: CreditoService, useValue: mockCreditoService },
        { provide: CajaService, useValue: {} },
        { provide: MovimientoCajaService, useValue: {} },
        { provide: DateFnsAdapter, useValue: {} },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(ReportesService);
    jest.clearAllMocks();
  });

  function mockEmpresaConRutas() {
    mockEmpresaService.findByIdLean.mockResolvedValue({
      name: 'Empresa Demo',
      email: 'demo@empresa.com',
      rutas: [rutaId],
    });
    mockRutaService.findLean.mockResolvedValue([
      {
        _id: rutaId,
        nombre: 'Ruta Centro',
        timeZone: 'America/Guatemala',
        currency: 'GTQ',
      },
    ]);
  }

  describe('buildEmpresaBackupCsv', () => {
    it('genera CSV con encabezados cuando no hay créditos', async () => {
      mockEmpresaConRutas();
      mockCreditoService.aggregatePipeline.mockResolvedValue([]);

      const buffer = await service.buildEmpresaBackupCsv(empresaId);
      const csv = buffer.toString('utf-8');

      expect(csv).toContain('ruta,cliente,alias,dpi,telefono');
      expect(csv).toContain('valor_credito,total_pagar,valor_cuota,status');
      expect(csv).toContain('mora_adeudada,mora_cobrada');
      expect(mockCreditoService.aggregatePipeline).toHaveBeenCalled();
    });

    it('incluye filas de créditos en el CSV', async () => {
      mockEmpresaConRutas();
      mockCreditoService.aggregatePipeline.mockResolvedValue([
        {
          ruta: 'Ruta Centro',
          cliente: 'Juan Perez',
          alias: 'Juan',
          dpi: '123',
          telefono: '555',
          valor_credito: 1000,
          total_pagar: 1200,
          valor_cuota: 100,
          status: true,
          fecha_inicio: new Date('2026-01-01T00:00:00.000Z'),
          dueDate: new Date('2026-01-15T00:00:00.000Z'),
          state: 'BUENO',
          frecuencia_cobro: 'DIARIO',
          mora_adeudada: 10,
          mora_cobrada: 5,
        },
      ]);

      const csv = (await service.buildEmpresaBackupCsv(empresaId)).toString('utf-8');

      expect(csv).toContain('Juan Perez');
      expect(csv).toContain('Ruta Centro');
      expect(csv).toContain('activo');
      expect(csv).toContain('10');
    });

    it('empresa sin rutas genera CSV vacío de datos (solo header)', async () => {
      mockEmpresaService.findByIdLean.mockResolvedValue({
        name: 'Sin Rutas',
        rutas: [],
      });
      mockRutaService.findLean.mockResolvedValue([]);

      const csv = (await service.buildEmpresaBackupCsv(empresaId)).toString('utf-8');

      expect(csv.split('\n').filter(Boolean).length).toBe(1);
      expect(mockCreditoService.aggregatePipeline).not.toHaveBeenCalled();
    });
  });

  describe('sendEmpresaBackupEmail', () => {
    it('rechaza si la empresa no existe', async () => {
      mockEmpresaService.findByIdLean.mockResolvedValue(null);

      await expect(
        service.sendEmpresaBackupEmail(empresaId, 'a@b.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza email destino inválido', async () => {
      mockEmpresaService.findByIdLean.mockResolvedValue({
        name: 'Demo',
        email: '',
      });

      await expect(service.sendEmpresaBackupEmail(empresaId)).rejects.toThrow(
        /Email destino inválido/,
      );
    });

    it('rechaza si SMTP no está configurado', async () => {
      mockEmpresaService.findByIdLean.mockResolvedValue({
        name: 'Demo',
        email: 'demo@empresa.com',
      });
      mockConfigService.get.mockReturnValue(undefined);

      await expect(service.sendEmpresaBackupEmail(empresaId)).rejects.toThrow(
        /SMTP no configurado/,
      );
    });

    it('envía correo con adjunto CSV cuando SMTP está ok', async () => {
      mockEmpresaConRutas();
      mockCreditoService.aggregatePipeline.mockResolvedValue([]);
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          SMTP_HOST: 'smtp.test',
          SMTP_PORT: '587',
          SMTP_USER: 'user',
          SMTP_PASS: 'pass',
          SMTP_FROM: 'from@test.com',
        };
        return map[key];
      });

      const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

      const ok = await service.sendEmpresaBackupEmail(empresaId, 'destino@test.com');

      expect(ok).toBe(true);
      expect(nodemailer.createTransport).toHaveBeenCalled();
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'destino@test.com',
          from: 'from@test.com',
          attachments: [
            expect.objectContaining({
              filename: expect.stringContaining('backup.csv'),
              contentType: 'text/csv',
            }),
          ],
        }),
      );
    });
  });
});
